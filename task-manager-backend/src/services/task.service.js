const fs = require('fs');
const path = require('path');
const prisma = require('../prisma/prisma.js');
const { uploadsDir } = require('../middlewares/upload.middleware.js');
const notificationService = require('./notification.service.js');
const automationService = require('./automation.service.js');
const commentService = require('./comment.service.js');
const productSettingsService = require('./product-settings.service.js');
const {
    recordTimelineEvent,
    safeRecordTimelineEvent
} = require('./timeline.service.js');
const {
    TASK_SLA_POLICY_SELECT,
    buildResolutionStatusForTask,
    buildTaskSlaSnapshot
} = require('./sla.service.js');
const { USER_NAME_SELECT, USER_NAME_ROLE_SELECT, USER_PUBLIC_SELECT } = require('../utils/user.select.js');
const { DEPARTMENT_PUBLIC_SELECT } = require('../utils/department-membership.js');
const { resolveTaskServiceDeskReferences } = require('../utils/task-servicedesk-refs.js');
const {
    buildStoredAttachmentPath,
    mapAttachmentToDownloadPath,
    resolveStoredAttachmentFilename
} = require('../utils/attachment.utils.js');
const {
    isAdminRole,
    isAgentRole,
    isRequesterRole,
    isViewerRole
} = require('../utils/roles.js');
const {
    buildAgentTaskAccessWhere,
    getTaskAccessContext,
    hasAgentFolderAccess,
    hasTaskAccess
} = require('../utils/team-folder-access.js');

const LEGACY_ACTIVE_STATUSES = ['REVIEW', 'POSTPONED', 'REWORK'];
const WORKFLOW_STATUSES = ['NEW', 'IN_PROGRESS', 'DONE'];
const DEFAULT_TASK_LIST_LIMIT = 25;
const MAX_TASK_LIST_LIMIT = 100;
const STATUS_TRANSITIONS = {
    NEW: ['IN_PROGRESS'],
    IN_PROGRESS: ['DONE'],
    REVIEW: ['IN_PROGRESS', 'DONE'],
    DONE: [],
    POSTPONED: ['IN_PROGRESS'],
    REWORK: ['IN_PROGRESS', 'DONE'],
    MERGED: []
};
const TASK_OWNERSHIP_LOCKED_ERROR = 'Task is assigned to another agent';
const TASK_REASSIGN_ADMIN_ONLY_ERROR = 'Only administrators can reassign tasks';
const TASK_SERVICEDESK_FIELDS = ['folderId', 'entityId', 'typeId', 'subtypeId'];
const TASK_UPDATE_FIELDS = ['title', 'description', 'priority', 'startDate', 'dueDate', 'progress', 'departmentId', 'requesterCloseRequired', 'assigneeIds', ...TASK_SERVICEDESK_FIELDS];
const TASK_UPDATE_MUTABLE_FIELDS = ['title', 'description', 'priority', 'startDate', 'dueDate', 'progress', 'departmentId', 'requesterCloseRequired'];
const TASK_SUMMARY_INCLUDE = {
    department: {
        select: DEPARTMENT_PUBLIC_SELECT
    },
    folder: {
        select: {
            id: true,
            name: true,
            description: true,
            isActive: true
        }
    },
    entity: {
        select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true
        }
    },
    type: {
        select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,
            folderId: true,
            entityId: true
        }
    },
    subtype: {
        select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,
            typeId: true,
            folderId: true
        }
    },
    slaPolicy: {
        select: TASK_SLA_POLICY_SELECT
    },
    author: { select: USER_PUBLIC_SELECT },
    assignees: { include: { user: { select: USER_NAME_ROLE_SELECT } } },
    chatParticipants: {
        select: {
            userId: true,
            createdAt: true,
            user: { select: USER_NAME_ROLE_SELECT }
        }
    },
    externalReferences: {
        select: {
            system: true,
            externalId: true,
            externalNumber: true,
            createdAt: true
        },
        orderBy: { createdAt: 'asc' }
    },
    emailInboundMessages: {
        select: { id: true },
        take: 1
    },
    _count: { select: { comments: true, assignees: true } }
};
const TASK_DETAIL_INCLUDE = {
    ...TASK_SUMMARY_INCLUDE,
    attachments: true,
    reviews: {
        include: {
            reviewer: {
                select: USER_NAME_ROLE_SELECT
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 1
    }
};
const TASK_BRIEF_SELECT = {
    id: true,
    ticketNumber: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    sourceChannel: true,
    folderId: true,
    entityId: true,
    typeId: true,
    subtypeId: true,
    slaPolicyId: true,
    firstResponseDueAt: true,
    resolutionDueAt: true,
    firstResponseAt: true,
    resolvedAt: true,
    slaFirstResponseStatus: true,
    slaResolutionStatus: true,
    authorId: true,
    requesterCloseRequired: true,
    requesterCloseApprovedAt: true,
    requesterCloseApprovedById: true,
    createdAt: true,
    updatedAt: true
};
const EXCLUDE_UNION_CHILD_TASKS_WHERE = {
    mergeChildLinks: {
        none: {
            mergeMode: 'UNION'
        }
    }
};
const TASK_MERGE_SELECT = {
    id: true,
    masterTaskId: true,
    childTaskId: true,
    mergeMode: true,
    mergedBy: true,
    mergedAt: true,
    reason: true,
    masterTask: { select: TASK_BRIEF_SELECT },
    childTask: { select: TASK_BRIEF_SELECT },
    mergedByUser: {
        select: {
            id: true,
            name: true,
            role: true
        }
    }
};
const CLOSE_APPROVAL_SELECT = {
    id: true,
    taskId: true,
    userId: true,
    approvedAt: true,
    user: {
        select: {
            id: true,
            name: true,
            role: true
        }
    }
};

const toHistoryJsonValue = (value) => {
    if (value === undefined) return null;
    return JSON.parse(JSON.stringify(value));
};

const deleteStoredAttachmentFileIfPresent = (storedPath) => {
    const filename = resolveStoredAttachmentFilename(storedPath);
    if (!filename) {
        return;
    }

    const absolutePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(absolutePath)) {
        return;
    }

    try {
        fs.unlinkSync(absolutePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[uploads] Failed to delete attachment file during task deletion', {
                storedPath,
                absolutePath,
                error: error.message
            });
        }
    }
};

const buildStatusFilter = (status) => {
    if (!status) {
        return { not: 'MERGED' };
    }

    if (status === 'IN_PROGRESS') {
        return { in: ['IN_PROGRESS', ...LEGACY_ACTIVE_STATUSES] };
    }

    return status;
};

