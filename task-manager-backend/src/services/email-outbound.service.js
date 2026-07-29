const nodemailer = require('nodemailer');
const prisma = require('../prisma/prisma.js');
const { markTaskFirstResponse } = require('./sla.service.js');
const { safeRecordTimelineEvent } = require('./timeline.service.js');
const { isAdminRole, isAgentRole } = require('../utils/roles.js');
const {
    getTaskAccessContext,
    hasTaskAccess
} = require('../utils/team-folder-access.js');

const EMAIL_OUTBOUND_RETRY_STATUSES = ['FAILED', 'RETRY_PENDING'];
const EMAIL_OUTBOUND_NON_RETRYABLE_STATUSES = ['SENT', 'DRY_RUN'];
const EMAIL_OUTBOX_DEFAULT_LIST_LIMIT = 50;
const EMAIL_OUTBOX_MAX_LIST_LIMIT = 100;
const EMAIL_OUTBOX_DEFAULT_WORKER_INTERVAL_MS = 60000;
const EMAIL_OUTBOX_DEFAULT_WORKER_BATCH_SIZE = 20;
const EMAIL_OUTBOX_DEFAULT_LOCK_TTL_MS = 300000;
const EMAIL_OUTBOX_DEFAULT_MAX_ATTEMPTS = 5;

const EMAIL_THREAD_TASK_ACCESS_SELECT = {
    id: true,
    authorId: true,
    folderId: true,
    assignees: {
        select: {
            userId: true
        }
    }
};

const OUTBOX_ADMIN_INCLUDE = {
    task: {
        select: {
            id: true,
            ticketNumber: true,
            title: true
        }
    },
    comment: {
        select: {
            id: true,
            visibility: true
        }
    },
    createdBy: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true
        }
    }
};

const toBoolean = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const parseIntegerEnv = (name, fallback, min = 0) => {
    const parsed = Number.parseInt(process.env[name] || `${fallback}`, 10);
    return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

const parseOutboxListLimit = (value) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return EMAIL_OUTBOX_DEFAULT_LIST_LIMIT;
    }
    return Math.min(parsed, EMAIL_OUTBOX_MAX_LIST_LIMIT);
};

const parseBatchLimit = (value, fallback) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.min(parsed, EMAIL_OUTBOX_MAX_LIST_LIMIT);
};

const maskValue = (value, { visibleStart = 2, visibleEnd = 2 } = {}) => {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    if (normalized.length <= visibleStart + visibleEnd) {
        return '*'.repeat(normalized.length);
    }

    return `${normalized.slice(0, visibleStart)}***${normalized.slice(-visibleEnd)}`;
};

const getEmailOutboundConfig = () => ({
    workerEnabled: toBoolean(process.env.EMAIL_OUTBOX_WORKER_ENABLED),
    workerIntervalMs: parseIntegerEnv('EMAIL_OUTBOX_WORKER_INTERVAL_MS', EMAIL_OUTBOX_DEFAULT_WORKER_INTERVAL_MS, 5000),
    workerBatchSize: parseIntegerEnv('EMAIL_OUTBOX_WORKER_BATCH_SIZE', EMAIL_OUTBOX_DEFAULT_WORKER_BATCH_SIZE, 1),
    lockTtlMs: parseIntegerEnv('EMAIL_OUTBOX_LOCK_TTL_MS', EMAIL_OUTBOX_DEFAULT_LOCK_TTL_MS, 1000),
    maxAttempts: parseIntegerEnv('EMAIL_OUTBOX_MAX_ATTEMPTS', EMAIL_OUTBOX_DEFAULT_MAX_ATTEMPTS, 1),
    enabled: toBoolean(process.env.EMAIL_OUTBOUND_ENABLED),
    host: process.env.EMAIL_SMTP_HOST || 'smtp.yandex.ru',
    port: parseIntegerEnv('EMAIL_SMTP_PORT', 465, 1),
    secure: process.env.EMAIL_SMTP_SECURE === undefined ? true : toBoolean(process.env.EMAIL_SMTP_SECURE),
    user: process.env.EMAIL_SMTP_USER,
    password: process.env.EMAIL_SMTP_PASSWORD,
    fromAddress: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER,
    fromName: process.env.EMAIL_FROM_NAME || 'Office ServiceDesk',
    retryDelayMinutes: parseIntegerEnv('EMAIL_OUTBOUND_RETRY_DELAY_MINUTES', 15, 1),
    // legacy option, keep for compatibility with existing installations
    retryBatchLimit: parseIntegerEnv('EMAIL_OUTBOUND_RETRY_BATCH_LIMIT', EMAIL_OUTBOX_DEFAULT_WORKER_BATCH_SIZE, 1)
});

