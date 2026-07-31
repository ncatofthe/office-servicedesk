const prisma = require('../prisma/prisma.js');
const fs = require('fs');
const path = require('path');
const { uploadsDir } = require('../middlewares/upload.middleware.js');
const {
    buildStoredAttachmentPath,
    resolveStoredAttachmentFilename
} = require('../utils/attachment.utils.js');
const taskService = require('./task.service.js');
const productSettingsService = require('./product-settings.service.js');

const CHAT_USER_SELECT = {
    id: true,
    name: true,
    email: true,
    role: true,
    position: true,
    isActive: true
};

const CHAT_SETTINGS_ID = 'default';
const CHAT_SETTINGS_DEFAULTS = {
    chatsEnabled: true,
    directChatsEnabled: true,
    departmentChatsEnabled: true,
    ticketChatsEnabled: true,
    attachmentsEnabled: true,
    maxAttachmentSizeMb: 25
};
const CHAT_MESSAGE_INCLUDE = {
    author: { select: CHAT_USER_SELECT },
    attachments: { orderBy: { createdAt: 'asc' } }
};

const getSettings = async(db = prisma) => {
    const existing = await db.chatSettings.findUnique({ where: { id: CHAT_SETTINGS_ID } });
    if (existing) return existing;
    try {
        return await db.chatSettings.create({
            data: { id: CHAT_SETTINGS_ID, ...CHAT_SETTINGS_DEFAULTS }
        });
    } catch (error) {
        if (error.code !== 'P2002') throw error;
        return db.chatSettings.findUniqueOrThrow({ where: { id: CHAT_SETTINGS_ID } });
    }
};

const updateSettings = async(payload = {}) => {
    const booleanFields = [
        'chatsEnabled',
        'directChatsEnabled',
        'departmentChatsEnabled',
        'ticketChatsEnabled',
        'attachmentsEnabled'
    ];
    const allowedFields = [...booleanFields, 'maxAttachmentSizeMb'];
    const unsupported = Object.keys(payload).filter((field) => !allowedFields.includes(field));
    if (unsupported.length > 0) {
        throw new Error(`Неподдерживаемые настройки: ${unsupported.join(', ')}.`);
    }

    const data = {};
    booleanFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
            if (typeof payload[field] !== 'boolean') {
                throw new Error(`${field} должен быть boolean.`);
            }
            data[field] = payload[field];
        }
    });
    if (Object.prototype.hasOwnProperty.call(payload, 'maxAttachmentSizeMb')) {
        const size = Number(payload.maxAttachmentSizeMb);
        if (!Number.isInteger(size) || size < 1 || size > 50) {
            throw new Error('Лимит вложения должен быть от 1 до 50 МБ.');
        }
        data.maxAttachmentSizeMb = size;
    }
    if (Object.keys(data).length === 0) {
        throw new Error('Нет настроек для сохранения.');
    }

    await getSettings();
    return prisma.$transaction(async(tx) => {
        if (Object.prototype.hasOwnProperty.call(data, 'chatsEnabled')) {
            await productSettingsService.getProductSettings(tx);
            await tx.productSettings.update({
                where: { id: productSettingsService.PRODUCT_SETTINGS_ID },
                data: { chatsEnabled: data.chatsEnabled }
            });
        }

        return tx.chatSettings.update({
            where: { id: CHAT_SETTINGS_ID },
            data
        });
    });
};

const normalizeContent = (content, { allowEmpty = false } = {}) => {
    if (typeof content !== 'string') {
        if (allowEmpty && (content === undefined || content === null)) return '';
        throw new Error('Введите текст сообщения.');
    }

    const normalized = content.trim();
    if (!normalized && !allowEmpty) {
        throw new Error('Сообщение не может быть пустым.');
    }
    if (normalized.length > 5000) {
        throw new Error('Сообщение не должно превышать 5000 символов.');
    }

    return normalized;
};

const mapAttachment = (attachment) => ({
    ...attachment,
    path: `/api/chats/attachments/${attachment.id}/download`
});

const serializeMessage = (message) => ({
    ...message,
    attachments: (message.attachments || []).map(mapAttachment)
});

const resolveUploadPath = (storedPath) => {
    const filename = resolveStoredAttachmentFilename(storedPath);
    return filename ? path.join(uploadsDir, filename) : null;
};