const createHistory = async(taskId, userId, field, oldValue, newValue, db = prisma) => {
    await db.taskHistory.create({
        data: {
            taskId,
            userId,
            field,
            oldValue: toHistoryJsonValue(oldValue),
            newValue: toHistoryJsonValue(newValue)
        }
    });
};

const loadUsersByIds = async(ids, db = prisma) => {
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    if (uniqueIds.length === 0) {
        return [];
    }

    return db.user.findMany({
        where: {
            id: {
                in: uniqueIds
            }
        },
        select: {
            id: true,
            name: true,
            role: true,
            isActive: true,
            email: true
        }
    });
};

const assertAssignableAssigneeIds = async(ids, db = prisma) => {
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    if (uniqueIds.length === 0) {
        return [];
    }

    const users = await loadUsersByIds(uniqueIds, db);
    if (users.length !== uniqueIds.length) {
        throw new Error('Один или несколько исполнителей не найдены.');
    }

    const invalidUsers = users.filter((user) => (
        !user.isActive || (!isAdminRole(user.role) && !isAgentRole(user.role))
    ));
    if (invalidUsers.length > 0) {
        throw new Error('Исполнителем можно назначить только активного администратора или исполнителя.');
    }

    return uniqueIds;
};

const assertTaskReadAccess = async(task, user, db = prisma) => {
    if (!task) {
        throw new Error('Task not found');
    }

    const context = await getTaskAccessContext(user, db);
    if (!hasTaskAccess(task, user, context)) {
        throw new Error('Access denied');
    }
};

const assertTaskFolderManagementAccess = async(task, actor, db = prisma) => {
    if (!task) {
        throw new Error('Task not found');
    }

    const context = await getTaskAccessContext(actor, db);

    if (context.isAdmin) {
        return context;
    }

    if (!context.isAgent || (task.folderId && !hasAgentFolderAccess(task, context.accessibleFolderIds))) {
        throw new Error('Access denied');
    }

    return context;
};

const assertTaskOperationalAccess = async(task, actor, db = prisma) => {
    if (!task) {
        throw new Error('Task not found');
    }

    const context = await getTaskAccessContext(actor, db);

    if (!context.isAdmin && !context.isAgent) {
        throw new Error('Access denied');
    }

    if (!hasTaskAccess(task, actor, context)) {
        throw new Error('Access denied');
    }

    return context;
};

const assertMergeAccess = async(masterTask, actor, db = prisma) => {
    if (!masterTask) {
        throw new Error('Task not found');
    }

    const context = await getTaskAccessContext(actor, db);
    if (context.isAdmin) {
        return;
    }

    if (!context.isAgent || !hasTaskAccess(masterTask, actor, context)) {
        throw new Error('Access denied');
    }
};

const mapTaskBrief = (task, overrides = {}) => {
    if (!task) return null;
    const ticketNumber = Object.prototype.hasOwnProperty.call(overrides, 'ticketNumber')
        ? overrides.ticketNumber
        : task.ticketNumber;
    const status = Object.prototype.hasOwnProperty.call(overrides, 'status')
        ? overrides.status
        : task.status;

    return {
        id: task.id,
        ticketNumber,
        displayNumber: typeof ticketNumber === 'number' ? `#${ticketNumber}` : undefined,
        title: task.title,
        description: task.description,
        status,
        priority: task.priority,
        folderId: task.folderId,
        entityId: task.entityId,
        typeId: task.typeId,
        subtypeId: task.subtypeId,
        authorId: task.authorId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
    };
};

const mapMergeRecord = (record) => {
    const unionChildOverrides = record.mergeMode === 'UNION' && record.masterTask
        ? {
            ticketNumber: record.masterTask.ticketNumber,
            status: record.masterTask.status
        }
        : {};

    return {
        id: record.id,
        masterTaskId: record.masterTaskId,
        childTaskId: record.childTaskId,
        mergeMode: record.mergeMode,
        mergedBy: record.mergedBy,
        mergedAt: record.mergedAt,
        reason: record.reason,
        masterTask: mapTaskBrief(record.masterTask),
        childTask: mapTaskBrief(record.childTask, unionChildOverrides),
        mergedByUser: record.mergedByUser
            ? {
                id: record.mergedByUser.id,
                name: record.mergedByUser.name,
                role: record.mergedByUser.role
            }
            : null
    };
};

const getMergeInfoForTask = async(taskId, db = prisma) => {
    const [asMaster, asChild, closeApprovals, assignees] = await Promise.all([
        db.taskMerge.findMany({
            where: { masterTaskId: taskId },
            select: TASK_MERGE_SELECT,
            orderBy: { mergedAt: 'desc' }
        }),
        db.taskMerge.findMany({
            where: { childTaskId: taskId },
            select: TASK_MERGE_SELECT,
            orderBy: { mergedAt: 'desc' }
        }),
        db.taskCloseApproval.findMany({
            where: { taskId },
            select: CLOSE_APPROVAL_SELECT,
            orderBy: { approvedAt: 'asc' }
        }),
        db.taskAssignee.findMany({
            where: { taskId },
            select: { userId: true }
        })
    ]);

    const assigneeIds = assignees.map((assignee) => assignee.userId);
    const approvedAssigneeIds = closeApprovals
        .filter((approval) => assigneeIds.includes(approval.userId))
        .map((approval) => approval.userId);
    const pendingAssigneeIds = assigneeIds.filter((userId) => !approvedAssigneeIds.includes(userId));
    const unionChildren = asMaster.filter((record) => record.mergeMode === 'UNION');
    const primaryParentLink = asChild.find((record) => record.mergeMode === 'UNION') || asChild[0] || null;

    return {
        masterTaskId: primaryParentLink ? primaryParentLink.masterTaskId : taskId,
        masterTask: primaryParentLink ? mapTaskBrief(primaryParentLink.masterTask) : null,
        isMaster: asMaster.length > 0,
        isChild: asChild.length > 0,
        linkedTasks: asMaster.filter((record) => record.mergeMode === 'LINK').map(mapMergeRecord),
        mergedTasks: unionChildren.map(mapMergeRecord),
        parentLinks: asChild.map(mapMergeRecord),
        closeApproval: {
            required: unionChildren.length > 0 && assigneeIds.length > 1,
            assigneeIds,
            approvedAssigneeIds,
            pendingAssigneeIds,
            approvals: closeApprovals.map((approval) => ({
                id: approval.id,
                taskId: approval.taskId,
                userId: approval.userId,
                approvedAt: approval.approvedAt,
                user: approval.user
                    ? {
                        id: approval.user.id,
                        name: approval.user.name,
                        role: approval.user.role
                    }
                    : null
            }))
        }
    };
};

const getCloseApprovalState = async(taskId, db = prisma) => {
    const info = await getMergeInfoForTask(taskId, db);
    return info.closeApproval;
};

