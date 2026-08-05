const prisma = require('../prisma/prisma.js');
const { queueOutboundEmail } = require('./email-outbound.service.js');
const productSettingsService = require('./product-settings.service.js');
const emailSettingsService = require('./email-settings.service.js');
const {
    normalizeRole,
    isAdminRole,
    isAgentRole,
    isRequesterRole
} = require('../utils/roles.js');

const NOTIFICATION_DEFAULT_LIMIT = 20;
const NOTIFICATION_MAX_LIMIT = 100;
const AGENT_COMPATIBILITY_ROLES = ['AGENT'];

const TASK_NOTIFICATION_SELECT = {
    id: true,
    updatedAt: true,
    ticketNumber: true,
    title: true,
    status: true,
    description: true,
    priority: true,
    folderId: true,
    folder: { select: { id: true, name: true } },
    type: { select: { id: true, name: true } },
    subtype: { select: { id: true, name: true } },
    team: {
        select: {
            id: true,
            name: true,
            isActive: true,
            members: {
                where: { user: { isActive: true } },
                select: {
                    user: {
                        select: { id: true, name: true, email: true, role: true }
                    }
                }
            }
        }
    },
    authorId: true,
    author: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true
        }
    },
    assignees: {
        select: {
            id: true,
            userId: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                }
            }
        }
    }
};

const NOTIFICATION_INCLUDE = {
    task: {
        select: {
            id: true,
            ticketNumber: true,
            title: true
        }
    }
};

const toBoolean = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const getNotificationConfig = () => {
    const settings = emailSettingsService.getRuntimeEmailSettings();
    return { emailEnabled: settings.notificationsEnabled, portalBaseUrl: String(settings.portalBaseUrl || '').trim() || null };
};

const renderTemplate = (template, variables) => String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => String(variables[key] ?? ''));
const notificationVariables = (task, extra = {}) => {
    const config = getNotificationConfig();
    const url = buildTaskLink(task, config);
    return { ticketNumber: task?.ticketNumber || '', title: task?.title || '', status: task?.status || '', priority: task?.priority || '',
        description: task?.description || '',
        requesterName: task?.author?.name || task?.author?.email || 'пользователь', portalUrl: url || '',
        portalLink: url ? `Открыть заявку: ${url}` : '', ...extra };
};

const queueRequesterTemplate = async(task, kind, extra = {}, db = prisma, dedupeKey = null) => {
    const settings = emailSettingsService.getRuntimeEmailSettings();
    const enabled = settings.notificationsEnabled && settings[`notifyRequester${kind}`];
    if (!enabled || !task?.author?.email || !(await productSettingsService.isFeatureEnabled('email', db))) return null;
    const prefix = kind.charAt(0).toLowerCase() + kind.slice(1);
    const variables = notificationVariables(task, extra);
    return queueOutboundEmail({ taskId: task.id, actorId: null, dedupeKey, to: task.author.email, recipientName: task.author.name || null,
        subject: renderTemplate(settings[`${prefix}SubjectTemplate`], variables), text: renderTemplate(settings[`${prefix}BodyTemplate`], variables) }, { db });
};

const queueAssigneeNotification = async(task, assignee, db = prisma, dedupeKey = null) => {
    const settings = emailSettingsService.getRuntimeEmailSettings();
    if (!settings.notificationsEnabled || !settings.notifyAssigneeAssigned || !assignee?.email
        || !(await productSettingsService.isFeatureEnabled('email', db))) return null;
    const variables = notificationVariables(task, { assigneeName: assignee.name || assignee.email });
    return queueOutboundEmail({ taskId: task.id, actorId: null, dedupeKey, to: assignee.email, recipientName: assignee.name || null,
        subject: renderTemplate(settings.assigneeSubjectTemplate, variables),
        text: renderTemplate(settings.assigneeBodyTemplate, variables) }, { db });
};