const deleteStoredFiles = (storedPaths = []) => {
    storedPaths.forEach((storedPath) => {
        const absolutePath = resolveUploadPath(storedPath);
        if (!absolutePath) return;
        try {
            if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('[chat-attachments] Failed to delete file', { storedPath, error: error.message });
            }
        }
    });
};

const assertChatsEnabled = async(kind = null) => {
    const settings = await getSettings();
    if (!settings.chatsEnabled) {
        throw new Error('Чаты отключены администратором.');
    }
    if ((kind === 'DIRECT' || kind === 'GROUP') && !settings.directChatsEnabled) {
        throw new Error('Личные чаты отключены администратором.');
    }
    if (kind === 'DEPARTMENT' && !settings.departmentChatsEnabled) {
        throw new Error('Чаты отделов отключены администратором.');
    }
    return settings;
};

const getDirectKey = (firstUserId, secondUserId) => [firstUserId, secondUserId].sort().join(':');

const assertMembership = async(chatId, userId) => {
    const membership = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
        include: { chat: { select: { kind: true, createdById: true } } }
    });

    if (!membership) {
        throw new Error('Chat not found');
    }

    await assertChatsEnabled(membership.chat.kind);
    return membership;
};

const syncDepartmentThread = async(departmentId, actorId) => {
    const department = await prisma.department.findFirst({
        where: {
            id: departmentId,
            isActive: true,
            memberships: { some: { userId: actorId, user: { isActive: true } } }
        },
        select: {
            id: true,
            name: true,
            memberships: {
                where: { user: { isActive: true } },
                select: { userId: true }
            }
        }
    });

    if (!department) {
        return null;
    }

    return prisma.$transaction(async(tx) => {
        const chat = await tx.chatThread.upsert({
            where: { departmentId },
            update: { title: department.name },
            create: {
                kind: 'DEPARTMENT',
                title: department.name,
                departmentId,
                createdById: actorId
            }
        });

        const activeUserIds = department.memberships.map((membership) => membership.userId);
        if (activeUserIds.length > 0) {
            await tx.chatMember.createMany({
                data: activeUserIds.map((userId) => ({ chatId: chat.id, userId })),
                skipDuplicates: true
            });
            await tx.chatMember.deleteMany({
                where: {
                    chatId: chat.id,
                    userId: { notIn: activeUserIds }
                }
            });
        }

        return chat;
    });
};

const ensureActorDepartmentThreads = async(actorId) => {
    const memberships = await prisma.userDepartment.findMany({
        where: {
            userId: actorId,
            user: { isActive: true },
            department: { isActive: true }
        },
        select: { departmentId: true }
    });

    await Promise.all(memberships.map(({ departmentId }) => syncDepartmentThread(departmentId, actorId)));
};

const serializeThread = async(chat, actorId) => {
    const membership = chat.members.find((member) => member.userId === actorId);
    const lastMessage = chat.messages[0] || null;
    const unreadCount = await prisma.chatMessage.count({
        where: {
            chatId: chat.id,
            authorId: { not: actorId },
            ...(membership?.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {})
        }
    });

    return {
        id: chat.id,
        kind: chat.kind,
        createdById: chat.createdById || null,
        title: chat.kind === 'DEPARTMENT'
            ? (chat.department?.name || chat.title || 'Отдел')
            : (chat.title || null),
        department: chat.department,
        members: chat.members.map((member) => ({
            userId: member.userId,
            user: member.user,
            lastReadAt: member.lastReadAt,
            joinedAt: member.joinedAt
        })),
        lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
        unreadCount,
        createdAt: chat.createdAt,
        updatedAt: lastMessage?.createdAt || chat.updatedAt
    };
};