const assertCoordinatedCloseReady = async(task, db = prisma) => {
    if (task.requesterCloseRequired && !task.requesterCloseApprovedAt) {
        throw new Error('Для этой заявки требуется подтверждение закрытия заявителем.');
    }

    const approvalState = await getCloseApprovalState(task.id, db);
    if (!approvalState.required) {
        return approvalState;
    }

    if (approvalState.pendingAssigneeIds.length > 0) {
        throw new Error('Для закрытия объединённой мастер-заявки нужны подтверждения всех назначенных исполнителей.');
    }

    return approvalState;
};

const getUnionParentLink = async(taskId, db = prisma) => db.taskMerge.findFirst({
    where: {
        childTaskId: taskId,
        mergeMode: 'UNION'
    },
    select: {
        id: true,
        masterTaskId: true,
        masterTask: {
            select: TASK_BRIEF_SELECT
        }
    }
});

const getUnionChildTasks = async(masterTaskId, db = prisma) => {
    const links = await db.taskMerge.findMany({
        where: {
            masterTaskId,
            mergeMode: 'UNION'
        },
        select: {
            childTask: {
                select: {
                    id: true,
                    ticketNumber: true,
                    title: true,
                    status: true,
                    resolutionDueAt: true,
                    resolvedAt: true,
                    authorId: true,
                    assignees: {
                        select: {
                            userId: true
                        }
                    }
                }
            }
        }
    });

    return links
        .map((link) => link.childTask)
        .filter(Boolean);
};

const syncUnionChildStatuses = async(masterTaskId, nextStatus, actorId, db = prisma) => {
    const childTasks = await getUnionChildTasks(masterTaskId, db);
    const now = new Date();

    for (const childTask of childTasks) {
        if (!childTask || childTask.status === nextStatus) {
            continue;
        }

        const slaUpdate = buildResolutionStatusForTask(childTask, nextStatus, now);

        await createHistory(childTask.id, actorId, 'status', childTask.status, nextStatus, db);
        await db.task.update({
            where: { id: childTask.id },
            data: {
                status: nextStatus,
                resolvedAt: slaUpdate.resolvedAt,
                slaResolutionStatus: slaUpdate.slaResolutionStatus
            }
        });
    }
};

const resolveTaskDepartmentId = async(db, departmentId) => {
    if (departmentId === undefined) {
        return undefined;
    }

    if (departmentId === null) {
        return null;
    }

    if (typeof departmentId !== 'string' || departmentId.trim().length === 0) {
        throw new Error('departmentId must be a non-empty string or null');
    }

    const department = await db.department.findFirst({
        where: {
            id: departmentId,
            isActive: true
        },
        select: { id: true }
    });

    if (!department) {
        throw new Error('Department not found');
    }

    return department.id;
};

const buildPersistedSlaFieldsForTaskState = async(taskState, db = prisma, now = new Date()) => {
    const snapshot = await buildTaskSlaSnapshot({
        folderId: taskState.folderId ?? null,
        typeId: taskState.typeId ?? null,
        subtypeId: taskState.subtypeId ?? null,
        priority: taskState.priority ?? 'MEDIUM',
        createdAt: taskState.createdAt,
        firstResponseAt: taskState.firstResponseAt ?? null,
        resolvedAt: taskState.resolvedAt ?? null
    }, db, { now });

    return {
        slaPolicyId: snapshot.slaPolicyId,
        firstResponseDueAt: snapshot.firstResponseDueAt,
        resolutionDueAt: snapshot.resolutionDueAt,
        firstResponseAt: snapshot.firstResponseAt,
        resolvedAt: snapshot.resolvedAt,
        slaFirstResponseStatus: snapshot.slaFirstResponseStatus,
        slaResolutionStatus: snapshot.slaResolutionStatus
    };
};

const normalizeListInteger = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

const buildTaskListSearchFilter = (rawSearch) => {
    const search = String(rawSearch || '').trim().slice(0, 255);
    if (!search) return null;

    const ticketNumberCandidate = search.replace(/^#/, '');
    const ticketNumber = /^\d+$/.test(ticketNumberCandidate)
        ? Number.parseInt(ticketNumberCandidate, 10)
        : null;

    return {
        OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { author: { name: { contains: search, mode: 'insensitive' } } },
            { author: { email: { contains: search, mode: 'insensitive' } } },
            {
                externalReferences: {
                    some: {
                        OR: [
                            { externalId: { contains: search, mode: 'insensitive' } },
                            { externalNumber: { contains: search, mode: 'insensitive' } }
                        ]
                    }
                }
            },
            ...(Number.isSafeInteger(ticketNumber) && ticketNumber > 0 ? [{ ticketNumber }] : [])
        ]
    };
};

const buildTaskListOrderBy = (sortBy, sortOrder) => {
    const direction = sortOrder === 'asc' ? 'asc' : 'desc';
    const fields = {
        created: 'createdAt',
        updated: 'updatedAt',
        number: 'ticketNumber'
    };
    const field = fields[sortBy] || 'updatedAt';
    return [{ [field]: direction }, { ticketNumber: 'desc' }];
};

const getAll = async(user, filters = {}, limit = DEFAULT_TASK_LIST_LIMIT, offset = 0) => {
    const normalizedLimit = normalizeListInteger(limit, DEFAULT_TASK_LIST_LIMIT, {
        min: 1,
        max: MAX_TASK_LIST_LIMIT
    });
    const normalizedOffset = normalizeListInteger(offset, 0, { min: 0 });
    const where = {
        ...EXCLUDE_UNION_CHILD_TASKS_WHERE
    };

    // Common filters
    where.status = buildStatusFilter(filters.status);
    if (filters.priority) where.priority = filters.priority;
    const searchFilter = buildTaskListSearchFilter(filters.search || filters.title);
    if (searchFilter) {
        where.AND = [...(where.AND || []), searchFilter];
    }
    if (filters.authorId) where.authorId = filters.authorId;
    if (filters.assigneeId) where.assignees = { some: { userId: filters.assigneeId } };
    if (filters.folderId) where.folderId = filters.folderId;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.typeId) where.typeId = filters.typeId;
    if (filters.subtypeId) where.subtypeId = filters.subtypeId;
    if (filters.startDateAfter) where.startDate = { gte: new Date(filters.startDateAfter) };
    if (filters.dueDateBefore) where.dueDate = { lte: new Date(filters.dueDateBefore) };
    if (filters.updatedAfter) where.updatedAt = { gte: new Date(filters.updatedAfter) };
    if (filters.channel === 'EMAIL') {
        where.OR = [
            { sourceChannel: 'EMAIL' },
            // Backward compatibility for databases not yet backfilled.
            { emailInboundMessages: { some: {} } }
        ];
    }
    if (filters.channel === 'WEB') {
        where.AND = [
            ...(where.AND || []),
            { sourceChannel: 'WEB' },
            { emailInboundMessages: { none: {} } }
        ];
    }

    // Permissions
    const accessContext = await getTaskAccessContext(user);

    if (accessContext.isRequester) {
        where.AND = [
            ...(where.AND || []),
            {
                OR: [
                    { authorId: user.id },
                    { chatParticipants: { some: { userId: user.id } } }
                ]
            }
        ];
    } else if (accessContext.isAgent && !accessContext.isAdmin) {
        where.AND = [
            ...(where.AND || []),
            buildAgentTaskAccessWhere(user.id, accessContext.accessibleFolderIds)
        ];
    }

    if (filters.scope === 'mine' && !accessContext.isRequester) {
        where.AND = [
            ...(where.AND || []),
            {
                OR: [
                    { authorId: user.id },
                    { assignees: { some: { userId: user.id } } }
                ]
            }
        ];
    }

    const [tasks, total] = await Promise.all([
        prisma.task.findMany({
            where,
            include: TASK_SUMMARY_INCLUDE,
            orderBy: buildTaskListOrderBy(filters.sortBy, filters.sortOrder),
            take: normalizedLimit,
            skip: normalizedOffset
        }),
        prisma.task.count({ where })
    ]);

    return { tasks, total, limit: normalizedLimit, offset: normalizedOffset };
};