const queueTeamNewTaskNotifications = async(task, db = prisma) => {
    const settings = emailSettingsService.getRuntimeEmailSettings();
    if (!settings.notificationsEnabled
        || !settings.notifyTeamNewTask
        || !task?.team?.isActive
        || !(await productSettingsService.isFeatureEnabled('email', db))) {
        return [];
    }

    const members = dedupeRecipients(task.team.members.map((membership) => membership.user).filter(Boolean));
    const results = [];
    for (const member of members) {
        if (!member.email) continue;
        const variables = notificationVariables(task, {
            memberName: member.name || member.email,
            teamName: task.team.name,
            folderName: task.folder?.name || 'Без папки',
            typeName: task.type?.name || 'Не указан',
            subtypeName: task.subtype?.name || 'Не указан'
        });
        results.push(await queueOutboundEmail({
            taskId: task.id,
            actorId: null,
            dedupeKey: `team-new-task:${task.id}:${task.team.id}:${member.id}`,
            to: member.email,
            recipientName: member.name || null,
            subject: renderTemplate(settings.teamNewTaskSubjectTemplate, variables),
            text: renderTemplate(settings.teamNewTaskBodyTemplate, variables)
        }, { db }));
    }
    return results.filter(Boolean);
};

const parseLimit = (value) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return NOTIFICATION_DEFAULT_LIMIT;
    }
    return Math.min(parsed, NOTIFICATION_MAX_LIMIT);
};

const cloneJson = (value) => {
    if (value === undefined || value === null) {
        return null;
    }
    return JSON.parse(JSON.stringify(value));
};

const buildCursor = (notification) => {
    if (!notification?.id || !notification?.createdAt) {
        return null;
    }

    return Buffer.from(JSON.stringify({
        id: notification.id,
        createdAt: notification.createdAt instanceof Date
            ? notification.createdAt.toISOString()
            : new Date(notification.createdAt).toISOString()
    })).toString('base64');
};

const parseCursor = (cursor) => {
    if (!cursor) {
        return null;
    }

    try {
        const decoded = JSON.parse(Buffer.from(String(cursor), 'base64').toString('utf8'));
        if (!decoded?.id || !decoded?.createdAt) {
            return null;
        }
        const createdAt = new Date(decoded.createdAt);
        if (Number.isNaN(createdAt.getTime())) {
            return null;
        }
        return {
            id: String(decoded.id),
            createdAt
        };
    } catch (error) {
        return null;
    }
};

const serializeNotification = (notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    taskId: notification.taskId || null,
    task: notification.task
        ? {
            id: notification.task.id,
            ticketNumber: notification.task.ticketNumber,
            title: notification.task.title
        }
        : null,
    metadata: cloneJson(notification.metadata),
    createdAt: new Date(notification.createdAt).toISOString()
});

const createNotificationRecord = async(payload, db = prisma) => {
    if (!(await productSettingsService.isFeatureEnabled('notifications', db))) {
        return null;
    }

    const data = {
        userId: payload.userId,
        type: payload.type,
        title: payload.title || 'Уведомление',
        message: payload.message,
        taskId: payload.taskId || null,
        eventKey: payload.eventKey || null,
        metadata: cloneJson(payload.metadata),
        emailOutboxId: payload.emailOutboxId || null,
        isRead: false,
        readAt: null
    };

    try {
        return await db.notification.create({
            data,
            include: NOTIFICATION_INCLUDE
        });
    } catch (error) {
        if (error.code === 'P2002' && data.eventKey) {
            return db.notification.findFirst({
                where: {
                    userId: data.userId,
                    eventKey: data.eventKey
                },
                include: NOTIFICATION_INCLUDE
            });
        }
        throw error;
    }
};

const createNotification = async(userIdOrPayload, legacyType, legacyMessage, legacyTaskId, options = {}) => {
    const db = options.db || prisma;

    if (typeof userIdOrPayload === 'object' && userIdOrPayload !== null) {
        return createNotificationRecord(userIdOrPayload, db);
    }

    return createNotificationRecord({
        userId: userIdOrPayload,
        type: legacyType,
        title: 'Уведомление',
        message: legacyMessage,
        taskId: legacyTaskId || null
    }, db);
};