const list = async(actor) => {
    const settings = await assertChatsEnabled();
    if (settings.departmentChatsEnabled) {
        await ensureActorDepartmentThreads(actor.id);
    }

    const enabledKinds = [
        ...(settings.directChatsEnabled ? ['DIRECT', 'GROUP'] : []),
        ...(settings.departmentChatsEnabled ? ['DEPARTMENT'] : [])
    ];

    const chats = await prisma.chatThread.findMany({
        where: {
            kind: { in: enabledKinds },
            members: { some: { userId: actor.id } }
        },
        include: {
            department: { select: { id: true, name: true, isActive: true } },
            members: {
                include: { user: { select: CHAT_USER_SELECT } },
                orderBy: { joinedAt: 'asc' }
            },
            messages: {
                include: CHAT_MESSAGE_INCLUDE,
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        },
        orderBy: { updatedAt: 'desc' }
    });

    return Promise.all(chats.map((chat) => serializeThread(chat, actor.id)));
};

const listUsers = async(actorId) => prisma.user.findMany({
    where: {
        id: { not: actorId },
        isActive: true
    },
    select: CHAT_USER_SELECT,
    orderBy: [{ name: 'asc' }, { email: 'asc' }]
});

const createDirect = async(actor, targetUserId) => {
    await assertChatsEnabled('DIRECT');
    if (!targetUserId || targetUserId === actor.id) {
        throw new Error('Выберите другого пользователя.');
    }

    const target = await prisma.user.findFirst({
        where: { id: targetUserId, isActive: true },
        select: { id: true }
    });
    if (!target) {
        throw new Error('Пользователь не найден.');
    }

    const directKey = getDirectKey(actor.id, targetUserId);
    const chat = await prisma.$transaction(async(tx) => {
        const thread = await tx.chatThread.upsert({
            where: { directKey },
            update: {},
            create: {
                kind: 'DIRECT',
                directKey,
                createdById: actor.id
            }
        });
        await tx.chatMember.createMany({
            data: [
                { chatId: thread.id, userId: actor.id },
                { chatId: thread.id, userId: targetUserId }
            ],
            skipDuplicates: true
        });
        return thread;
    });

    const fullChat = await prisma.chatThread.findUnique({
        where: { id: chat.id },
        include: {
            department: { select: { id: true, name: true, isActive: true } },
            members: {
                include: { user: { select: CHAT_USER_SELECT } },
                orderBy: { joinedAt: 'asc' }
            },
            messages: {
                include: CHAT_MESSAGE_INCLUDE,
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        }
    });

    return serializeThread(fullChat, actor.id);
};

const loadThread = async(chatId, actorId) => {
    const chat = await prisma.chatThread.findUnique({
        where: { id: chatId },
        include: {
            department: { select: { id: true, name: true, isActive: true } },
            members: {
                include: { user: { select: CHAT_USER_SELECT } },
                orderBy: { joinedAt: 'asc' }
            },
            messages: {
                include: CHAT_MESSAGE_INCLUDE,
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        }
    });
    if (!chat) throw new Error('Chat not found');
    return serializeThread(chat, actorId);
};

const assertThreadManagementAccess = async(chatId, actor) => {
    const membership = await assertMembership(chatId, actor.id);
    if (membership.chat.kind === 'DEPARTMENT') {
        throw new Error('Системный чат отдела нельзя переименовать или удалить.');
    }
    if (actor.role !== 'ADMIN' && membership.chat.createdById !== actor.id) {
        throw new Error('Переименовать или удалить чат может только его создатель или администратор.');
    }
    return membership.chat;
};

const updateThread = async(chatId, actor, payload = {}) => {
    await assertThreadManagementAccess(chatId, actor);
    if (!Object.prototype.hasOwnProperty.call(payload, 'title') || typeof payload.title !== 'string') {
        throw new Error('Укажите название чата.');
    }
    const title = payload.title.trim();
    if (title.length > 80) {
        throw new Error('Название чата не должно превышать 80 символов.');
    }
    await prisma.chatThread.update({
        where: { id: chatId },
        data: { title: title || null, updatedAt: new Date() }
    });
    return loadThread(chatId, actor.id);
};

const deleteThread = async(chatId, actor) => {
    await assertThreadManagementAccess(chatId, actor);
    return deleteAdmin(chatId);
};

const addMember = async(chatId, actor, targetUserId) => {
    const membership = await assertMembership(chatId, actor.id);
    if (membership.chat.kind === 'DEPARTMENT') {
        throw new Error('Состав чата отдела меняется в настройках отдела.');
    }
    if (!targetUserId || targetUserId === actor.id) {
        throw new Error('Выберите другого пользователя.');
    }
    const target = await prisma.user.findFirst({
        where: { id: targetUserId, isActive: true },
        select: { id: true }
    });
    if (!target) throw new Error('Пользователь не найден.');

    await prisma.$transaction(async(tx) => {
        if (membership.chat.kind === 'DIRECT') {
            await tx.chatThread.update({
                where: { id: chatId },
                data: {
                    kind: 'GROUP',
                    directKey: null,
                    updatedAt: new Date()
                }
            });
        }
        await tx.chatMember.upsert({
            where: { chatId_userId: { chatId, userId: targetUserId } },
            update: {},
            create: { chatId, userId: targetUserId }
        });
    });

    return loadThread(chatId, actor.id);
};

const removeMember = async(chatId, actor, targetUserId) => {
    const membership = await assertMembership(chatId, actor.id);
    if (membership.chat.kind === 'DEPARTMENT') {
        throw new Error('Состав чата отдела меняется в настройках отдела.');
    }
    if (targetUserId !== actor.id && actor.role !== 'ADMIN') {
        throw new Error('Удалить другого участника может только администратор.');
    }
    const memberCount = await prisma.chatMember.count({ where: { chatId } });
    if (memberCount <= 2) {
        throw new Error('В чате должно остаться не менее двух участников.');
    }
    await prisma.chatMember.delete({
        where: { chatId_userId: { chatId, userId: targetUserId } }
    });
    return { message: targetUserId === actor.id ? 'Вы покинули чат.' : 'Участник удалён.' };
};

const assertTicketChatsEnabled = async() => {
    const settings = await assertChatsEnabled();
    if (!settings.ticketChatsEnabled || !(await productSettingsService.isFeatureEnabled('tickets'))) {
        throw new Error('Чаты заявок отключены администратором.');
    }
    return settings;
};

const listTicketMembers = async(taskId, actor) => {
    await assertTicketChatsEnabled();
    await taskService.getById(taskId, actor);
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
            authorId: true,
            author: { select: CHAT_USER_SELECT },
            assignees: {
                select: {
                    userId: true,
                    user: { select: CHAT_USER_SELECT }
                }
            },
            chatParticipants: {
                select: {
                    userId: true,
                    createdAt: true,
                    user: { select: CHAT_USER_SELECT }
                },
                orderBy: { createdAt: 'asc' }
            }
        }
    });
    if (!task) throw new Error('Task not found');

    const rows = [{ userId: task.authorId, user: task.author, role: 'AUTHOR' }];
    task.assignees.forEach((assignee) => {
        if (!rows.some((row) => row.userId === assignee.userId)) {
            rows.push({ userId: assignee.userId, user: assignee.user, role: 'ASSIGNEE' });
        }
    });
    task.chatParticipants.forEach((participant) => {
        if (!rows.some((row) => row.userId === participant.userId)) {
            rows.push({
                userId: participant.userId,
                user: participant.user,
                role: 'PARTICIPANT',
                createdAt: participant.createdAt
            });
        }
    });
    return rows;
};