const getById = async(id, user) => {
    const task = await prisma.task.findUnique({
        where: { id },
        include: TASK_DETAIL_INCLUDE
    });

    await assertTaskReadAccess(task, user);

    return {
        ...task,
        comments: await commentService.getByTask(id, user),
        attachments: task.attachments.map(mapAttachmentToDownloadPath),
        mergeInfo: await getMergeInfoForTask(id)
    };
};

const runPostCreateEffects = async(createdTaskId, actor, options = {}) => {
    const {
        automationTriggerType = null,
        automationChannel = null,
        automationRequesterEmail = actor?.email || null,
        assigneeIds = []
    } = options;

    if (automationTriggerType) {
        try {
            await automationService.runAutomationRulesForTask({
                taskId: createdTaskId,
                triggerType: automationTriggerType,
                channel: automationChannel,
                requesterEmail: automationRequesterEmail
            });
        } catch (error) {
            console.error('[automation] Failed to execute automation after task creation', {
                taskId: createdTaskId,
                triggerType: automationTriggerType,
                error: error.message
            });
        }
    }

    try {
        await notificationService.notifyTaskCreated(createdTaskId, actor, {
            channel: automationChannel || 'WEB'
        });
        for (const assigneeId of assigneeIds) {
            await notificationService.notifyTaskAssigned(createdTaskId, assigneeId, actor);
        }
    } catch (error) {
        console.error('[notifications] Failed to notify after task creation', {
            taskId: createdTaskId,
            actorId: actor?.id || null,
            error: error.message
        });
    }
};

const create = async(data, actor, options = {}) => {
    const {
        title,
        description,
        priority,
        startDate,
        dueDate,
        departmentId,
        assigneeIds = [],
        status = 'NEW',
        folderId,
        entityId,
        typeId,
        subtypeId,
        sourceChannel = 'WEB'
    } = data;
    const {
        automationTriggerType = null,
        automationChannel = null,
        automationRequesterEmail = actor?.email || null,
        db = prisma,
        skipPostCreateEffects = false
    } = options;
    const productSettings = await productSettingsService.getProductSettings(db);
    const accessContext = await getTaskAccessContext(actor, db);
    const configuredDefaultFolderId = productSettings.defaultFolderId;
    const canUseConfiguredDefaultFolder = !accessContext.isAgent
        || !configuredDefaultFolderId
        || hasAgentFolderAccess(configuredDefaultFolderId, accessContext.accessibleFolderIds);
    const effectiveFolderId = folderId === undefined
        ? (canUseConfiguredDefaultFolder ? configuredDefaultFolderId : null)
        : folderId;
    const effectivePriority = priority === undefined ? productSettings.defaultPriority : priority;
    const resolvedDepartmentId = await resolveTaskDepartmentId(db, departmentId);
    const serviceDeskRefs = await resolveTaskServiceDeskReferences(db, {
        folderId: effectiveFolderId,
        entityId,
        typeId,
        subtypeId
    });
    const createdAt = new Date();
    const resolvedAt = status === 'DONE' ? createdAt : null;
    const slaFields = await buildPersistedSlaFieldsForTaskState({
        folderId: serviceDeskRefs.folderId === undefined ? null : serviceDeskRefs.folderId,
        typeId: serviceDeskRefs.typeId === undefined ? null : serviceDeskRefs.typeId,
        subtypeId: serviceDeskRefs.subtypeId === undefined ? null : serviceDeskRefs.subtypeId,
        priority: effectivePriority,
        createdAt,
        firstResponseAt: null,
        resolvedAt
    }, db);
    if (accessContext.isAgent && serviceDeskRefs.folderId && !hasAgentFolderAccess(serviceDeskRefs.folderId, accessContext.accessibleFolderIds)) {
        throw new Error('Access denied');
    }

    if (!['NEW', 'IN_PROGRESS', 'DONE'].includes(status)) {
        throw new Error('Tasks can only be created in NEW, IN_PROGRESS or DONE status');
    }

    const resolvedAssigneeIds = await assertAssignableAssigneeIds(assigneeIds, db);

    const persistTask = async(tx) => {
        const created = await tx.task.create({
            data: {
                title,
                description,
                priority: effectivePriority,
                sourceChannel: sourceChannel === 'EMAIL' ? 'EMAIL' : 'WEB',
                status,
                startDate: startDate ? new Date(startDate) : null,
                dueDate: dueDate ? new Date(dueDate) : null,
                departmentId: resolvedDepartmentId === undefined ? null : resolvedDepartmentId,
                folderId: serviceDeskRefs.folderId === undefined ? null : serviceDeskRefs.folderId,
                entityId: serviceDeskRefs.entityId === undefined ? null : serviceDeskRefs.entityId,
                typeId: serviceDeskRefs.typeId === undefined ? null : serviceDeskRefs.typeId,
                subtypeId: serviceDeskRefs.subtypeId === undefined ? null : serviceDeskRefs.subtypeId,
                createdAt,
                slaPolicyId: slaFields.slaPolicyId,
                firstResponseDueAt: slaFields.firstResponseDueAt,
                resolutionDueAt: slaFields.resolutionDueAt,
                firstResponseAt: slaFields.firstResponseAt,
                resolvedAt: slaFields.resolvedAt,
                slaFirstResponseStatus: slaFields.slaFirstResponseStatus,
                slaResolutionStatus: slaFields.slaResolutionStatus,
                authorId: actor.id
            },
            select: { id: true }
        });

        if (resolvedAssigneeIds.length > 0) {
            await tx.taskAssignee.createMany({
                data: resolvedAssigneeIds.map((userId) => ({ taskId: created.id, userId })),
                skipDuplicates: true
            });
        }

        await safeRecordTimelineEvent({
            taskId: created.id,
            actorId: actor.id,
            type: 'TASK_CREATED',
            title: 'Заявка создана',
            description: title,
            metadata: {
                status,
                priority: effectivePriority
            },
            createdAt
        }, tx);

        if (resolvedAssigneeIds.length > 0) {
            const assigneeUsers = await loadUsersByIds(resolvedAssigneeIds, tx);
            for (const assigneeUser of assigneeUsers) {
                await safeRecordTimelineEvent({
                    taskId: created.id,
                    actorId: actor.id,
                    type: 'ASSIGNEE_ADDED',
                    title: 'Назначен исполнитель',
                    description: assigneeUser.name,
                    metadata: {
                        assigneeId: assigneeUser.id,
                        assigneeName: assigneeUser.name
                    }
                }, tx);
            }
        }

        if (slaFields.slaPolicyId) {
            await safeRecordTimelineEvent({
                taskId: created.id,
                actorId: actor.id,
                type: 'SLA_POLICY_APPLIED',
                title: 'Применена SLA-политика',
                description: 'SLA рассчитан при создании заявки.',
                metadata: {
                    slaPolicyId: slaFields.slaPolicyId,
                    firstResponseDueAt: slaFields.firstResponseDueAt,
                    resolutionDueAt: slaFields.resolutionDueAt
                }
            }, tx);
        }

        return created;
    };

    const createdTask = typeof db.$transaction === 'function'
        ? await db.$transaction(persistTask)
        : await persistTask(db);

    if (!skipPostCreateEffects) {
        await runPostCreateEffects(createdTask.id, actor, {
            automationTriggerType,
            automationChannel,
            automationRequesterEmail,
            assigneeIds: resolvedAssigneeIds
        });
    }

    return db.task.findUnique({
        where: { id: createdTask.id },
        include: TASK_SUMMARY_INCLUDE
    });
};

