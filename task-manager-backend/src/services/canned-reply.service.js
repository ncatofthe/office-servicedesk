const prisma = require('../prisma/prisma.js');
const taskService = require('./task.service.js');
const commentService = require('./comment.service.js');
const emailOutboundService = require('./email-outbound.service.js');
const { safeRecordTimelineEvent } = require('./timeline.service.js');
const { isAdminRole, isAgentRole } = require('../utils/roles.js');

const CANNED_REPLY_INCLUDE = {
    author: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true
        }
    }
};

const isTemplateManager = (role) => isAdminRole(role) || isAgentRole(role);

const buildAccessWhere = (actor) => {
    if (!actor || !isTemplateManager(actor.role)) {
        throw new Error('Access denied');
    }

    if (isAdminRole(actor.role)) {
        return {
            OR: [
                { visibility: 'SHARED' },
                { authorId: actor.id }
            ]
        };
    }

    return {
        OR: [
            { visibility: 'SHARED' },
            { authorId: actor.id }
        ]
    };
};

const normalizeSearch = (value) => {
    const normalized = String(value || '').trim();
    return normalized.length > 0 ? normalized : null;
};

const normalizeBodyValue = (value, fallback) => {
    if (value === undefined || value === null) {
        return fallback;
    }

    return String(value);
};

const assertCannedReplyPayload = (payload, { partial = false } = {}) => {
    const errors = [];

    if (!partial || Object.prototype.hasOwnProperty.call(payload, 'title')) {
        const title = String(payload.title || '').trim();
        if (!title) {
            errors.push('Название шаблона обязательно.');
        }
    }

    if (!partial || Object.prototype.hasOwnProperty.call(payload, 'body')) {
        const body = normalizeBodyValue(payload.body, '').trim();
        if (!body) {
            errors.push('Текст шаблона обязателен.');
        }
    }

    if (
        Object.prototype.hasOwnProperty.call(payload, 'visibility')
        && !['PRIVATE', 'SHARED'].includes(payload.visibility)
    ) {
        errors.push('visibility должен быть PRIVATE или SHARED.');
    }

    if (errors.length > 0) {
        throw new Error(errors[0]);
    }
};

const normalizeCreateData = (payload, actor) => {
    assertCannedReplyPayload(payload);

    return {
        title: String(payload.title).trim(),
        body: normalizeBodyValue(payload.body, ''),
        category: payload.category === undefined || payload.category === null || String(payload.category).trim() === ''
            ? null
            : String(payload.category).trim(),
        isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
        visibility: payload.visibility || 'PRIVATE',
        authorId: actor.id
    };
};

const normalizeUpdateData = (payload) => {
    assertCannedReplyPayload(payload, { partial: true });

    const data = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
        data.title = String(payload.title).trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'body')) {
        data.body = normalizeBodyValue(payload.body, '');
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'category')) {
        data.category = payload.category === null || String(payload.category).trim() === ''
            ? null
            : String(payload.category).trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'isActive')) {
        data.isActive = Boolean(payload.isActive);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'visibility')) {
        data.visibility = payload.visibility;
    }

    return data;
};

const findAccessibleReplyOrThrow = async(id, actor, db = prisma) => {
    const reply = await db.cannedReply.findFirst({
        where: {
            id,
            ...buildAccessWhere(actor)
        },
        include: CANNED_REPLY_INCLUDE
    });

    if (!reply) {
        throw new Error('Шаблон ответа не найден.');
    }

    return reply;
};

const assertManageAccess = (reply, actor) => {
    if (!reply) {
        throw new Error('Шаблон ответа не найден.');
    }

    if (isAdminRole(actor.role)) {
        return;
    }

    if (reply.authorId !== actor.id) {
        throw new Error('Нет доступа к изменению этого шаблона.');
    }
};