const addTicketMember = async(taskId, actor, targetUserId) => {
    await assertTicketChatsEnabled();
    await taskService.getById(taskId, actor);
    const target = await prisma.user.findFirst({
        where: { id: targetUserId, isActive: true },
        select: { id: true }
    });
    if (!target) throw new Error('Пользователь не найден.');
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
            authorId: true,
            assignees: { select: { userId: true } }
        }
    });
    if (!task) throw new Error('Task not found');
    if (task.authorId !== targetUserId && !task.assignees.some((assignee) => assignee.userId === targetUserId)) {
        await prisma.taskChatParticipant.upsert({
            where: { taskId_userId: { taskId, userId: targetUserId } },
            update: {},
            create: {
                taskId,
                userId: targetUserId,
                addedById: actor.id
            }
        });
    }
    return listTicketMembers(taskId, actor);
};

const removeTicketMember = async(taskId, actor, targetUserId) => {
    await assertTicketChatsEnabled();
    const task = await taskService.getById(taskId, actor);
    if (targetUserId !== actor.id && actor.role !== 'ADMIN' && task.authorId !== actor.id) {
        throw new Error('Удалить участника может автор заявки или администратор.');
    }
    await prisma.taskChatParticipant.deleteMany({
        where: { taskId, userId: targetUserId }
    });
    return listTicketMembers(taskId, actor);
};

const listMessages = async(chatId, actor, limit = 100) => {
    await assertMembership(chatId, actor.id);
    const normalizedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 200);
    const messages = await prisma.chatMessage.findMany({
        where: { chatId },
        include: CHAT_MESSAGE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: normalizedLimit
    });

    await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: actor.id } },
        data: { lastReadAt: new Date() }
    });

    return messages.reverse().map(serializeMessage);
};