const update = async(id, data, actor) => {
    const payload = data || {};
    const invalidFields = Object.keys(payload).filter((field) => !TASK_UPDATE_FIELDS.includes(field));
    if (invalidFields.length > 0) {
        throw new Error(`Unsupported fields: ${invalidFields.join(', ')}`);
    }

    const task = await prisma.task.findUnique({
        where: { id },
        include: {
            assignees: true
        }
    });
    if (!task) throw new Error('Task not found');

    await assertTaskFolderManagementAccess(task, actor);

    const updateData = {};
    for (const field of TASK_UPDATE_MUTABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
            if ((field === 'startDate' || field === 'dueDate') && payload[field] !== null && payload[field] !== undefined) {
                updateData[field] = new Date(payload[field]);
            } else if (field === 'departmentId') {
                updateData[field] = await resolveTaskDepartmentId(prisma, payload[field]);
            } else if (field === 'requesterCloseRequired') {
                updateData[field] = Boolean(payload[field]);
                updateData.requesterCloseApprovedAt = null;
                updateData.requesterCloseApprovedById = null;
            } else {
                updateData[field] = payload[field];
            }
        }
    }

    const hasServiceDeskChanges = TASK_SERVICEDESK_FIELDS.some((field) =>
        Object.prototype.hasOwnProperty.call(payload, field)
    );
    if (hasServiceDeskChanges) {
        const finalServiceDeskRefs = {
            folderId: Object.prototype.hasOwnProperty.call(payload, 'folderId') ? payload.folderId : task.folderId,
            entityId: Object.prototype.hasOwnProperty.call(payload, 'entityId') ? payload.entityId : task.entityId,
            typeId: Object.prototype.hasOwnProperty.call(payload, 'typeId') ? payload.typeId : task.typeId,
            subtypeId: Object.prototype.hasOwnProperty.call(payload, 'subtypeId') ? payload.subtypeId : task.subtypeId
        };
        const resolvedServiceDeskRefs = await resolveTaskServiceDeskReferences(prisma, finalServiceDeskRefs);

        for (const field of TASK_SERVICEDESK_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(payload, field)) {
                updateData[field] = resolvedServiceDeskRefs[field];
            }
        }
    }

    const shouldRecalculateSla = hasServiceDeskChanges
        || Object.prototype.hasOwnProperty.call(payload, 'priority');
    if (shouldRecalculateSla) {
        const nextTaskState = {
            folderId: Object.prototype.hasOwnProperty.call(updateData, 'folderId') ? updateData.folderId : task.folderId,
            typeId: Object.prototype.hasOwnProperty.call(updateData, 'typeId') ? updateData.typeId : task.typeId,
            subtypeId: Object.prototype.hasOwnProperty.call(updateData, 'subtypeId') ? updateData.subtypeId : task.subtypeId,
            priority: Object.prototype.hasOwnProperty.call(updateData, 'priority') ? updateData.priority : task.priority,
            createdAt: task.createdAt,
            firstResponseAt: task.firstResponseAt,
            resolvedAt: task.resolvedAt
        };
        Object.assign(updateData, await buildPersistedSlaFieldsForTaskState(nextTaskState));
    }

    let assigneeIds = null;
    if (Object.prototype.hasOwnProperty.call(payload, 'assigneeIds')) {
        if (!Array.isArray(payload.assigneeIds)) {
            throw new Error('assigneeIds must be an array');
        }
        assigneeIds = [...new Set(payload.assigneeIds.filter(Boolean))];
        assigneeIds = await assertAssignableAssigneeIds(assigneeIds);
        const oldAssigneeIds = task.assignees.map((assignee) => assignee.userId).sort();
        const requestedAssigneeIds = [...assigneeIds].sort();
        if (!isAdminRole(actor.role) && JSON.stringify(oldAssigneeIds) !== JSON.stringify(requestedAssigneeIds)) {
            throw new Error(TASK_REASSIGN_ADMIN_ONLY_ERROR);
        }
        const currentlyAssignedToActor = task.assignees.some((assignee) => assignee.userId === actor.id);
        if (task.status === 'DONE' && isAgentRole(actor.role) && assigneeIds.includes(actor.id) && !currentlyAssignedToActor) {
            throw new Error('Исполнитель не может назначить себя на закрытую заявку.');
        }
    }

    const result = await prisma.$transaction(async(tx) => {
        // Log changes for standard task fields
        for (const [field, newValue] of Object.entries(updateData)) {
            const oldValue = task[field];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                await createHistory(id, actor.id, field, oldValue, newValue, tx);
            }
        }

        const changedFieldNames = Object.keys(updateData).filter((field) =>
            JSON.stringify(task[field]) !== JSON.stringify(updateData[field])
        );

        // Handle assignees separately
        if (assigneeIds !== null) {
            const oldAssigneeIds = task.assignees.map((a) => a.userId).sort();
            const newAssigneeIds = [...assigneeIds].sort();

            if (JSON.stringify(oldAssigneeIds) !== JSON.stringify(newAssigneeIds)) {
                await createHistory(id, actor.id, 'assigneeIds', oldAssigneeIds, newAssigneeIds, tx);
            }

            await tx.taskAssignee.deleteMany({
                where: {
                    taskId: id,
                    ...(assigneeIds.length > 0 ? { userId: { notIn: assigneeIds } } : {})
                }
            });

            if (assigneeIds.length > 0) {
                await tx.taskAssignee.createMany({
                    data: assigneeIds.map((assigneeId) => ({ taskId: id, userId: assigneeId })),
                    skipDuplicates: true
                });
            }

            const addedAssigneeIds = newAssigneeIds.filter((assigneeId) => !oldAssigneeIds.includes(assigneeId));
            const removedAssigneeIds = oldAssigneeIds.filter((assigneeId) => !newAssigneeIds.includes(assigneeId));
            const affectedUsers = await loadUsersByIds([...addedAssigneeIds, ...removedAssigneeIds], tx);
            const usersById = new Map(affectedUsers.map((userItem) => [userItem.id, userItem]));

            for (const addedAssigneeId of addedAssigneeIds) {
                const assigneeUser = usersById.get(addedAssigneeId);
                await safeRecordTimelineEvent({
                    taskId: id,
                    actorId: actor.id,
                    type: 'ASSIGNEE_ADDED',
                    title: 'Назначен исполнитель',
                    description: assigneeUser?.name || null,
                    metadata: {
                        assigneeId: addedAssigneeId,
                        assigneeName: assigneeUser?.name || null
                    }
                }, tx);
            }

            for (const removedAssigneeId of removedAssigneeIds) {
                const assigneeUser = usersById.get(removedAssigneeId);
                await safeRecordTimelineEvent({
                    taskId: id,
                    actorId: actor.id,
                    type: 'ASSIGNEE_REMOVED',
                    title: 'Исполнитель снят',
                    description: assigneeUser?.name || null,
                    metadata: {
                        assigneeId: removedAssigneeId,
                        assigneeName: assigneeUser?.name || null
                    }
                }, tx);
            }
        }

        if (Object.keys(updateData).length > 0) {
            await tx.task.update({
                where: { id },
                data: updateData
            });
        }

        if (changedFieldNames.length > 0) {
            await safeRecordTimelineEvent({
                taskId: id,
                actorId: actor.id,
                type: 'TASK_UPDATED',
                title: 'Заявка обновлена',
                description: `Изменены поля: ${changedFieldNames.join(', ')}`,
                metadata: {
                    changedFields: changedFieldNames
                }
            }, tx);
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'slaPolicyId') && updateData.slaPolicyId) {
            await safeRecordTimelineEvent({
                taskId: id,
                actorId: actor.id,
                type: 'SLA_POLICY_APPLIED',
                title: 'Применена SLA-политика',
                description: 'SLA пересчитан после изменения заявки.',
                metadata: {
                    slaPolicyId: updateData.slaPolicyId,
                    firstResponseDueAt: updateData.firstResponseDueAt,
                    resolutionDueAt: updateData.resolutionDueAt
                }
            }, tx);
        }

        return tx.task.findUnique({
            where: { id },
            include: TASK_SUMMARY_INCLUDE
        });
    });

    if (assigneeIds !== null) {
        const oldAssigneeIds = task.assignees.map((a) => a.userId).sort();
        const newAssigneeIds = [...assigneeIds].sort();
        const addedAssigneeIds = newAssigneeIds.filter((assigneeId) => !oldAssigneeIds.includes(assigneeId));

        for (const assigneeId of addedAssigneeIds) {
            try {
                await notificationService.notifyTaskAssigned(id, assigneeId, actor);
            } catch (error) {
                console.error('[notifications] Failed to notify assignee after task update', {
                    taskId: id,
                    assigneeId,
                    actorId: actor?.id || null,
                    error: error.message
                });
            }
        }
    }

    return result;
};

