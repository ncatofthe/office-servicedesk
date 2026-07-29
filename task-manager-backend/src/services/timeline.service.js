const prisma = require('../prisma/prisma.js');
const {
    isAdminRole,
    isAgentRole,
    isRequesterRole,
    isViewerRole
} = require('../utils/roles.js');
const {
    getTaskAccessContext,
    hasTaskAccess
} = require('../utils/team-folder-access.js');

const TIMELINE_ACTOR_SELECT = {
    id: true,
    name: true,
    email: true,
    role: true
};

const TIMELINE_INCLUDE = {
    actor: {
        select: TIMELINE_ACTOR_SELECT
    }
};

const TASK_ACCESS_SELECT = {
    id: true,
    authorId: true,
    folderId: true,
    assignees: {
        select: {
            userId: true
        }
    }
};

const serializeDate = (value) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const cloneJson = (value) => {
    if (value === undefined) return null;
    if (value === null) return null;
    return JSON.parse(JSON.stringify(value));
};

const isInternalTimelineType = (type) => type === 'INTERNAL_NOTE_ADDED';

const sanitizeExternalMetadata = (event) => {
    const metadata = cloneJson(event.metadata);
    if (!metadata) {
        return null;
    }

    switch (event.type) {
    case 'STATUS_CHANGED':
        return {
            fromStatus: metadata.fromStatus ?? null,
            toStatus: metadata.toStatus ?? null
        };
    case 'ASSIGNEE_ADDED':
    case 'ASSIGNEE_REMOVED':
        return {
            assigneeId: metadata.assigneeId ?? null,
            assigneeName: metadata.assigneeName ?? null
        };
    case 'COMMENT_ADDED':
        return {
            commentId: metadata.commentId ?? null,
            visibility: 'PUBLIC'
        };
    case 'FILE_ATTACHED':
    case 'FILE_DELETED':
        return {
            attachmentId: metadata.attachmentId ?? null,
            filename: metadata.filename ?? null
        };
    case 'CANNED_REPLY_USED':
        return {
            mode: metadata.mode ?? null
        };
    case 'EMAIL_REPLY_SENT':
        return {
            dryRun: metadata.dryRun ?? null,
            subject: metadata.subject ?? null
        };
    case 'TASK_MERGED':
        return {
            mergeMode: metadata.mergeMode ?? null,
            reason: metadata.reason ?? null
        };
    case 'CLOSE_APPROVED':
        return null;
    default:
        return null;
    }
};

const serializeTimelineEvent = (event, actor) => {
    const canSeeInternal = actor && (isAdminRole(actor.role) || isAgentRole(actor.role));

    if (!canSeeInternal && isInternalTimelineType(event.type)) {
        return null;
    }

    const metadata = canSeeInternal
        ? cloneJson(event.metadata)
        : sanitizeExternalMetadata(event);

    return {
        id: event.id,
        taskId: event.taskId,
        type: event.type,
        title: event.title,
        description: event.description ?? null,
        metadata,
        actor: event.actor
            ? {
                id: event.actor.id,
                name: event.actor.name,
                email: event.actor.email,
                role: event.actor.role
            }
            : null,
        createdAt: serializeDate(event.createdAt)
    };
};

const assertTaskTimelineReadAccess = async(taskId, actor, db = prisma) => {
    const task = await db.task.findUnique({
        where: { id: taskId },
        select: TASK_ACCESS_SELECT
    });

    if (!task) {
        throw new Error('Task not found');
    }

    const context = await getTaskAccessContext(actor, db);
    if (!hasTaskAccess(task, actor, context)) {
        throw new Error('Access denied');
    }

    return task;
};

const recordTimelineEvent = async(data, db = prisma) => {
    return db.taskTimelineEvent.create({
        data: {
            taskId: data.taskId,
            actorId: data.actorId ?? null,
            type: data.type,
            title: data.title,
            description: data.description ?? null,
            metadata: cloneJson(data.metadata),
            createdAt: data.createdAt || undefined
        },
        include: TIMELINE_INCLUDE
    });
};

const safeRecordTimelineEvent = async(data, db = prisma) => {
    try {
        return await recordTimelineEvent(data, db);
    } catch (error) {
        console.warn('[timeline] Failed to record timeline event', {
            taskId: data?.taskId,
            type: data?.type,
            actorId: data?.actorId ?? null,
            error: error.message
        });
        return null;
    }
};

const listTaskTimeline = async(taskId, actor, db = prisma) => {
    await assertTaskTimelineReadAccess(taskId, actor, db);

    const events = await db.taskTimelineEvent.findMany({
        where: { taskId },
        include: TIMELINE_INCLUDE,
        orderBy: [
            { createdAt: 'desc' },
            { id: 'desc' }
        ]
    });

    return events
        .map((event) => serializeTimelineEvent(event, actor))
        .filter(Boolean);
};

module.exports = {
    recordTimelineEvent,
    safeRecordTimelineEvent,
    listTaskTimeline,
    serializeTimelineEvent
};
