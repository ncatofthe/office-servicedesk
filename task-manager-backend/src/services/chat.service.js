const prisma = require('../prisma/prisma.js');

const CHAT_USER_SELECT = {
    id: true,
    name: true,
    email: true,
    role: true,
    position: true,
    isActive: true
};

const normalizeContent = (content) => {
    if (typeof content !== 'string') {
        throw new Error('Введите текст сообщения.');
    }

    const normalized = content.trim();
    if (!normalized) {
        throw new Error('Сообщение не может быть пустым.');
    }
    if (normalized.length > 5000) {
        throw new Error('Сообщение не должно превышать 5000 символов.');
    }

    return normalized;
};

const getDirectKey = (firstUserId, secondUserId) => [firstUserId, secondUserId].sort().join(':');

const assertMembership = async(chatId, userId) => {
    const membership = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } }
    });

    if (!membership) {
        throw new Error('Chat not found');
    }

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
        title: chat.kind === 'DEPARTMENT'
            ? (chat.department?.name || chat.title || 'Отдел')
            : null,
        department: chat.department,
        members: chat.members.map((member) => ({
            userId: member.userId,
            user: member.user,
            lastReadAt: member.lastReadAt,
            joinedAt: member.joinedAt
        })),
        lastMessage,
        unreadCount,
        createdAt: chat.createdAt,
        updatedAt: lastMessage?.createdAt || chat.updatedAt
    };
};

const list = async(actor) => {
    await ensureActorDepartmentThreads(actor.id);

    const chats = await prisma.chatThread.findMany({
        where: { members: { some: { userId: actor.id } } },
        include: {
            department: { select: { id: true, name: true, isActive: true } },
            members: {
                include: { user: { select: CHAT_USER_SELECT } },
                orderBy: { joinedAt: 'asc' }
            },
            messages: {
                include: { author: { select: CHAT_USER_SELECT } },
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
                include: { author: { select: CHAT_USER_SELECT } },
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        }
    });

    return serializeThread(fullChat, actor.id);
};

const listMessages = async(chatId, actor, limit = 100) => {
    await assertMembership(chatId, actor.id);
    const normalizedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 200);
    const messages = await prisma.chatMessage.findMany({
        where: { chatId },
        include: { author: { select: CHAT_USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        take: normalizedLimit
    });

    await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: actor.id } },
        data: { lastReadAt: new Date() }
    });

    return messages.reverse();
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
            include: { author: { select: CHAT_USER_SELECT } }
        });
        await tx.chatThread.update({
            where: { id: chatId },
            data: { updatedAt: new Date() }
        });
        await tx.chatMember.update({
            where: { chatId_userId: { chatId, userId: actor.id } },
            data: { lastReadAt: new Date() }
        });
        return message;
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
        include: { author: { select: CHAT_USER_SELECT } }
    });
};

const deleteMessage = async(chatId, messageId, actor) => {
    await assertMembership(chatId, actor.id);
    const existing = await prisma.chatMessage.findFirst({
        where: { id: messageId, chatId }
    });
    if (!existing) {
        throw new Error('Сообщение не найдено.');
    }
    if (existing.authorId !== actor.id) {
        throw new Error('Можно удалять только свои сообщения.');
    }

    await prisma.chatMessage.delete({ where: { id: messageId } });
    return { message: 'Сообщение удалено.' };
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
    await ensureActorDepartmentThreads(actor.id);
    const memberships = await prisma.chatMember.findMany({
        where: { userId: actor.id },
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
    const normalizedKind = ['DIRECT', 'DEPARTMENT'].includes(kind) ? kind : undefined;
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
            : chat.members.map((member) => member.user.name).join(' ↔ '),
        department: chat.department,
        members: chat.members.map((member) => ({ userId: member.userId, user: member.user })),
        memberCount: chat._count.members,
        messageCount: chat._count.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
    }));
};

const clearAdmin = async(chatId) => {
    const chat = await prisma.chatThread.findUnique({ where: { id: chatId }, select: { id: true } });
    if (!chat) {
        throw new Error('Chat not found');
    }
    await prisma.$transaction([
        prisma.chatMessage.deleteMany({ where: { chatId } }),
        prisma.chatMember.updateMany({ where: { chatId }, data: { lastReadAt: new Date() } }),
        prisma.chatThread.update({ where: { id: chatId }, data: { updatedAt: new Date() } })
    ]);
    return { message: 'История чата очищена.' };
};

const deleteAdmin = async(chatId) => {
    const chat = await prisma.chatThread.findUnique({ where: { id: chatId }, select: { id: true } });
    if (!chat) {
        throw new Error('Chat not found');
    }
    await prisma.chatThread.delete({ where: { id: chatId } });
    return { message: 'Чат удалён.' };
};

module.exports = {
    list,
    listUsers,
    createDirect,
    listMessages,
    createMessage,
    updateMessage,
    deleteMessage,
    markRead,
    getUnreadCount,
    listAdmin,
    clearAdmin,
    deleteAdmin
};