const updateStatus = async(id, status, user) => {
    const task = await prisma.task.findUnique({
        where: { id },
        include: {
            assignees: true,
            author: { select: USER_NAME_SELECT }
        }
    });
    if (!task) throw new Error('Task not found');

    const unionParentLink = await getUnionParentLink(id);
    if (unionParentLink) {
        throw new Error('Статус объединённой дочерней заявки меняется через мастер-заявку.');
    }

    const accessContext = await assertTaskOperationalAccess(task, user);
    const isAdmin = accessContext.isAdmin;
    const isAssignee = task.assignees.some(a => a.userId === user.id);

    if (isViewerRole(user.role)) {
        throw new Error('Viewers cannot change task status');
    } else if (isRequesterRole(user.role)) {
        throw new Error('Requesters cannot change task status');
    }

    if (!isAdmin && !isAssignee) {
        throw new Error(TASK_OWNERSHIP_LOCKED_ERROR);
    }

    const allowed = isAdmin
        ? WORKFLOW_STATUSES.filter((candidateStatus) => candidateStatus !== task.status)
        : (STATUS_TRANSITIONS[task.status] || []);
    if (!allowed.includes(status)) throw new Error('Invalid status transition');

    const oldStatus = task.status;
    if (status === 'DONE') {
        await assertCoordinatedCloseReady(task);
    }
    const now = new Date();
    const slaUpdate = buildResolutionStatusForTask(task, status, now);

    await prisma.$transaction(async(tx) => {
        await createHistory(id, user.id, 'status', oldStatus, status, tx);
        await tx.task.update({
            where: { id },
            data: {
                status,
                resolvedAt: slaUpdate.resolvedAt,
                slaResolutionStatus: slaUpdate.slaResolutionStatus
            }
        });
        await safeRecordTimelineEvent({
            taskId: id,
            actorId: user.id,
            type: 'STATUS_CHANGED',
            title: 'Статус изменён',
            description: `${oldStatus} -> ${status}`,
            metadata: {
                fromStatus: oldStatus,
                toStatus: status
            }
        }, tx);
        await syncUnionChildStatuses(id, status, user.id, tx);
    });

    try {
        await notificationService.notifyTaskStatusChanged(id, oldStatus, status, user);
    } catch (error) {
        console.error('[notifications] Failed to notify after status change', {
            taskId: id,
            actorId: user?.id || null,
            error: error.message
        });
    }

    return prisma.task.findUnique({
        where: { id },
        include: TASK_SUMMARY_INCLUDE
    });
};