const listCannedReplies = async(actor, filters = {}) => {
    const search = normalizeSearch(filters.search);
    const where = {
        AND: [
            buildAccessWhere(actor)
        ]
    };

    if (filters.category !== undefined) {
        where.AND.push(
            filters.category === null || String(filters.category).trim() === ''
                ? { category: null }
                : { category: String(filters.category).trim() }
        );
    }

    if (filters.visibility !== undefined) {
        where.AND.push({ visibility: filters.visibility });
    }

    if (filters.authorId !== undefined) {
        where.AND.push({ authorId: String(filters.authorId) });
    }

    if (filters.isActive !== undefined) {
        where.AND.push({ isActive: filters.isActive === true || filters.isActive === 'true' });
    }

    if (search) {
        where.AND.push({
            OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { body: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } }
            ]
        });
    }

    return prisma.cannedReply.findMany({
        where,
        include: CANNED_REPLY_INCLUDE,
        orderBy: [
            { updatedAt: 'desc' },
            { createdAt: 'desc' }
        ]
    });
};

const getCannedReply = async(id, actor) => findAccessibleReplyOrThrow(id, actor);

const createCannedReply = async(payload, actor) => {
    if (!isTemplateManager(actor?.role)) {
        throw new Error('Access denied');
    }

    return prisma.cannedReply.create({
        data: normalizeCreateData(payload || {}, actor),
        include: CANNED_REPLY_INCLUDE
    });
};

const updateCannedReply = async(id, payload, actor) => {
    const reply = await prisma.cannedReply.findUnique({
        where: { id },
        include: CANNED_REPLY_INCLUDE
    });

    if (!reply) {
        throw new Error('Шаблон ответа не найден.');
    }

    assertManageAccess(reply, actor);

    return prisma.cannedReply.update({
        where: { id },
        data: normalizeUpdateData(payload || {}),
        include: CANNED_REPLY_INCLUDE
    });
};

const deleteCannedReply = async(id, actor) => {
    const reply = await prisma.cannedReply.findUnique({
        where: { id },
        include: CANNED_REPLY_INCLUDE
    });

    if (!reply) {
        throw new Error('Шаблон ответа не найден.');
    }

    assertManageAccess(reply, actor);
    await prisma.cannedReply.delete({ where: { id } });

    return { message: 'Шаблон ответа удалён.' };
};

const applyTemplateToTask = async(taskId, payload, actor) => {
    if (!isTemplateManager(actor?.role)) {
        throw new Error('Access denied');
    }

    await taskService.getById(taskId, actor);

    const template = await findAccessibleReplyOrThrow(payload.templateId, actor);
    if (!template.isActive) {
        throw new Error('Шаблон ответа отключён.');
    }

    const mode = payload.mode;
    if (!['COMMENT', 'EMAIL_REPLY'].includes(mode)) {
        throw new Error('mode должен быть COMMENT или EMAIL_REPLY.');
    }

    const bodyUsed = normalizeBodyValue(payload.bodyOverride, template.body);
    if (!String(bodyUsed).trim()) {
        throw new Error('Текст шаблона пустой.');
    }

    if (mode === 'COMMENT') {
        const comment = await commentService.create({
            taskId,
            content: bodyUsed,
            visibility: 'PUBLIC'
        }, actor);

        await safeRecordTimelineEvent({
            taskId,
            actorId: actor.id,
            type: 'CANNED_REPLY_USED',
            title: 'Применён шаблон ответа',
            description: template.title,
            metadata: {
                templateId: template.id,
                templateTitle: template.title,
                mode
            }
        });

        return {
            taskId,
            templateId: template.id,
            mode,
            bodyUsed,
            commentId: comment.id,
            dryRun: undefined,
            recipient: undefined,
            subject: undefined
        };
    }

    const emailReplyResult = await emailOutboundService.sendTaskEmailReply(taskId, bodyUsed, actor);

    await safeRecordTimelineEvent({
        taskId,
        actorId: actor.id,
        type: 'CANNED_REPLY_USED',
        title: 'Применён шаблон ответа',
        description: template.title,
        metadata: {
            templateId: template.id,
            templateTitle: template.title,
            mode
        }
    });

    return {
        taskId,
        templateId: template.id,
        mode,
        bodyUsed,
        commentId: emailReplyResult.commentId || null,
        dryRun: emailReplyResult.dryRun,
        recipient: emailReplyResult.recipient,
        subject: emailReplyResult.subject,
        outboxId: emailReplyResult.outboxId || null,
        outboxStatus: emailReplyResult.outboxStatus || null,
        sendError: emailReplyResult.sendError || null
    };
};

module.exports = {
    listCannedReplies,
    getCannedReply,
    createCannedReply,
    updateCannedReply,
    deleteCannedReply,
    applyTemplateToTask
};
