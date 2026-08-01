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

    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const activeWhere = {
        ...EXCLUDE_UNION_CHILD_TASKS_WHERE,
        status: { in: ['IN_PROGRESS', 'REVIEW', 'REWORK', 'POSTPONED'] }
    };
    if (!hasGlobalScope) {
        activeWhere.assignees = { some: { userId: user.id } };
    }
    const workerWhere = {
        ...EXCLUDE_UNION_CHILD_TASKS_WHERE,
        status: 'DONE',
        updatedAt: { gte: currentMonth, lt: nextMonth }
    };
    if (!hasGlobalScope) {
        workerWhere.assignees = { some: { userId: user.id } };
    }

    const [
        statusCounts,
        doneTasks,
        allDoneTasks,
        activeTasks,
        workerTasks,
        closeEvents
    ] = await Promise.all([
        prisma.task.groupBy({
            by: ['status'],
            where: taskWhere,
            _count: { id: true }
        }),
        prisma.task.findMany({
            where: {
                ...taskWhere,
                status: 'DONE',
                updatedAt: { gte: yearAgo }
            },
            select: { updatedAt: true }
        }),
        prisma.task.findMany({
            where: {
                ...taskWhere,
                status: 'DONE',
                dueDate: { not: null }
            },
            select: {
                dueDate: true,
                updatedAt: true
            }
        }),
        prisma.taskAssignee.findMany({
            where: { task: activeWhere },
            include: {
                user: { select: { id: true, name: true, avatar: true, role: true } }
            }
        }),
        prisma.taskAssignee.findMany({
            where: { task: workerWhere },
            include: {
                user: { select: { id: true, name: true, avatar: true, role: true } }
            }
        }),
        prisma.taskTimelineEvent.findMany({
            where: {
                type: 'STATUS_CHANGED',
                task: taskWhere
            },
            include: {
                actor: { select: { id: true, name: true, avatar: true, role: true } },
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
        })
    ]);

    const statusMap = new Map(statusCounts.map((entry) => [entry.status, entry._count.id]));
    const totalTasks = statusCounts.reduce((sum, entry) => sum + entry._count.id, 0);
    const doneTotal = statusMap.get('DONE') || 0;
    const newTotal = statusMap.get('NEW') || 0;
    const inProgressTotal = statusMap.get('IN_PROGRESS') || 0;
    const reworkTotal = statusMap.get('REWORK') || 0;
    const reviewTotal = statusMap.get('REVIEW') || 0;
    const postponedTotal = statusMap.get('POSTPONED') || 0;
    const completionRate = totalTasks > 0 ? ((doneTotal / totalTasks) * 100).toFixed(2) : 0;

    const monthlyMap = {};
    doneTasks.forEach((task) => {
        const month = task.updatedAt.toISOString().slice(0, 7);
        monthlyMap[month] = (monthlyMap[month] || 0) + 1;
    });
    const monthlyProductivity = Object.entries(monthlyMap)
        .sort((left, right) => right[0].localeCompare(left[0]))
        .slice(0, 12)
        .map(([month, completed]) => ({ month, completed }))
        .reverse();

    const onTimeCount = allDoneTasks.reduce(
        (count, task) => count + (task.updatedAt <= task.dueDate ? 1 : 0),
        0
    );
    const doneWithDueDateTotal = allDoneTasks.length;
    const onTimePercent = doneWithDueDateTotal > 0
        ? ((onTimeCount / doneWithDueDateTotal) * 100).toFixed(2)
        : 0;

    const activeMap = {};
    activeTasks.forEach((taskAssignee) => {
        const { user: assignedUser } = taskAssignee;
        if (!activeMap[assignedUser.id]) {
            activeMap[assignedUser.id] = {
                id: assignedUser.id,
                name: assignedUser.name,
                avatar: assignedUser.avatar,
                role: assignedUser.role,
                tasks_count: 0
            };
        }
        activeMap[assignedUser.id].tasks_count += 1;
    });
    const activeEmployees = Object.values(activeMap)
        .sort((left, right) => right.tasks_count - left.tasks_count)
        .slice(0, 10);

    const workerMap = {};
    workerTasks.forEach((taskAssignee) => {
        const { user: assignedUser } = taskAssignee;
        if (!workerMap[assignedUser.id]) {
            workerMap[assignedUser.id] = {
                id: assignedUser.id,
                name: assignedUser.name,
                avatar: assignedUser.avatar,
                role: assignedUser.role,
                done_count: 0
            };
        }
        workerMap[assignedUser.id].done_count += 1;
    });
    const workerOfMonth = Object.values(workerMap)
        .sort((left, right) => right.done_count - left.done_count)[0] || null;

    const recentClosures = closeEvents
        .filter((event) => event.metadata && event.metadata.toStatus === 'DONE')
        .slice(0, 10)
        .map((event) => ({
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
        }));

    return {
        kpi: {
            pending: newTotal,
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