const requireSmtpConfig = (config) => {
    const missing = [];
    if (!config.host) missing.push('EMAIL_SMTP_HOST');
    if (!config.user) missing.push('EMAIL_SMTP_USER');
    if (!config.password) missing.push('EMAIL_SMTP_PASSWORD');
    if (!config.fromAddress) missing.push('EMAIL_FROM_ADDRESS');

    if (missing.length > 0) {
        throw new Error(`Для отправки email не настроены переменные: ${missing.join(', ')}.`);
    }
};

const buildTransporter = (config) => nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
        user: config.user,
        pass: config.password
    }
});

const formatFromAddress = (config) => {
    if (config.fromName) {
        return `"${String(config.fromName).replace(/"/g, '\\"')}" <${config.fromAddress}>`;
    }

    return config.fromAddress;
};

const normalizeReplySubject = (subject) => {
    const normalized = String(subject || '').trim() || 'Ответ по заявке';
    return /^re:/i.test(normalized) ? normalized : `Re: ${normalized}`;
};

const sanitizeErrorMessage = (error) => {
    if (!error) {
        return 'Неизвестная ошибка отправки.';
    }

    const base = String(error.message || error);
    return base.slice(0, 1000);
};

const serializeDate = (value) => {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const assertEmailReplyAccess = async(task, actor, db = prisma) => {
    if (!task) {
        throw new Error('Task not found');
    }

    if (!actor) {
        throw new Error('Access denied');
    }

    if (isAdminRole(actor.role)) {
        return;
    }

    if (!isAgentRole(actor.role)) {
        throw new Error('Access denied');
    }

    const context = await getTaskAccessContext(actor, db);
    if (!hasTaskAccess(task, actor, context)) {
        throw new Error('Access denied');
    }
};

const getLatestInboundMessage = async(taskId, db = prisma) => {
    return db.emailInboundMessage.findFirst({
        where: { taskId },
        orderBy: [
            { receivedAt: 'desc' },
            { processedAt: 'desc' },
            { createdAt: 'desc' }
        ]
    });
};

const getLatestOutboundMessageWithMessageId = async(taskId, db = prisma) => {
    return db.emailOutboundMessage.findFirst({
        where: {
            taskId,
            messageId: {
                not: null
            }
        },
        orderBy: [
            { createdAt: 'desc' },
            { updatedAt: 'desc' }
        ]
    });
};

const buildThreadHeaders = (inbound, previousOutbound) => {
    const chain = [];
    if (inbound?.messageId) {
        chain.push(inbound.messageId);
    }
    if (previousOutbound?.messageId && !chain.includes(previousOutbound.messageId)) {
        chain.push(previousOutbound.messageId);
    }

    const inReplyTo = chain[chain.length - 1] || null;
    const references = chain.length > 0 ? chain.join(' ') : null;

    const headers = {};
    if (inReplyTo) {
        headers['In-Reply-To'] = inReplyTo;
    }
    if (references) {
        headers.References = references;
    }

    return {
        inReplyTo,
        references,
        headers
    };
};

const buildReplyPayload = ({ task, inbound, previousOutbound, message, config }) => {
    if (!inbound) {
        throw new Error('Для этой заявки нет входящего email-письма.');
    }

    const subject = normalizeReplySubject(inbound.subject || task.title);
    const threading = buildThreadHeaders(inbound, previousOutbound);

    return {
        from: formatFromAddress(config),
        to: inbound.fromEmail,
        recipientName: inbound.fromName || null,
        subject,
        text: message,
        headers: threading.headers,
        inReplyTo: threading.inReplyTo,
        references: threading.references
    };
};

const buildPublicReplyCommentText = (message) => ([
    'Email-ответ заявителю:',
    '',
    message
].join('\n'));

const createReplyComment = async(tx, taskId, actorId, message) => {
    const createdComment = await tx.taskComment.create({
        data: {
            taskId,
            authorId: actorId,
            visibility: 'PUBLIC',
            content: buildPublicReplyCommentText(message)
        }
    });

    return createdComment;
};

const computeNextRetryAt = (attempts, retryDelayMinutes) => {
    const safeAttempts = Number.isFinite(attempts) ? attempts : 0;
    const multiplier = Math.min(Math.max(safeAttempts, 1), 6);
    return new Date(Date.now() + retryDelayMinutes * multiplier * 60 * 1000);
};

const computeLockExpiresAt = (now, lockTtlMs) => {
    const ttl = Number.isFinite(lockTtlMs) ? lockTtlMs : EMAIL_OUTBOX_DEFAULT_LOCK_TTL_MS;
    return new Date(now.getTime() - ttl);
};

const normalizeRetryWorkerId = (source, explicitWorkerId) => {
    if (explicitWorkerId && String(explicitWorkerId).trim()) {
        return String(explicitWorkerId).trim().slice(0, 120);
    }

    const normalizedSource = String(source || 'retry').trim() || 'retry';
    return `${normalizedSource}-${process.pid}`.slice(0, 120);
};

const buildLockAvailabilityWhere = (lockExpiresAt) => ({
    OR: [
        { lockedAt: null },
        { lockedAt: { lte: lockExpiresAt } }
    ]
});

const claimOutboxRecord = async(db, outboxId, config, claimOptions = {}) => {
    const now = claimOptions.now || new Date();
    const lockExpiresAt = computeLockExpiresAt(now, config.lockTtlMs);
    const claimWhere = {
        id: outboxId,
        status: {
            in: EMAIL_OUTBOUND_RETRY_STATUSES
        },
        attempts: {
            lt: config.maxAttempts
        },
        ...buildLockAvailabilityWhere(lockExpiresAt)
    };

    if (claimOptions.requireDueAt !== false) {
        claimWhere.OR = [
            { nextRetryAt: null },
            { nextRetryAt: { lte: now } }
        ];
        claimWhere.AND = [buildLockAvailabilityWhere(lockExpiresAt)];
    }

    const claimed = await db.emailOutboundMessage.updateMany({
        where: claimWhere,
        data: {
            lockedAt: now,
            lockedBy: claimOptions.workerId || normalizeRetryWorkerId(claimOptions.source)
        }
    });

    if (!claimed.count) {
        return null;
    }

    return db.emailOutboundMessage.findUnique({
        where: { id: outboxId }
    });
};

const createOutboxBaseRecord = async({
    db = prisma,
    taskId,
    commentId,
    actorId,
    payload,
    dryRun
}) => {
    return db.emailOutboundMessage.create({
        data: {
            taskId,
            commentId: commentId || null,
            recipientEmail: payload.to,
            recipientName: payload.recipientName,
            fromEmail: payload.from,
            subject: payload.subject,
            bodyText: String(payload.text || '') || null,
            textPreview: String(payload.text || '').slice(0, 1000) || null,
            status: dryRun ? 'DRY_RUN' : 'RETRY_PENDING',
            dryRun,
            inReplyTo: payload.inReplyTo,
            references: payload.references,
            createdById: actorId || null
        }
    });
};

const markOutboxAsSent = async(db, outboxId, sent) => {
    const now = new Date();
    const providerMessageId = sent?.messageId ? String(sent.messageId).slice(0, 255) : null;
    const messageId = providerMessageId;

    return db.emailOutboundMessage.update({
        where: { id: outboxId },
        data: {
            status: 'SENT',
            dryRun: false,
            providerMessageId,
            messageId,
            errorMessage: null,
            attempts: {
                increment: 1
            },
            lastAttemptAt: now,
            nextRetryAt: null,
            lockedAt: null,
            lockedBy: null
        }
    });
};

const markOutboxAsFailed = async(db, outboxId, error, config, currentAttempts = 0) => {
    const now = new Date();
    const nextAttempts = (Number.isFinite(currentAttempts) ? currentAttempts : 0) + 1;
    const isFinalFailure = nextAttempts >= config.maxAttempts;
    return db.emailOutboundMessage.update({
        where: { id: outboxId },
        data: {
            status: isFinalFailure ? 'FAILED' : 'RETRY_PENDING',
            dryRun: false,
            errorMessage: sanitizeErrorMessage(error),
            attempts: {
                increment: 1
            },
            lastAttemptAt: now,
            nextRetryAt: isFinalFailure ? null : computeNextRetryAt(nextAttempts, config.retryDelayMinutes),
            lockedAt: null,
            lockedBy: null
        }
    });
};

const buildReplyResult = ({
    taskId,
    payload,
    commentId,
    outbox,
    dryRun,
    partialErrorMessage = null
}) => ({
    taskId,
    dryRun,
    recipient: payload.to,
    subject: payload.subject,
    messageId: outbox?.messageId || outbox?.providerMessageId || null,
    commentId,
    outboxId: outbox?.id || null,
    outboxStatus: outbox?.status || null,
    inReplyTo: payload.inReplyTo,
    references: payload.references,
    sendError: partialErrorMessage
});

const buildGenericOutboxResult = (outbox, extra = {}) => ({
    id: outbox?.id || null,
    outboxId: outbox?.id || null,
    outboxStatus: outbox?.status || null,
    dryRun: Boolean(outbox?.dryRun),
    messageId: outbox?.messageId || outbox?.providerMessageId || null,
    sendError: extra.sendError || null
});

const notifyAdminsAboutOutboundFailure = async(event) => {
    try {
        const notificationService = require('./notification.service.js');
        if (typeof notificationService.handleEmailOutboxFailureEvent === 'function') {
            await notificationService.handleEmailOutboxFailureEvent(event);
        }
    } catch (error) {
        console.warn('[email-outbound] Failed to notify admins about outbound failure', {
            outboxId: event?.outboxId || null,
            error: error.message
        });
    }
};

const notifyAdminsAboutOutboundRecovery = async(event) => {
    try {
        const notificationService = require('./notification.service.js');
        if (typeof notificationService.handleEmailOutboxRecoveryEvent === 'function') {
            await notificationService.handleEmailOutboxRecoveryEvent(event);
        }
    } catch (error) {
        console.warn('[email-outbound] Failed to notify admins about outbound recovery', {
            outboxId: event?.outboxId || null,
            error: error.message
        });
    }
};

const notifyCommentCreatedFromEmailReply = async(taskId, comment, actor) => {
    try {
        const notificationService = require('./notification.service.js');
        if (typeof notificationService.notifyCommentCreated === 'function') {
            await notificationService.notifyCommentCreated(taskId, comment, actor, {
                sendEmail: false
            });
        }
    } catch (error) {
        console.warn('[email-outbound] Failed to create in-app notification for email reply', {
            taskId,
            commentId: comment?.id || null,
            actorId: actor?.id || null,
            error: error.message
        });
    }
};

const queueOutboundEmail = async(payloadInput, options = {}) => {
    const db = options.db || prisma;
    const config = {
        ...getEmailOutboundConfig(),
        ...(options.config || {})
    };
    const taskId = String(payloadInput?.taskId || '').trim();
    if (!taskId) {
        throw new Error('taskId обязателен для записи email в outbox.');
    }

    const payload = {
        from: payloadInput?.from || formatFromAddress(config),
        to: String(payloadInput?.to || '').trim(),
        recipientName: payloadInput?.recipientName || null,
        subject: String(payloadInput?.subject || '').trim() || 'Уведомление ServiceDesk',
        text: String(payloadInput?.text || '').trim(),
        inReplyTo: payloadInput?.inReplyTo || null,
        references: payloadInput?.references || null
    };

    if (!payload.to) {
        throw new Error('recipient email обязателен.');
    }
    if (!payload.text) {
        throw new Error('Текст email обязателен.');
    }

    const outbox = await createOutboxBaseRecord({
        db,
        taskId,
        commentId: payloadInput?.commentId || null,
        actorId: payloadInput?.actorId || null,
        payload,
        dryRun: !config.enabled
    });

    if (!config.enabled) {
        return buildGenericOutboxResult(outbox);
    }

    try {
        requireSmtpConfig(config);
        const transporter = buildTransporter(config);
        const sent = await transporter.sendMail({
            from: payload.from,
            to: payload.to,
            subject: payload.subject,
            text: payload.text,
            headers: {
                ...(payload.inReplyTo ? { 'In-Reply-To': payload.inReplyTo } : {}),
                ...(payload.references ? { References: payload.references } : {})
            }
        });
        const sentOutbox = await markOutboxAsSent(db, outbox.id, sent);
        return buildGenericOutboxResult(sentOutbox);
    } catch (error) {
        const failedOutbox = await markOutboxAsFailed(db, outbox.id, error, config, outbox.attempts || 0);
        await notifyAdminsAboutOutboundFailure({
            outboxId: failedOutbox.id,
            taskId,
            recipientEmail: failedOutbox.recipientEmail,
            subject: failedOutbox.subject,
            status: failedOutbox.status,
            errorMessage: failedOutbox.errorMessage,
            phase: 'initial_send'
        });
        return buildGenericOutboxResult(failedOutbox, {
            sendError: 'Письмо не отправлено: поставлено в очередь повторной отправки.'
        });
    }
};

const createTaskCommentAndFirstResponse = async(db, taskId, actor, message) => {
    return db.$transaction(async(tx) => {
        const comment = await createReplyComment(tx, taskId, actor.id, message);
        await markTaskFirstResponse(taskId, actor, tx);
        return comment;
    });
};

const sendTaskEmailReply = async(taskId, message, actor, options = {}) => {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) {
        throw new Error('Текст email-ответа обязателен.');
    }

    const config = {
        ...getEmailOutboundConfig(),
        ...(options.config || {})
    };
    const db = options.db || prisma;

    const task = await db.task.findUnique({
        where: { id: taskId },
        include: {
            assignees: true
        }
    });
    await assertEmailReplyAccess(task, actor, db);

    const inbound = await getLatestInboundMessage(taskId, db);
    const previousOutbound = await getLatestOutboundMessageWithMessageId(taskId, db);
    const payload = buildReplyPayload({
        task,
        inbound,
        previousOutbound,
        message: normalizedMessage,
        config
    });

    const comment = await createTaskCommentAndFirstResponse(db, taskId, actor, normalizedMessage);

    if (!config.enabled) {
        const outbox = await createOutboxBaseRecord({
            db,
            taskId,
            commentId: comment.id,
            actorId: actor.id,
            payload,
            dryRun: true
        });

        const result = buildReplyResult({
            taskId,
            payload,
            commentId: comment.id,
            outbox,
            dryRun: true
        });

        await safeRecordTimelineEvent({
            taskId,
            actorId: actor.id,
            type: 'EMAIL_REPLY_SENT',
            title: 'Отправлен email-ответ',
            description: payload.subject,
            metadata: {
                recipient: payload.to,
                dryRun: true,
                subject: payload.subject,
                outboxId: outbox.id,
                status: outbox.status
            }
        }, db);

        await notifyCommentCreatedFromEmailReply(taskId, comment, actor);

        return result;
    }

    const outbox = await createOutboxBaseRecord({
        db,
        taskId,
        commentId: comment.id,
        actorId: actor.id,
        payload,
        dryRun: false
    });

    try {
        requireSmtpConfig(config);
        const transporter = buildTransporter(config);
        const sent = await transporter.sendMail({
            from: payload.from,
            to: payload.to,
            subject: payload.subject,
            text: payload.text,
            headers: payload.headers
        });
        const sentOutbox = await markOutboxAsSent(db, outbox.id, sent);

        const result = buildReplyResult({
            taskId,
            payload,
            commentId: comment.id,
            outbox: sentOutbox,
            dryRun: false
        });

        await safeRecordTimelineEvent({
            taskId,
            actorId: actor.id,
            type: 'EMAIL_REPLY_SENT',
            title: 'Отправлен email-ответ',
            description: payload.subject,
            metadata: {
                recipient: payload.to,
                dryRun: false,
                subject: payload.subject,
                outboxId: sentOutbox.id,
                status: sentOutbox.status
            }
        }, db);

        await notifyCommentCreatedFromEmailReply(taskId, comment, actor);

        return result;
    } catch (error) {
        const failedOutbox = await markOutboxAsFailed(db, outbox.id, error, config, outbox.attempts || 0);
        await notifyAdminsAboutOutboundFailure({
            outboxId: failedOutbox.id,
            taskId,
            recipientEmail: failedOutbox.recipientEmail,
            subject: failedOutbox.subject,
            status: failedOutbox.status,
            errorMessage: failedOutbox.errorMessage,
            phase: 'task_email_reply'
        });
        const result = buildReplyResult({
            taskId,
            payload,
            commentId: comment.id,
            outbox: failedOutbox,
            dryRun: false,
            partialErrorMessage: 'Письмо не отправлено: поставлено в очередь повторной отправки.'
        });

        await safeRecordTimelineEvent({
            taskId,
            actorId: actor.id,
            type: 'EMAIL_REPLY_SENT',
            title: 'Email-ответ поставлен в очередь повтора',
            description: payload.subject,
            metadata: {
                recipient: payload.to,
                dryRun: false,
                subject: payload.subject,
                outboxId: failedOutbox.id,
                status: failedOutbox.status
            }
        }, db);

        await notifyCommentCreatedFromEmailReply(taskId, comment, actor);

        return result;
    }
};