const createNotificationsBulk = async(items = [], options = {}) => {
    const db = options.db || prisma;
    const results = [];
    for (const item of items) {
        const created = await createNotificationRecord(item, db);
        if (created) {
            results.push(created);
        }
    }
    return results;
};

const getFolderAgentRecipients = async(folderId, db = prisma) => {
    if (!folderId) {
        return [];
    }

    const memberships = await db.supportTeamMember.findMany({
        where: {
            team: {
                isActive: true,
                OR: [
                    { folderId },
                    {
                        folderAccesses: {
                            some: { folderId }
                        }
                    }
                ]
            },
            user: {
                role: {
                    in: AGENT_COMPATIBILITY_ROLES
                }
            }
        },
        select: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                }
            }
        }
    });

    const users = memberships.map((item) => item.user).filter(Boolean);
    return [...new Map(users.map((user) => [user.id, user])).values()];
};

const getAdminRecipients = async(db = prisma) => {
    return db.user.findMany({
        where: { role: 'ADMIN' },
        select: {
            id: true,
            name: true,
            email: true,
            role: true
        }
    });
};

const getTaskNotificationContext = async(taskId, db = prisma) => {
    return db.task.findUnique({
        where: { id: taskId },
        select: TASK_NOTIFICATION_SELECT
    });
};

const buildTaskLink = (task, config = getNotificationConfig()) => {
    if (!config.portalBaseUrl || !task?.id) {
        return null;
    }

    return `${config.portalBaseUrl.replace(/\/+$/, '')}/tasks/${task.id}`;
};

const buildTaskLabel = (task) => {
    if (!task) {
        return 'заявка';
    }

    const numberPart = task.ticketNumber ? `#${task.ticketNumber}` : 'Заявка';
    return `${numberPart} ${task.title}`.trim();
};

const buildNotificationEmailBody = ({ task, title, message }) => {
    const config = getNotificationConfig();
    const link = buildTaskLink(task, config);
    const lines = [
        title,
        '',
        message,
        '',
        `Заявка: ${buildTaskLabel(task)}`,
        `Статус: ${task?.status || 'NEW'}`
    ];

    if (link) {
        lines.push(`Ссылка: ${link}`);
    }

    return lines.join('\n');
};

const maybeQueueNotificationEmail = async({ recipient, task, title, message, eventKey, db = prisma }) => {
    const config = getNotificationConfig();
    if (!config.emailEnabled
        || !(await productSettingsService.isFeatureEnabled('email', db))
        || !recipient?.email
        || !task?.id) {
        return null;
    }

    return queueOutboundEmail({
        taskId: task.id,
        actorId: null,
        dedupeKey: eventKey ? `notification:${eventKey}:${recipient.id || recipient.email}` : null,
        to: recipient.email,
        recipientName: recipient.name || null,
        subject: `${buildTaskLabel(task)}: ${title}`,
        text: buildNotificationEmailBody({ task, title, message })
    }, { db });
};

const dedupeRecipients = (users = [], excludedUserIds = []) => {
    const excluded = new Set(excludedUserIds.filter(Boolean));
    return [...new Map(
        users
            .filter((user) => user?.id && !excluded.has(user.id))
            .map((user) => [user.id, user])
    ).values()];
};

const createNotificationsForUsers = async({
    users,
    type,
    title,
    message,
    task,
    eventKeyBase,
    metadata,
    sendEmail = false,
    db = prisma
}) => {
    const recipients = dedupeRecipients(users);
    const results = [];

    for (const user of recipients) {
        const eventKey = eventKeyBase ? `${eventKeyBase}:${user.id}` : null;

        if (eventKey) {
            const existing = await db.notification.findFirst({
                where: {
                    userId: user.id,
                    eventKey
                },
                include: NOTIFICATION_INCLUDE
            });

            if (existing) {
                results.push(existing);
                continue;
            }
        }

        const notification = await createNotificationRecord({
            userId: user.id,
            type,
            title,
            message,
            taskId: task?.id || null,
            eventKey,
            metadata
        }, db);

        if (sendEmail) {
            const emailOutbox = await maybeQueueNotificationEmail({
                recipient: user,
                task,
                title,
                message,
                eventKey: eventKeyBase,
                db
            });

            if (notification && emailOutbox?.outboxId) {
                await db.notification.update({
                    where: { id: notification.id },
                    data: {
                        emailOutboxId: emailOutbox.outboxId
                    }
                });
            }
        }

        if (notification) {
            results.push(notification);
        }
    }

    return results;
};

