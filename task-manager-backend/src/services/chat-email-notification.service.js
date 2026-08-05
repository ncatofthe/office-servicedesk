const prisma = require('../prisma/prisma.js');
const emailSettingsService = require('./email-settings.service.js');
const productSettingsService = require('./product-settings.service.js');
const { queueOutboundEmail } = require('./email-outbound.service.js');

const renderTemplate = (template, variables) => String(template || '').replace(
    /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
    (_, key) => String(variables[key] ?? '')
);

const buildChatsLink = (portalBaseUrl) => {
    const baseUrl = String(portalBaseUrl || '').trim().replace(/\/+$/, '');
    return baseUrl ? `${baseUrl}/chats` : null;
};

const queueChatMemberAddedEmail = async({
    membershipId,
    taskId = null,
    chatId = null,
    chatTitle,
    member,
    addedBy
}, db = prisma) => {
    const settings = emailSettingsService.getRuntimeEmailSettings();
    if (
        !membershipId
        || !settings.notificationsEnabled
        || !settings.notifyChatMemberAdded
        || !member?.email
        || !(await productSettingsService.isFeatureEnabled('email', db))
    ) {
        return null;
    }

    const chatsUrl = buildChatsLink(settings.portalBaseUrl);
    const variables = {
        chatTitle: chatTitle || 'Чат ServiceDesk',
        memberName: member.name || member.email,
        addedByName: addedBy?.name || addedBy?.email || 'администр',
        portalUrl: chatsUrl || '',
        portalLink: chatsUrl ? `Открыть чаты: ${chatsUrl}` : ''
    };

    return queueOutboundEmail({
        taskId,
        chatId,
        actorId: addedBy?.id || null,
        dedupeKey: `${taskId ? 'task-chat' : 'chat'}-member-added:${membershipId}`,
        to: member.email,
        recipientName: member.name || null,
        subject: renderTemplate(settings.chatMemberSubjectTemplate, variables),
        text: renderTemplate(settings.chatMemberBodyTemplate, variables)
    }, { db });
};

module.exports = {
    queueChatMemberAddedEmail
};
