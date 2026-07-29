const prisma = require('../prisma/prisma.js');
const { markTaskFirstResponse } = require('./sla.service.js');
const { safeRecordTimelineEvent } = require('./timeline.service.js');
const notificationService = require('./notification.service.js');
const {
    isAdminRole,
    isAgentRole,
    isRequesterRole,
    isViewerRole
} = require('../utils/roles.js');
const { USER_NAME_SELECT } = require('../utils/user.select.js');

const normalizeCommentVisibility = (payload = {}) => {
    if (
        Object.prototype.hasOwnProperty.call(payload, 'visibility')
        && payload.visibility !== undefined
        && payload.visibility !== null
        && payload.visibility !== ''
    ) {
        return payload.visibility;
    }
    if (
        Object.prototype.hasOwnProperty.call(payload, 'type')
        && payload.type !== undefined
        && payload.type !== null
        && payload.type !== ''
    ) {
        return payload.type;
    }
    return 'PUBLIC';
};

const assertCommentCreateAccess = (actor, visibility) => {
    if (!actor || isViewerRole(actor.role)) {
        throw new Error('Только исполнители и заявители могут создавать комментарии.');
    }

    if (isRequesterRole(actor.role) && visibility === 'INTERNAL') {
        throw new Error('Заявитель может создавать только публичные комментарии.');
    }
};

const getByTask = async(taskId, actor) => {
    return prisma.taskComment.findMany({
        where: actor && (isAdminRole(actor.role) || isAgentRole(actor.role))
            ? { taskId }
            : {
                taskId,
                visibility: 'PUBLIC'
            },
        include: {
            author: {
                select: USER_NAME_SELECT
            }
        },
        orderBy: { createdAt: 'asc' }
    });
};

const create = async(data, actor) => {
    const { content, taskId } = data;
    const visibility = normalizeCommentVisibility(data);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('Task not found');
    // Permission check in controller/service caller
    if (!['PUBLIC', 'INTERNAL'].includes(visibility)) {
        throw new Error('visibility должен быть PUBLIC или INTERNAL.');
    }
    assertCommentCreateAccess(actor, visibility);

    const comment = await prisma.$transaction(async(tx) => {
        const comment = await tx.taskComment.create({
            data: {
                content,
                visibility,
                taskId,
                authorId: actor.id
            },
            include: { author: { select: USER_NAME_SELECT } }
        });

        await markTaskFirstResponse(taskId, actor, tx);
        await safeRecordTimelineEvent({
            taskId,
            actorId: actor.id,
            type: visibility === 'INTERNAL' ? 'INTERNAL_NOTE_ADDED' : 'COMMENT_ADDED',
            title: visibility === 'INTERNAL' ? 'Добавлена внутренняя заметка' : 'Добавлен комментарий',
            description: null,
            metadata: {
                commentId: comment.id,
                visibility
            }
        }, tx);

        return comment;
    });

    try {
        await notificationService.notifyCommentCreated(taskId, comment, actor);
    } catch (error) {
        console.error('[notifications] Failed to notify about comment creation', {
            taskId,
            commentId: comment.id,
            actorId: actor?.id || null,
            error: error.message
        });
    }

    return comment;
};

const deleteComment = async(id, userId, userRole) => {
    const comment = await prisma.taskComment.findUnique({
        where: { id }
    });
    if (!comment) throw new Error('Comment not found');
    if (comment.authorId !== userId && userRole !== 'ADMIN') {
        throw new Error('Access denied');
    }
    return prisma.taskComment.delete({ where: { id } });
};

const updateComment = async(id, content, userId) => {
    const comment = await prisma.taskComment.findUnique({
        where: { id }
    });
    if (!comment) throw new Error('Comment not found');
    if (comment.authorId !== userId) {
        throw new Error('Access denied');
    }
    return prisma.taskComment.update({
        where: { id },
        data: { content },
        include: { author: { select: USER_NAME_SELECT } }
    });
};

module.exports = {
    getByTask,
    create,
    updateComment,
    deleteComment
};