const notifyTaskCreated = async(taskId, actor, options = {}) => {
    const db = options.db || prisma;
    const task = await getTaskNotificationContext(taskId, db);
    if (!task) {
        return [];
    }

    const channel = options.channel === 'EMAIL' ? 'EMAIL' : 'WEB';
    const teamMembers = task.team?.isActive
        ? task.team.members.map((membership) => membership.user).filter(Boolean)
        : [];
    const recipients = teamMembers.length > 0
        ? teamMembers
        : await getFolderAgentRecipients(task.folderId, db);
    const title = channel === 'EMAIL' ? 'Новая заявка из почты' : 'Новая заявка';
    const message = task.team
        ? `${buildTaskLabel(task)} поступила в очередь команды «${task.team.name}».`
        : `${buildTaskLabel(task)} создана и доступна в вашей папке.`;

    const results = await createNotificationsForUsers({
        users: recipients,
        type: channel === 'EMAIL' ? 'TASK_CREATED_EMAIL' : 'TASK_CREATED_WEB',
        title,
        message,
        task,
        eventKeyBase: `task-created:${channel.toLowerCase()}:${task.id}`,
        metadata: {
            channel,
            taskId: task.id
        },
        sendEmail: false,
        db
    });
    await queueTeamNewTaskNotifications(task, db);
    await queueRequesterTemplate(task, 'Created', {}, db, `requester-created:${task.id}`);
    return results;
};

const notifyCommentCreated = async(taskId, comment, actor, options = {}) => {
    const db = options.db || prisma;
    const task = await getTaskNotificationContext(taskId, db);
    if (!task) {
        return [];
    }

    const actorRole = normalizeRole(actor?.role);
    const folderAgents = await getFolderAgentRecipients(task.folderId, db);
    const assigneeUsers = task.assignees.map((item) => item.user).filter(Boolean);

    if (comment.visibility === 'INTERNAL') {
        return createNotificationsForUsers({
            users: dedupeRecipients([...folderAgents, ...assigneeUsers], [actor?.id]),
            type: 'AGENT_INTERNAL_NOTE',
            title: 'Новая внутренняя заметка',
            message: `По ${buildTaskLabel(task)} добавлена внутренняя заметка.`,
            task,
            eventKeyBase: `comment:internal:${comment.id}`,
            metadata: {
                commentId: comment.id,
                visibility: 'INTERNAL'
            },
            db
        });
    }

    if (isRequesterRole(actorRole)) {
        return createNotificationsForUsers({
            users: dedupeRecipients([...folderAgents, ...assigneeUsers], [actor?.id]),
            type: 'REQUESTER_COMMENT',
            title: 'Заявитель ответил в заявке',
            message: `По ${buildTaskLabel(task)} пришёл новый ответ заявителя.`,
            task,
            eventKeyBase: `comment:requester:${comment.id}`,
            metadata: {
                commentId: comment.id,
                visibility: 'PUBLIC'
            },
            db
        });
    }

    if ((isAgentRole(actorRole) || isAdminRole(actorRole)) && task.author) {
        const shouldEmailRequester = options.sendEmail === undefined
            ? true
            : Boolean(options.sendEmail);
        const results = await createNotificationsForUsers({
            users: [task.author],
            type: 'AGENT_PUBLIC_COMMENT',
            title: 'Новый ответ по заявке',
            message: `Исполнитель ответил по ${buildTaskLabel(task)}.`,
            task,
            eventKeyBase: `comment:agent-public:${comment.id}`,
            metadata: {
                commentId: comment.id,
                visibility: 'PUBLIC'
            },
            sendEmail: false,
            db
        });
        if (shouldEmailRequester) {
            await queueRequesterTemplate(
                task,
                'Comment',
                { comment: comment.content || comment.text || '' },
                db,
                `requester-comment:${comment.id}`
            );
        }
        return results;
    }

    return [];
};