const loadTaskForThreadAccess = async(taskId, actor, db = prisma) => {
    const task = await db.task.findUnique({
        where: { id: taskId },
        select: EMAIL_THREAD_TASK_ACCESS_SELECT
    });

    if (!task) {
        throw new Error('Task not found');
    }

    const context = await getTaskAccessContext(actor, db);
    if (!hasTaskAccess(task, actor, context)) {
        throw new Error('Access denied');
    }

    return context;
};

const serializeInboundThreadItem = (inbound) => ({
    id: inbound.id,
    direction: 'INBOUND',
    messageId: inbound.messageId,
    subject: inbound.subject || null,
    fromEmail: inbound.fromEmail,
    fromName: inbound.fromName || null,
    toEmail: null,
    textPreview: inbound.textPreview || null,
    status: 'RECEIVED',
    dryRun: false,
    inReplyTo: null,
    references: null,
    createdAt: serializeDate(inbound.createdAt),
    receivedAt: serializeDate(inbound.receivedAt)
});

const serializeOutboundThreadItem = (outbound, canSeeInternalTechnical) => ({
    id: outbound.id,
    direction: 'OUTBOUND',
    messageId: outbound.messageId || outbound.providerMessageId || null,
    subject: outbound.subject,
    fromEmail: outbound.fromEmail,
    fromName: null,
    toEmail: outbound.recipientEmail,
    textPreview: outbound.textPreview || null,
    status: canSeeInternalTechnical ? outbound.status : null,
    dryRun: outbound.dryRun,
    inReplyTo: outbound.inReplyTo || null,
    references: outbound.references || null,
    commentId: outbound.commentId || null,
    attempts: canSeeInternalTechnical ? outbound.attempts : null,
    errorMessage: canSeeInternalTechnical ? (outbound.errorMessage || null) : null,
    lastAttemptAt: canSeeInternalTechnical ? serializeDate(outbound.lastAttemptAt) : null,
    nextRetryAt: canSeeInternalTechnical ? serializeDate(outbound.nextRetryAt) : null,
    createdAt: serializeDate(outbound.createdAt),
    updatedAt: serializeDate(outbound.updatedAt)
});