const approveRequesterClose = async(taskId, actor) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: TASK_SUMMARY_INCLUDE
    });
    if (!task) {
        throw new Error('Task not found');
    }

    const isAuthor = task.authorId === actor.id;
    const isAdmin = isAdminRole(actor.role);
    if (!isAuthor && !isAdmin) {
        throw new Error('Access denied');
    }

    if (!task.requesterCloseRequired) {
        throw new Error('Подтверждение заявителя для этой заявки не требуется.');
    }

    const updatedTask = await prisma.$transaction(async(tx) => {
        const updated = await tx.task.update({
            where: { id: taskId },
            data: {
                requesterCloseApprovedAt: new Date(),
                requesterCloseApprovedById: actor.id
            },
            include: TASK_SUMMARY_INCLUDE
        });

        await safeRecordTimelineEvent({
            taskId,
            actorId: actor.id,
            type: 'CLOSE_APPROVED',
            title: 'Заявитель подтвердил закрытие',
            description: actor.name || null,
            metadata: {
                approvedByRequesterId: actor.id
            }
        }, tx);

        return updated;
    });

    return { task: updatedTask };
};

const merge = async(masterTaskId, data, actor) => {
    const payload = data || {};
    const mergeMode = payload.mergeMode;
    const reason = typeof payload.reason === 'string' && payload.reason.trim()
        ? payload.reason.trim()
        : null;
    const childTaskIds = Array.isArray(payload.childTaskIds)
        ? [...new Set(payload.childTaskIds.filter(Boolean))]
        : [];

    if (!['LINK', 'UNION'].includes(mergeMode)) {
        throw new Error('Некорректный режим объединения. Используйте LINK или UNION.');
    }
    if (childTaskIds.length === 0) {
        throw new Error('Нужно указать хотя бы одну дочернюю заявку.');
    }
    if (childTaskIds.includes(masterTaskId)) {
        throw new Error('Мастер-заявку нельзя объединить саму с собой.');
    }

    const masterTask = await prisma.task.findUnique({
        where: { id: masterTaskId },
        include: { assignees: true }
    });
    if (!masterTask) {
        throw new Error('Task not found');
    }

    const masterUnionParentLink = await getUnionParentLink(masterTaskId);
    if (masterUnionParentLink) {
        throw new Error('Объединённая дочерняя заявка не может быть мастер-заявкой.');
    }

    await assertMergeAccess(masterTask, actor);

    const childTasks = await prisma.task.findMany({
        where: { id: { in: childTaskIds } },
        include: { assignees: true }
    });
    if (childTasks.length !== childTaskIds.length) {
        throw new Error('Одна или несколько дочерних заявок не найдены.');
    }

    for (const childTask of childTasks) {
        await assertTaskReadAccess(childTask, actor);
    }

    if (mergeMode === 'UNION') {
        const existingUnion = await prisma.taskMerge.findMany({
            where: {
                childTaskId: { in: childTaskIds },
                mergeMode: 'UNION',
                masterTaskId: { not: masterTaskId }
            },
            select: { childTaskId: true, masterTaskId: true }
        });
        if (existingUnion.length > 0) {
            throw new Error('Одна или несколько дочерних заявок уже объединены с другой мастер-заявкой.');
        }
    }

    await prisma.$transaction(async(tx) => {
        for (const childTaskId of childTaskIds) {
            await tx.taskMerge.upsert({
                where: {
                    masterTaskId_childTaskId: {
                        masterTaskId,
                        childTaskId
                    }
                },
                update: {
                    mergeMode,
                    mergedBy: actor.id,
                    mergedAt: new Date(),
                    reason
                },
                create: {
                    masterTaskId,
                    childTaskId,
                    mergeMode,
                    mergedBy: actor.id,
                    reason
                }
            });
        }

        if (mergeMode === 'UNION') {
            await syncUnionChildStatuses(masterTaskId, masterTask.status, actor.id, tx);
        }

        await createHistory(
            masterTaskId,
            actor.id,
            'merge',
            null,
            {
                mergeMode,
                childTaskIds,
                reason
            },
            tx
        );

        await safeRecordTimelineEvent({
            taskId: masterTaskId,
            actorId: actor.id,
            type: 'TASK_MERGED',
            title: mergeMode === 'UNION' ? 'Заявки объединены' : 'Заявки связаны',
            description: reason,
            metadata: {
                masterTaskId,
                childTaskIds,
                mergeMode,
                reason
            }
        }, tx);

        for (const childTaskId of childTaskIds) {
            await safeRecordTimelineEvent({
                taskId: childTaskId,
                actorId: actor.id,
                type: 'TASK_MERGED',
                title: mergeMode === 'UNION' ? 'Заявка объединена с мастер-заявкой' : 'Заявка связана с другой заявкой',
                description: reason,
                metadata: {
                    masterTaskId,
                    childTaskIds,
                    mergeMode,
                    reason
                }
            }, tx);
        }
    });

    try {
        await notificationService.notifyTaskMerged(masterTaskId, childTaskIds, actor);
    } catch (error) {
        console.error('[notifications] Failed to notify after task merge', {
            masterTaskId,
            actorId: actor?.id || null,
            error: error.message
        });
    }

    return getMergeInfoForTask(masterTaskId);
};

const getMergeInfo = async(taskId, actor) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { assignees: true }
    });
    await assertTaskReadAccess(task, actor);

    return getMergeInfoForTask(taskId);
};