const notifyTaskAssigned = async(taskId, assigneeUserId, actor, options = {}) => {
    const db = options.db || prisma;
    const task = await getTaskNotificationContext(taskId, db);
    if (!task) {
        return null;
    }

    const recipient = task.assignees.find((item) => item.userId === assigneeUserId)?.user
        || await db.user.findUnique({
            where: { id: assigneeUserId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true
            }
        });

    if (!recipient) {
        return null;
    }

    const results = await createNotificationsForUsers({
        users: [recipient],
        type: 'TASK_ASSIGNED',
        title: 'Вам назначена заявка',
        message: `${buildTaskLabel(task)} назначена вам в работу.`,
        task,
        eventKeyBase: `task-assigned:${task.id}:${assigneeUserId}`,
        metadata: {
            assigneeId: assigneeUserId,
            assignedByUserId: actor?.id || null
        },
        db
    });
    const assignmentId = task.assignees.find((item) => item.userId === assigneeUserId)?.id || assigneeUserId;
    await queueAssigneeNotification(task, recipient, db, `assignee-assigned:${task.id}:${assignmentId}`);
    if (task.author?.id !== actor?.id) {
        await queueRequesterTemplate(
            task,
            'Assigned',
            { assigneeName: recipient.name || recipient.email },
            db,
            `requester-assigned:${task.id}:${assignmentId}`
        );
    }
    return results;
};

const notifyTaskStatusChanged = async(taskId, oldStatus, newStatus, actor, options = {}) => {
    const db = options.db || prisma;
    const task = await getTaskNotificationContext(taskId, db);
    if (!task) {
        return [];
    }

    const recipients = dedupeRecipients([task.author, ...task.assignees.map((item) => item.user)], [actor?.id]);
    const results = await createNotificationsForUsers({
        users: recipients,
        type: 'TASK_STATUS_CHANGED',
        title: 'Статус заявки изменён',
        message: `${buildTaskLabel(task)} переведена из ${oldStatus} в ${newStatus}.`,
        task,
        eventKeyBase: `task-status:${task.id}:${newStatus}`,
        metadata: {
            fromStatus: oldStatus,
            toStatus: newStatus
        },
        db
    });
    if (task.author?.id !== actor?.id) {
        const statusEventAt = task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt || '');
        await queueRequesterTemplate(
            task,
            'Status',
            { oldStatus, status: newStatus },
            db,
            `requester-status:${task.id}:${oldStatus}:${newStatus}:${statusEventAt}`
        );
    }
    return results;
};

const notifyTaskMerged = async(masterTaskId, childTaskIds, actor, options = {}) => {
    const db = options.db || prisma;
    const tasks = await db.task.findMany({
        where: { id: { in: [masterTaskId, ...childTaskIds] } },
        select: TASK_NOTIFICATION_SELECT
    });

    const masterTask = tasks.find((task) => task.id === masterTaskId);
    if (!masterTask) {
        return [];
    }

    const participants = [];
    for (const task of tasks) {
        if (task.author) {
            participants.push(task.author);
        }
        participants.push(...task.assignees.map((item) => item.user).filter(Boolean));
    }

    return createNotificationsForUsers({
        users: dedupeRecipients(participants, [actor?.id]),
        type: 'TASK_MERGED',
        title: 'Заявки объединены',
        message: `${buildTaskLabel(masterTask)} объединена с другими связанными заявками.`,
        task: masterTask,
        eventKeyBase: `task-merged:${masterTaskId}:${childTaskIds.slice().sort().join(',')}`,
        metadata: {
            masterTaskId,
            childTaskIds: [...childTaskIds]
        },
        db
    });
};