const createMessage = async(chatId, actor, content) => {
    await assertMembership(chatId, actor.id);
    const normalizedContent = normalizeContent(content);

    return prisma.$transaction(async(tx) => {
        const message = await tx.chatMessage.create({
            data: {
                chatId,
                authorId: actor.id,
                content: normalizedContent
            },
            include: CHAT_MESSAGE_INCLUDE
        });
        await tx.chatThread.update({
            where: { id: chatId },
            data: { updatedAt: new Date() }
        });
        await tx.chatMember.update({
            where: { chatId_userId: { chatId, userId: actor.id } },
            data: { lastReadAt: new Date() }
        });
        return serializeMessage(message);
    });
};

const updateMessage = async(chatId, messageId, actor, content) => {
    await assertMembership(chatId, actor.id);
    const existing = await prisma.chatMessage.findFirst({
        where: { id: messageId, chatId }
    });
    if (!existing) {
        throw new Error('Сообщение не найдено.');
    }
    if (existing.authorId !== actor.id) {
        throw new Error('Можно редактировать только свои сообщения.');
    }

    return prisma.chatMessage.update({
        where: { id: messageId },
        data: {
            content: normalizeContent(content),
            editedAt: new Date()
        },
        include: CHAT_MESSAGE_INCLUDE
    }).then(serializeMessage);
};

const deleteMessage = async(chatId, messageId, actor) => {
    await assertMembership(chatId, actor.id);
    const existing = await prisma.chatMessage.findFirst({
        where: { id: messageId, chatId },
        include: { attachments: { select: { path: true } } }
    });
    if (!existing) {
        throw new Error('Сообщение не найдено.');
    }
    if (existing.authorId !== actor.id) {
        throw new Error('Можно удалять только свои сообщения.');
    }

    await prisma.chatMessage.delete({ where: { id: messageId } });
    deleteStoredFiles(existing.attachments.map((attachment) => attachment.path));
    return { message: 'Сообщение удалено.' };
};

const createAttachmentMessage = async(chatId, actor, file, content = '') => {
    const membership = await assertMembership(chatId, actor.id);
    const settings = await getSettings();
    if (!settings.attachmentsEnabled) {
        throw new Error('Вложения в чатах отключены администратором.');
    }
    if (!file) {
        throw new Error('Выберите файл.');
    }
    if (file.size > settings.maxAttachmentSizeMb * 1024 * 1024) {
        throw new Error(`Файл превышает лимит ${settings.maxAttachmentSizeMb} МБ.`);
    }

    const normalizedContent = normalizeContent(content, { allowEmpty: true });
    const storedPath = buildStoredAttachmentPath(file.filename);
    try {
        const message = await prisma.$transaction(async(tx) => {
            const created = await tx.chatMessage.create({
                data: {
                    chatId,
                    authorId: actor.id,
                    content: normalizedContent,
                    attachments: {
                        create: {
                            filename: file.originalname,
                            path: storedPath,
                            mimeType: file.mimetype || null,
                            sizeBytes: file.size || null
                        }
                    }
                },
                include: CHAT_MESSAGE_INCLUDE
            });
            await tx.chatThread.update({
                where: { id: chatId },
                data: { updatedAt: new Date() }
            });
            await tx.chatMember.update({
                where: { chatId_userId: { chatId, userId: actor.id } },
                data: { lastReadAt: new Date() }
            });
            return created;
        });
        return serializeMessage(message);
    } catch (error) {
        deleteStoredFiles([storedPath]);
        throw error;
    }
};

const getAttachmentForDownload = async(attachmentId, actor) => {
    const attachment = await prisma.chatAttachment.findUnique({
        where: { id: attachmentId },
        include: {
            message: {
                select: {
                    chatId: true,
                    chat: { select: { kind: true } }
                }
            }
        }
    });
    if (!attachment) {
        throw new Error('Attachment not found');
    }
    await assertMembership(attachment.message.chatId, actor.id);
    return {
        ...attachment,
        absolutePath: resolveUploadPath(attachment.path)
    };
};

const markRead = async(chatId, actor) => {
    await assertMembership(chatId, actor.id);
    await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: actor.id } },
        data: { lastReadAt: new Date() }
    });
    return { success: true };
};