const listTaskEmailThread = async(taskId, actor, options = {}) => {
    const db = options.db || prisma;
    const context = await loadTaskForThreadAccess(taskId, actor, db);
    const canSeeInternalTechnical = context.isAdmin || context.isAgent;

    const [inboundMessages, outboundMessages] = await Promise.all([
        db.emailInboundMessage.findMany({
            where: { taskId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
        }),
        db.emailOutboundMessage.findMany({
            where: { taskId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
        })
    ]);

    const inbound = inboundMessages.map(serializeInboundThreadItem);
    const outbound = outboundMessages.map((item) => serializeOutboundThreadItem(item, canSeeInternalTechnical));
    const messages = [...inbound, ...outbound].sort((a, b) => {
        const left = new Date(a.createdAt).getTime();
        const right = new Date(b.createdAt).getTime();
        if (left !== right) {
            return left - right;
        }
        return String(a.id).localeCompare(String(b.id));
    });

    return {
        taskId,
        messages
    };
};

const listEmailOutbox = async(filters = {}, options = {}) => {
    const db = options.db || prisma;
    const where = {};
    const limit = parseOutboxListLimit(filters.limit);

    if (filters.status) {
        where.status = filters.status;
    }
    if (filters.taskId) {
        where.taskId = String(filters.taskId);
    }

    return db.emailOutboundMessage.findMany({
        where,
        include: OUTBOX_ADMIN_INCLUDE,
        orderBy: [
            { createdAt: 'desc' },
            { id: 'desc' }
        ],
        take: limit
    });
};

const buildRetryableWhere = (config, now, { requireDueAt = true } = {}) => {
    const where = {
        status: {
            in: EMAIL_OUTBOUND_RETRY_STATUSES
        },
        attempts: {
            lt: config.maxAttempts
        }
    };

    if (requireDueAt) {
        where.OR = [
            { nextRetryAt: null },
            { nextRetryAt: { lte: now } }
        ];
    }

    return where;
};

const retryOutboundMessageById = async(outboxId, options = {}) => {
    const db = options.db || prisma;
    const config = {
        ...getEmailOutboundConfig(),
        ...(options.config || {})
    };
    const source = options.source || 'manual';
    const workerId = normalizeRetryWorkerId(source, options.workerId);
    const requireDueAt = options.requireDueAt === true;

    const outbox = await db.emailOutboundMessage.findUnique({
        where: { id: outboxId }
    });
    if (!outbox) {
        throw new Error('OUTBOX_NOT_FOUND');
    }

    if (EMAIL_OUTBOUND_NON_RETRYABLE_STATUSES.includes(outbox.status)) {
        return {
            id: outbox.id,
            status: outbox.status,
            skipped: true,
            reason: outbox.status
        };
    }

    if (!EMAIL_OUTBOUND_RETRY_STATUSES.includes(outbox.status)) {
        return {
            id: outbox.id,
            status: outbox.status,
            skipped: true,
            reason: 'STATUS_NOT_RETRYABLE'
        };
    }

    if ((outbox.attempts || 0) >= config.maxAttempts) {
        if (outbox.status !== 'FAILED') {
            await db.emailOutboundMessage.update({
                where: { id: outbox.id },
                data: {
                    status: 'FAILED',
                    nextRetryAt: null,
                    lockedAt: null,
                    lockedBy: null
                }
            });
        }
        return {
            id: outbox.id,
            status: 'FAILED',
            skipped: true,
            reason: 'MAX_ATTEMPTS_REACHED'
        };
    }

    const claimedOutbox = await claimOutboxRecord(db, outbox.id, config, {
        source,
        workerId,
        requireDueAt
    });

    if (!claimedOutbox) {
        const fresh = await db.emailOutboundMessage.findUnique({
            where: { id: outbox.id }
        });

        return {
            id: outbox.id,
            status: fresh?.status || outbox.status,
            skipped: true,
            reason: 'LOCKED_OR_NOT_DUE'
        };
    }

    const now = new Date();
    if (!config.enabled) {
        const updated = await db.emailOutboundMessage.update({
            where: { id: claimedOutbox.id },
            data: {
                status: 'DRY_RUN',
                dryRun: true,
                errorMessage: null,
                attempts: {
                    increment: 1
                },
                lastAttemptAt: now,
                nextRetryAt: null,
                lockedAt: null,
                lockedBy: null
            }
        });

        if (claimedOutbox.status === 'FAILED' || claimedOutbox.errorMessage) {
            await notifyAdminsAboutOutboundRecovery({
                outboxId: updated.id,
                taskId: updated.taskId,
                recipientEmail: updated.recipientEmail,
                subject: updated.subject,
                status: updated.status,
                phase: 'retry'
            });
        }

        return {
            id: updated.id,
            status: updated.status,
            skipped: false,
            reason: 'OUTBOUND_DISABLED'
        };
    }

    try {
        requireSmtpConfig(config);
        const transporter = buildTransporter(config);
        const sent = await transporter.sendMail({
            from: claimedOutbox.fromEmail,
            to: claimedOutbox.recipientEmail,
            subject: claimedOutbox.subject,
            text: claimedOutbox.bodyText || claimedOutbox.textPreview || '',
            headers: {
                ...(claimedOutbox.inReplyTo ? { 'In-Reply-To': claimedOutbox.inReplyTo } : {}),
                ...(claimedOutbox.references ? { References: claimedOutbox.references } : {})
            }
        });

        const providerMessageId = sent?.messageId ? String(sent.messageId).slice(0, 255) : null;
        const updated = await db.emailOutboundMessage.update({
            where: { id: claimedOutbox.id },
            data: {
                status: 'SENT',
                dryRun: false,
                providerMessageId,
                messageId: providerMessageId,
                errorMessage: null,
                attempts: {
                    increment: 1
                },
                lastAttemptAt: now,
                nextRetryAt: null,
                lockedAt: null,
                lockedBy: null
            }
        });

        return {
            id: updated.id,
            status: updated.status,
            skipped: false,
            reason: null
        };
    } catch (error) {
        const updated = await markOutboxAsFailed(
            db,
            claimedOutbox.id,
            error,
            config,
            claimedOutbox.attempts || 0
        );
        await notifyAdminsAboutOutboundFailure({
            outboxId: updated.id,
            taskId: updated.taskId,
            recipientEmail: updated.recipientEmail,
            subject: updated.subject,
            status: updated.status,
            errorMessage: updated.errorMessage,
            phase: 'retry'
        });

        return {
            id: updated.id,
            status: updated.status,
            skipped: false,
            reason: 'SEND_FAILED'
        };
    }
};

const retryPendingOutboundMessages = async(options = {}) => {
    const db = options.db || prisma;
    const config = {
        ...getEmailOutboundConfig(),
        ...(options.config || {})
    };
    const limit = parseBatchLimit(
        Number.isFinite(options.limit) ? options.limit : (config.workerBatchSize || config.retryBatchLimit),
        config.workerBatchSize || config.retryBatchLimit
    );

    const now = new Date();
    const lockExpiresAt = computeLockExpiresAt(now, config.lockTtlMs);
    const retryableWhere = buildRetryableWhere(config, now, { requireDueAt: true });
    const records = await db.emailOutboundMessage.findMany({
        where: {
            status: retryableWhere.status,
            attempts: retryableWhere.attempts,
            AND: [
                { OR: retryableWhere.OR },
                buildLockAvailabilityWhere(lockExpiresAt)
            ]
        },
        orderBy: [
            { nextRetryAt: 'asc' },
            { createdAt: 'asc' }
        ],
        take: limit
    });

    const results = [];
    for (const record of records) {
        const result = await retryOutboundMessageById(record.id, {
            db,
            config,
            source: options.source || 'batch',
            workerId: options.workerId,
            requireDueAt: true
        });
        results.push(result);
    }

    return {
        processed: results.filter((item) => !item.skipped).length,
        scanned: records.length,
        results
    };
};

const getEmailHealth = async(options = {}) => {
    const db = options.db || prisma;
    const config = {
        ...getEmailOutboundConfig(),
        ...(options.config || {})
    };

    const now = new Date();
    const lockExpiresAt = computeLockExpiresAt(now, config.lockTtlMs);
    const retryableWhere = buildRetryableWhere(config, now, { requireDueAt: true });

    const [
        grouped,
        retryableCount,
        lockedCount,
        oldestPendingOrFailed,
        totalCount
    ] = await Promise.all([
        db.emailOutboundMessage.groupBy({
            by: ['status'],
            _count: { _all: true }
        }),
        db.emailOutboundMessage.count({
            where: retryableWhere
        }),
        db.emailOutboundMessage.count({
            where: {
                lockedAt: {
                    gt: lockExpiresAt
                }
            }
        }),
        db.emailOutboundMessage.aggregate({
            where: {
                status: {
                    in: EMAIL_OUTBOUND_RETRY_STATUSES
                }
            },
            _min: {
                createdAt: true
            }
        }),
        db.emailOutboundMessage.count()
    ]);

    const byStatus = {
        DRY_RUN: 0,
        SENT: 0,
        FAILED: 0,
        RETRY_PENDING: 0
    };

    for (const item of grouped) {
        byStatus[item.status] = item._count?._all || 0;
    }

    return {
        outboundEnabled: config.enabled,
        workerEnabled: config.workerEnabled,
        workerIntervalMs: config.workerIntervalMs,
        workerBatchSize: config.workerBatchSize || config.retryBatchLimit,
        lockTtlMs: config.lockTtlMs,
        maxAttempts: config.maxAttempts,
        outbox: {
            total: totalCount,
            byStatus,
            retryable: retryableCount,
            locked: lockedCount,
            oldestPendingOrFailedAt: serializeDate(oldestPendingOrFailed?._min?.createdAt || null)
        },
        smtp: {
            hostMasked: maskValue(config.host, { visibleStart: 3, visibleEnd: 3 }),
            port: config.port || null,
            secure: Boolean(config.secure),
            userMasked: maskValue(config.user),
            fromAddressMasked: maskValue(config.fromAddress)
        }
    };
};

module.exports = {
    getEmailOutboundConfig,
    queueOutboundEmail,
    sendTaskEmailReply,
    listTaskEmailThread,
    listEmailOutbox,
    getEmailHealth,
    retryOutboundMessageById,
    retryPendingOutboundMessages
};