const handleEmailOutboxFailureEvent = async(event, options = {}) => {
    const db = options.db || prisma;
    const admins = await getAdminRecipients(db);
    if (admins.length === 0) {
        return [];
    }

    const task = event?.taskId
        ? await db.task.findUnique({
            where: { id: event.taskId },
            select: TASK_NOTIFICATION_SELECT
        })
        : null;

    const status = event?.status || 'FAILED';
    return createNotificationsForUsers({
        users: admins,
        type: 'EMAIL_OUTBOUND_FAILED',
        title: 'Ошибка email-отправки',
        message: task
            ? `Не удалось отправить email по ${buildTaskLabel(task)}.`
            : 'Не удалось отправить одно из исходящих email-сообщений.',
        task,
        eventKeyBase: `email-outbox-failed:${event?.outboxId || 'unknown'}:${status}`,
        metadata: {
            outboxId: event?.outboxId || null,
            status,
            phase: event?.phase || null
        },
        db
    });
};

const handleEmailOutboxRecoveryEvent = async(event, options = {}) => {
    const db = options.db || prisma;
    const admins = await getAdminRecipients(db);
    if (admins.length === 0) {
        return [];
    }

    const task = event?.taskId
        ? await db.task.findUnique({
            where: { id: event.taskId },
            select: TASK_NOTIFICATION_SELECT
        })
        : null;

    return createNotificationsForUsers({
        users: admins,
        type: 'EMAIL_OUTBOUND_RECOVERED',
        title: 'Email доставлен после повтора',
        message: task
            ? `Повторная отправка email по ${buildTaskLabel(task)} завершилась успешно.`
            : 'Повторная отправка исходящего email завершилась успешно.',
        task,
        eventKeyBase: `email-outbox-recovered:${event?.outboxId || 'unknown'}`,
        metadata: {
            outboxId: event?.outboxId || null,
            phase: event?.phase || null
        },
        db
    });
};

const getNotifications = async(userId, filters = {}, options = {}) => {
    const db = options.db || prisma;
    const limit = parseLimit(filters.limit);
    const unreadOnly = toBoolean(filters.unreadOnly);
    const cursor = parseCursor(filters.cursor);

    const where = {
        userId,
        ...(unreadOnly ? { isRead: false } : {})
    };

    if (cursor) {
        where.OR = [
            { createdAt: { lt: cursor.createdAt } },
            {
                createdAt: cursor.createdAt,
                id: { lt: cursor.id }
            }
        ];
    }

    const rows = await db.notification.findMany({
        where,
        include: NOTIFICATION_INCLUDE,
        orderBy: [
            { createdAt: 'desc' },
            { id: 'desc' }
        ],
        take: limit + 1
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(serializeNotification);
    const lastItem = rows.slice(0, limit).at(-1);

    return {
        items,
        nextCursor: hasMore && lastItem ? buildCursor(lastItem) : null
    };
};

const getUnreadCount = async(userId, options = {}) => {
    const db = options.db || prisma;
    const unreadCount = await db.notification.count({
        where: {
            userId,
            isRead: false
        }
    });

    return { unreadCount };
};

const markRead = async(id, userId, options = {}) => {
    const db = options.db || prisma;
    const notification = await db.notification.findFirst({
        where: {
            id,
            userId
        },
        include: NOTIFICATION_INCLUDE
    });
    if (!notification) throw new Error('Notification not found or access denied');
    if (notification.isRead) {
        return serializeNotification(notification);
    }

    const updated = await db.notification.update({
        where: { id },
        data: {
            isRead: true,
            readAt: new Date()
        },
        include: NOTIFICATION_INCLUDE
    });
    return serializeNotification(updated);
};

const markAllRead = async(userId, options = {}) => {
    const db = options.db || prisma;
    const result = await db.notification.updateMany({
        where: {
            userId,
            isRead: false
        },
        data: {
            isRead: true,
            readAt: new Date()
        }
    });

    return { updatedCount: result.count };
};

module.exports = {
    getNotificationConfig,
    createNotification,
    createNotificationsBulk,
    getNotifications,
    getUnreadCount,
    markRead,
    markAllRead,
    notifyTaskCreated,
    notifyCommentCreated,
    notifyTaskAssigned,
    notifyTaskStatusChanged,
    notifyTaskMerged,
    renderTemplate,
    handleEmailOutboxFailureEvent,
    handleEmailOutboxRecoveryEvent
};
