const prisma = require('../prisma/prisma.js');
const { USER_NAME_ROLE_SELECT } = require('../utils/user.select.js');
const { canReadReports } = require('../utils/roles.js');

const EXCLUDE_UNION_CHILD_TASKS_WHERE = {
    mergeChildLinks: {
        none: {
            mergeMode: 'UNION'
        }
    }
};

const buildDateFilter = ({ startDate, endDate }) => {
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    return dateFilter;
};

const countBy = (items, keyGetter) => {
    const map = {};
    for (const item of items) {
        const key = keyGetter(item);
        if (!key) continue;
        map[key] = (map[key] || 0) + 1;
    }
    return map;
};

const toSortedCountArray = (counts, keyName, countName) => Object.entries(counts)
    .map(([key, count]) => ({ [keyName]: key, [countName]: count }))
    .sort((left, right) => right[countName] - left[countName]);

const getReports = async(user, params = {}) => {
    if (!canReadReports(user.role)) {
        throw new Error('Access denied');
    }

    const { startDate, endDate } = params;
    const dateFilter = buildDateFilter({ startDate, endDate });
    const hasDateFilter = Object.keys(dateFilter).length > 0;
    const taskWhere = {
        status: { not: 'MERGED' },
        ...EXCLUDE_UNION_CHILD_TASKS_WHERE,
        ...(hasDateFilter ? { createdAt: dateFilter } : {})
    };

    const [users, tasks, comments] = await Promise.all([
        prisma.user.findMany({
            select: { id: true, name: true, role: true, department: true }
        }),
        prisma.task.findMany({
            where: taskWhere,
            include: {
                folder: { select: { id: true, name: true } },
                assignees: { include: { user: { select: USER_NAME_ROLE_SELECT } } },
                author: { select: USER_NAME_ROLE_SELECT }
            }
        }),
        prisma.taskComment.findMany({
            where: hasDateFilter ? { createdAt: dateFilter } : {},
            select: { createdAt: true, visibility: true }
        })
    ]);

    const statusCounts = toSortedCountArray(
        countBy(tasks, (task) => task.status),
        'status',
        'count'
    );

    const folderCounts = {};
    for (const task of tasks) {
        const folderName = task.folder?.name || 'Без папки';
        if (!folderCounts[folderName]) {
            folderCounts[folderName] = {
                folderId: task.folder?.id || null,
                folderName,
                total: 0,
                open: 0,
                done: 0
            };
        }
        folderCounts[folderName].total += 1;
        if (task.status === 'DONE') {
            folderCounts[folderName].done += 1;
        } else {
            folderCounts[folderName].open += 1;
        }
    }

    const workloadByFolder = Object.values(folderCounts)
        .sort((left, right) => right.total - left.total);

    const completionRatings = users.map((u) => {
        const userTasks = tasks.filter((task) =>
            task.authorId === u.id || task.assignees.some((assignee) => assignee.userId === u.id)
        );
        const done = userTasks.filter((task) => task.status === 'DONE').length;
        const total = userTasks.length;
        const completionPercent = total > 0 ? Number(((done / total) * 100).toFixed(2)) : 0;

        return {
            id: u.id,
            name: u.name,
            role: u.role,
            department: u.department,
            done,
            total,
            completionPercent
        };
    }).sort((left, right) => right.completionPercent - left.completionPercent);

    const now = new Date();
    const overdueTasks = tasks.filter((task) => {
        if (!task.dueDate || task.status === 'DONE') return false;
        return new Date(task.dueDate) < now;
    });
    const overdueByAuthor = countBy(overdueTasks, (task) => task.authorId);
    const overdue = users
        .filter((u) => overdueByAuthor[u.id])
        .map((u) => ({
            id: u.id,
            name: u.name,
            overdue_count: overdueByAuthor[u.id]
        }))
        .sort((left, right) => right.overdue_count - left.overdue_count);

    const commentsByMonth = {};
    for (const comment of comments) {
        const month = comment.createdAt.toISOString().slice(0, 7);
        if (!commentsByMonth[month]) {
            commentsByMonth[month] = { month, publicComments: 0, internalNotes: 0, comments: 0 };
        }
        commentsByMonth[month].comments += 1;
        if (comment.visibility === 'INTERNAL') {
            commentsByMonth[month].internalNotes += 1;
        } else {
            commentsByMonth[month].publicComments += 1;
        }
    }
    const activity = Object.values(commentsByMonth)
        .sort((left, right) => right.month.localeCompare(left.month))
        .slice(0, 12)
        .reverse();

    const doneTasksWithResolution = tasks.filter((task) =>
        task.status === 'DONE' && task.resolutionDueAt
    );
    const resolutionMet = doneTasksWithResolution.filter((task) =>
        task.resolvedAt && task.resolvedAt <= task.resolutionDueAt
    ).length;
    const onTimePercent = doneTasksWithResolution.length > 0
        ? Number(((resolutionMet / doneTasksWithResolution.length) * 100).toFixed(2))
        : 0;

    const slaSummary = {
        firstResponse: {
            pending: tasks.filter((task) => task.slaFirstResponseStatus === 'PENDING').length,
            met: tasks.filter((task) => task.slaFirstResponseStatus === 'MET').length,
            breached: tasks.filter((task) => task.slaFirstResponseStatus === 'BREACHED').length
        },
        resolution: {
            pending: tasks.filter((task) => task.slaResolutionStatus === 'PENDING').length,
            met: tasks.filter((task) => task.slaResolutionStatus === 'MET').length,
            breached: tasks.filter((task) => task.slaResolutionStatus === 'BREACHED').length
        }
    };

    return {
        statusCounts,
        workloadByFolder,
        completionRatings,
        overdue,
        activity,
        onTimePercent,
        slaSummary
    };
};

module.exports = { getReports };
