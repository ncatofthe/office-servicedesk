const prisma = require('../prisma/prisma.js');
const { canReadAllTickets } = require('../utils/roles.js');

const EXCLUDE_UNION_CHILD_TASKS_WHERE = {
    mergeChildLinks: {
        none: {
            mergeMode: 'UNION'
        }
    }
};

const getDashboard = async(user) => {
    const hasGlobalScope = canReadAllTickets(user.role);

    // Build where clause based on role
    let taskWhere = {
        ...EXCLUDE_UNION_CHILD_TASKS_WHERE,
        status: { not: 'MERGED' }
    };
    if (!hasGlobalScope) {
        taskWhere = {
            AND: [
                EXCLUDE_UNION_CHILD_TASKS_WHERE,
                { status: { not: 'MERGED' } },
                {
                    OR: [
                        { authorId: user.id },
                        { assignees: { some: { userId: user.id } } }
                    ]
                }
            ]
        };
    }

    // Task KPIs using groupBy
    const statusCounts = await prisma.task.groupBy({
        by: ['status'],
        where: taskWhere,
        _count: { id: true }
    });

    const totalTasks = statusCounts.reduce(function(sum, s) { return sum + s._count.id; }, 0);
    const doneCount = statusCounts.find(function(s) { return s.status === 'DONE'; });
    const newCount = statusCounts.find(function(s) { return s.status === 'NEW'; });
    const inProgressCount = statusCounts.find(function(s) { return s.status === 'IN_PROGRESS'; });
    const reworkCount = statusCounts.find(function(s) { return s.status === 'REWORK'; });
    const reviewCount = statusCounts.find(function(s) { return s.status === 'REVIEW'; });
    const postponedCount = statusCounts.find(function(s) { return s.status === 'POSTPONED'; });
    const doneTotal = doneCount ? doneCount._count.id : 0;
    const newTotal = newCount ? newCount._count.id : 0;
    const inProgressTotal = inProgressCount ? inProgressCount._count.id : 0;
    const reworkTotal = reworkCount ? reworkCount._count.id : 0;
    const reviewTotal = reviewCount ? reviewCount._count.id : 0;
    const postponedTotal = postponedCount ? postponedCount._count.id : 0;
    const pendingCount = newTotal;
    const completionRate = totalTasks > 0 ? ((doneTotal / totalTasks) * 100).toFixed(2) : 0;

    // Monthly productivity (DONE tasks last 12 months)
    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    const doneTasks = await prisma.task.findMany({
        where: {
            ...taskWhere,
            status: 'DONE',
            updatedAt: { gte: yearAgo }
        },
        select: {
            updatedAt: true
        }
    });

    const monthlyMap = {};
    doneTasks.forEach(function(task) {
        const month = task.updatedAt.toISOString().slice(0, 7);
        monthlyMap[month] = (monthlyMap[month] || 0) + 1;
    });

    const monthlyProductivity = Object.entries(monthlyMap)
        .sort(function(a, b) { return b[0].localeCompare(a[0]); })
        .slice(0, 12)
        .map(function(entry) { return { month: entry[0], completed: entry[1] }; })
        .reverse();

    // On time percentage
    const allDoneTasks = await prisma.task.findMany({
        where: {
            ...taskWhere,
            status: 'DONE',
            dueDate: { not: null }
        },
        select: {
            dueDate: true,
            updatedAt: true
        }
    });

    let onTimeCount = 0;
    allDoneTasks.forEach(function(task) {
        if (task.updatedAt <= task.dueDate) {
            onTimeCount++;
        }
    });

    const doneWithDueDateTotal = allDoneTasks.length;
    const onTimePercent = doneWithDueDateTotal > 0 ? ((onTimeCount / doneWithDueDateTotal) * 100).toFixed(2) : 0;

    // Active employees with tasks in progress
    const activeWhere = {
        ...EXCLUDE_UNION_CHILD_TASKS_WHERE,
        status: { in: ['IN_PROGRESS', 'REVIEW', 'REWORK', 'POSTPONED'] }
    };
    if (!hasGlobalScope) {
        activeWhere.assignees = { some: { userId: user.id } };
    }

    const activeTasks = await prisma.taskAssignee.findMany({
        where: {
            task: activeWhere
        },
        include: {
            user: { select: { id: true, name: true, role: true } }
        }
    });

    const activeMap = {};
    activeTasks.forEach(function(ta) {
        const key = ta.user.id;
        if (!activeMap[key]) {
            activeMap[key] = { id: ta.user.id, name: ta.user.name, role: ta.user.role, tasks_count: 0 };
        }
        activeMap[key].tasks_count++;
    });

    const activeEmployees = Object.values(activeMap)
        .sort(function(a, b) { return b.tasks_count - a.tasks_count; })
        .slice(0, 10);

    // Worker of the month
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const workerWhere = {
        ...EXCLUDE_UNION_CHILD_TASKS_WHERE,
        status: 'DONE',
        updatedAt: { gte: currentMonth, lt: nextMonth }
    };
    if (!hasGlobalScope) {
        workerWhere.assignees = { some: { userId: user.id } };
    }

    const workerTasks = await prisma.taskAssignee.findMany({
        where: {
            task: workerWhere
        },
        include: {
            user: { select: { id: true, name: true, role: true } }
        }
    });

    const workerMap = {};
    workerTasks.forEach(function(ta) {
        const key = ta.user.id;
        if (!workerMap[key]) {
            workerMap[key] = { id: ta.user.id, name: ta.user.name, role: ta.user.role, done_count: 0 };
        }
        workerMap[key].done_count++;
    });

    const workerOfMonth = Object.values(workerMap)
        .sort(function(a, b) { return b.done_count - a.done_count; })[0] || null;

    const closeEvents = await prisma.taskTimelineEvent.findMany({
        where: {
            type: 'STATUS_CHANGED',
            task: taskWhere
        },
        include: {
            actor: { select: { id: true, name: true, role: true } },
            task: {
                select: {
                    id: true,
                    ticketNumber: true,
                    title: true,
                    priority: true,
                    status: true,
                    updatedAt: true
                }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
    });

    const recentClosures = closeEvents
        .filter(function(event) {
            return event.metadata && event.metadata.toStatus === 'DONE';
        })
        .slice(0, 10)
        .map(function(event) {
            return {
                id: event.id,
                closedAt: event.createdAt,
                actor: event.actor,
                task: {
                    id: event.task.id,
                    ticketNumber: event.task.ticketNumber,
                    displayNumber: typeof event.task.ticketNumber === 'number' ? `#${event.task.ticketNumber}` : undefined,
                    title: event.task.title,
                    priority: event.task.priority,
                    status: event.task.status
                }
            };
        });

    return {
        kpi: {
            pending: pendingCount,
            inProgress: inProgressTotal + reworkTotal + reviewTotal + postponedTotal,
            completed: doneTotal,
            completionRate: completionRate + '%'
        },
        monthlyProductivity: monthlyProductivity,
        efficiency: {
            onTimePercent: onTimePercent + '%',
            onTimeCount: onTimeCount,
            totalDone: doneWithDueDateTotal
        },
        activeEmployees: activeEmployees,
        workerOfMonth: workerOfMonth,
        recentClosures
    };
};

module.exports = { getDashboard };