const approveClose = async(taskId, actor) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { assignees: true }
    });
    if (!task) {
        throw new Error('Task not found');
    }

    const isAssignee = task.assignees.some((assignee) => assignee.userId === actor.id);
    if (!isAssignee) {
        throw new Error('Access denied');
    }

    const approvalState = await getCloseApprovalState(taskId);
    if (!approvalState.required) {
        throw new Error('Согласованное закрытие для этой заявки не требуется.');
    }

    await prisma.$transaction(async(tx) => {
        await tx.taskCloseApproval.upsert({
            where: {
                taskId_userId: {
                    taskId,
                    userId: actor.id
                }
            },
            update: {
                approvedAt: new Date()
            },
            create: {
                taskId,
                userId: actor.id
            }
        });

        await safeRecordTimelineEvent({
            taskId,
            actorId: actor.id,
            type: 'CLOSE_APPROVED',
            title: 'Подтверждено закрытие',
            description: actor.name || null,
            metadata: {
                approvedByUserId: actor.id
            }
        }, tx);
    });

    const nextApprovalState = await getCloseApprovalState(taskId);
    let closed = false;

    if (nextApprovalState.pendingAssigneeIds.length === 0 && task.status !== 'DONE') {
        const now = new Date();
        const slaUpdate = buildResolutionStatusForTask(task, 'DONE', now);
        await prisma.$transaction(async(tx) => {
            await createHistory(taskId, actor.id, 'status', task.status, 'DONE', tx);
            await tx.task.update({
                where: { id: taskId },
                data: {
                    status: 'DONE',
                    resolvedAt: slaUpdate.resolvedAt,
                    slaResolutionStatus: slaUpdate.slaResolutionStatus
                }
            });
            await safeRecordTimelineEvent({
                taskId,
                actorId: actor.id,
                type: 'STATUS_CHANGED',
                title: 'Статус изменён',
                description: `${task.status} -> DONE`,
                metadata: {
                    fromStatus: task.status,
                    toStatus: 'DONE'
                }
            }, tx);
            await syncUnionChildStatuses(taskId, 'DONE', actor.id, tx);
        });
        closed = true;
        try {
            await notificationService.notifyTaskStatusChanged(taskId, task.status, 'DONE', actor);
        } catch (error) {
            console.error('[notifications] Failed to notify after coordinated close', {
                taskId,
                actorId: actor?.id || null,
                error: error.message
            });
        }
    }

    const updatedTask = await prisma.task.findUnique({
        where: { id: taskId },
        include: TASK_SUMMARY_INCLUDE
    });

    return {
        task: updatedTask,
        mergeInfo: await getMergeInfoForTask(taskId),
        closed
    };
};

const deleteTask = async(id) => {
    const attachments = await prisma.taskAttachment.findMany({
        where: { taskId: id },
        select: { path: true }
    });

    const deletedTask = await prisma.task.delete({ where: { id } });
    attachments.forEach((attachment) => {
        deleteStoredAttachmentFileIfPresent(attachment.path);
    });

    return deletedTask;
};

const addAssignee = async(taskId, userId, actor) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { assignees: true }
    });
    if (!task) throw new Error('Task not found');

    await assertTaskFolderManagementAccess(task, actor);
    await assertAssignableAssigneeIds([userId]);
    const isAdmin = isAdminRole(actor.role);
    if (!isAdmin && (!isAgentRole(actor.role) || userId !== actor.id)) {
        throw new Error(TASK_REASSIGN_ADMIN_ONLY_ERROR);
    }
    if (task.status === 'DONE' && isAgentRole(actor.role) && userId === actor.id) {
        throw new Error('Исполнитель не может назначить себя на закрытую заявку.');
    }

    let assignee;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            [assignee] = await prisma.$transaction(async(tx) => {
                const currentTask = await tx.task.findUnique({
                    where: { id: taskId },
                    include: { assignees: true }
                });
                if (!currentTask) throw new Error('Task not found');
                if (!isAdmin && currentTask.assignees.length > 0) {
                    throw new Error(TASK_OWNERSHIP_LOCKED_ERROR);
                }

                const createdAssignee = await tx.taskAssignee.create({
                    data: { taskId, userId }
                });
                const [userRecord] = await loadUsersByIds([userId], tx);
                await safeRecordTimelineEvent({
                    taskId,
                    actorId: actor.id,
                    type: 'ASSIGNEE_ADDED',
                    title: 'Назначен исполнитель',
                    description: userRecord?.name || null,
                    metadata: {
                        assigneeId: userId,
                        assigneeName: userRecord?.name || null
                    }
                }, tx);
                return [createdAssignee, userRecord || null];
            }, { isolationLevel: 'Serializable' });
            break;
        } catch (error) {
            if (error?.code === 'P2034' && attempt < 2) {
                continue;
            }
            throw error;
        }
    }

    try {
        await notificationService.notifyTaskAssigned(taskId, userId, actor);
    } catch (error) {
        console.error('[notifications] Failed to notify after addAssignee', {
            taskId,
            userId,
            actorId: actor?.id || null,
            error: error.message
        });
    }

    return assignee;
};

const removeAssignee = async(taskId, userId, actor) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { assignees: true }
    });
    if (!task) throw new Error('Task not found');

    await assertTaskFolderManagementAccess(task, actor);
    if (!isAdminRole(actor.role)) {
        throw new Error(TASK_REASSIGN_ADMIN_ONLY_ERROR);
    }

    return prisma.$transaction(async(tx) => {
        const [userRecord] = await loadUsersByIds([userId], tx);
        const deleted = await tx.taskAssignee.delete({
            where: { taskId_userId: { taskId, userId } }
        });
        await safeRecordTimelineEvent({
            taskId,
            actorId: actor.id,
            type: 'ASSIGNEE_REMOVED',
            title: 'Исполнитель снят',
            description: userRecord?.name || null,
            metadata: {
                assigneeId: userId,
                assigneeName: userRecord?.name || null
            }
        }, tx);
        return deleted;
    });
};

const createAttachment = async(taskId, filename, path, actor) => {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('Task not found');
    const actorId = typeof actor === 'string' ? actor : actor?.id;
    return prisma.$transaction(async(tx) => {
        const attachment = await tx.taskAttachment.create({
            data: {
                filename,
                path: buildStoredAttachmentPath(resolveStoredAttachmentFilename(path)),
                taskId,
                uploadedById: actorId
            }
        });
        await safeRecordTimelineEvent({
            taskId,
            actorId,
            type: 'FILE_ATTACHED',
            title: 'Добавлено вложение',
            description: filename || null,
            metadata: {
                attachmentId: attachment.id,
                filename: attachment.filename
            }
        }, tx);
        return attachment;
    });
};

const deleteAttachment = async(id, actor) => {
    return prisma.$transaction(async(tx) => {
        const attachment = await tx.taskAttachment.findUnique({ where: { id } });
        if (!attachment) {
            throw new Error('File not found');
        }
        await tx.taskAttachment.delete({ where: { id } });
        await safeRecordTimelineEvent({
            taskId: attachment.taskId,
            actorId: actor?.id ?? null,
            type: 'FILE_DELETED',
            title: 'Удалено вложение',
            description: attachment.filename || null,
            metadata: {
                attachmentId: attachment.id,
                filename: attachment.filename
            }
        }, tx);
        return attachment;
    });
};

module.exports = {
    getAll,
    getById,
    create,
    runPostCreateEffects,
    update,
    updateStatus,
    merge,
    getMergeInfo,
    approveClose,
    approveRequesterClose,
    delete: deleteTask,
    addAssignee,
    removeAssignee,
    createAttachment,
    deleteAttachment
};