const getUnreadCount = async(actor) => {
    const settings = await assertChatsEnabled();
    if (settings.departmentChatsEnabled) {
        await ensureActorDepartmentThreads(actor.id);
    }
    const enabledKinds = [
        ...(settings.directChatsEnabled ? ['DIRECT', 'GROUP'] : []),
        ...(settings.departmentChatsEnabled ? ['DEPARTMENT'] : [])
    ];
    const memberships = await prisma.chatMember.findMany({
        where: {
            userId: actor.id,
            chat: { kind: { in: enabledKinds } }
        },
        select: { chatId: true, lastReadAt: true }
    });
    const counts = await Promise.all(memberships.map((membership) => prisma.chatMessage.count({
        where: {
            chatId: membership.chatId,
            authorId: { not: actor.id },
            ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {})
        }
    })));
    return counts.reduce((sum, count) => sum + count, 0);
};

const listAdmin = async({ search = '', kind = '' } = {}) => {
    const normalizedSearch = String(search || '').trim();
    const normalizedKind = ['DIRECT', 'GROUP', 'DEPARTMENT'].includes(kind) ? kind : undefined;
    const chats = await prisma.chatThread.findMany({
        where: {
            ...(normalizedKind ? { kind: normalizedKind } : {}),
            ...(normalizedSearch ? {
                OR: [
                    { title: { contains: normalizedSearch, mode: 'insensitive' } },
                    { department: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
                    { members: { some: { user: { name: { contains: normalizedSearch, mode: 'insensitive' } } } } },
                    { members: { some: { user: { email: { contains: normalizedSearch, mode: 'insensitive' } } } } }
                ]
            } : {})
        },
        include: {
            department: { select: { id: true, name: true, isActive: true } },
            members: {
                include: { user: { select: CHAT_USER_SELECT } },
                orderBy: { joinedAt: 'asc' }
            },
            _count: { select: { messages: true, members: true } }
        },
        orderBy: { updatedAt: 'desc' }
    });

    return chats.map((chat) => ({
        id: chat.id,
        kind: chat.kind,
        title: chat.kind === 'DEPARTMENT'
            ? (chat.department?.name || chat.title || 'Отдел')
            : (chat.title || chat.members.map((member) => member.user.name).join(' ↔ ')),
        department: chat.department,
        members: chat.members.map((member) => ({ userId: member.userId, user: member.user })),
        memberCount: chat._count.members,
        messageCount: chat._count.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
    }));
};

const clearAdmin = async(chatId) => {
    const chat = await prisma.chatThread.findUnique({
        where: { id: chatId },
        select: {
            id: true,
            messages: {
                select: {
                    attachments: { select: { path: true } }
                }
            }
        }
    });
    if (!chat) {
        throw new Error('Chat not found');
    }
    const storedPaths = chat.messages.flatMap((message) => message.attachments.map((attachment) => attachment.path));
    await prisma.$transaction([
        prisma.chatMessage.deleteMany({ where: { chatId } }),
        prisma.chatMember.updateMany({ where: { chatId }, data: { lastReadAt: new Date() } }),
        prisma.chatThread.update({ where: { id: chatId }, data: { updatedAt: new Date() } })
    ]);
    deleteStoredFiles(storedPaths);
    return { message: 'История чата очищена.' };
};

const deleteAdmin = async(chatId) => {
    const chat = await prisma.chatThread.findUnique({
        where: { id: chatId },
        select: {
            id: true,
            messages: {
                select: {
                    attachments: { select: { path: true } }
                }
            }
        }
    });
    if (!chat) {
        throw new Error('Chat not found');
    }
    const storedPaths = chat.messages.flatMap((message) => message.attachments.map((attachment) => attachment.path));
    await prisma.chatThread.delete({ where: { id: chatId } });
    deleteStoredFiles(storedPaths);
    return { message: 'Чат удалён.' };
};

module.exports = {
    getSettings,
    updateSettings,
    list,
    listUsers,
    createDirect,
    updateThread,
    deleteThread,
    addMember,
    removeMember,
    listTicketMembers,
    addTicketMember,
    removeTicketMember,
    listMessages,
    createMessage,
    createAttachmentMessage,
    getAttachmentForDownload,
    updateMessage,
    deleteMessage,
    markRead,
    getUnreadCount,
    listAdmin,
    clearAdmin,
    deleteAdmin
};
