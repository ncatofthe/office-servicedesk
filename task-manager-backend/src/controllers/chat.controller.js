const fs = require('fs');
const chatService = require('../services/chat.service.js');

const sendError = (res, error) => {
    if (error.message === 'Chat not found' || error.message === 'Attachment not found') {
        return res.status(404).json({ error: 'Чат или файл не найден.' });
    }
    if (
        error.message === 'Можно редактировать только свои сообщения.'
        || error.message === 'Можно удалять только свои сообщения.'
    ) {
        return res.status(403).json({ error: error.message });
    }
    return res.status(400).json({ error: error.message });
};

const removeUploadedFile = (file) => {
    if (!file?.path) return;
    try {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[chat-attachments] Failed to clean rejected upload', { error: error.message });
        }
    }
};

const getSettings = async(req, res) => {
    try {
        res.json(await chatService.getSettings());
    } catch (error) {
        sendError(res, error);
    }
};

const updateSettings = async(req, res) => {
    try {
        res.json(await chatService.updateSettings(req.body));
    } catch (error) {
        sendError(res, error);
    }
};

const list = async(req, res) => {
    try {
        res.json(await chatService.list(req.user));
    } catch (error) {
        sendError(res, error);
    }
};

const listUsers = async(req, res) => {
    try {
        res.json(await chatService.listUsers(req.user.id));
    } catch (error) {
        sendError(res, error);
    }
};

const createDirect = async(req, res) => {
    try {
        res.status(201).json(await chatService.createDirect(req.user, req.body.userId));
    } catch (error) {
        sendError(res, error);
    }
};

const addMember = async(req, res) => {
    try {
        res.json(await chatService.addMember(req.params.chatId, req.user, req.body.userId));
    } catch (error) {
        sendError(res, error);
    }
};

const removeMember = async(req, res) => {
    try {
        res.json(await chatService.removeMember(req.params.chatId, req.user, req.params.userId));
    } catch (error) {
        sendError(res, error);
    }
};

const listTicketMembers = async(req, res) => {
    try {
        res.json(await chatService.listTicketMembers(req.params.taskId, req.user));
    } catch (error) {
        sendError(res, error);
    }
};

const addTicketMember = async(req, res) => {
    try {
        res.json(await chatService.addTicketMember(req.params.taskId, req.user, req.body.userId));
    } catch (error) {
        sendError(res, error);
    }
};

const removeTicketMember = async(req, res) => {
    try {
        res.json(await chatService.removeTicketMember(req.params.taskId, req.user, req.params.userId));
    } catch (error) {
        sendError(res, error);
    }
};

const listMessages = async(req, res) => {
    try {
        res.json(await chatService.listMessages(req.params.chatId, req.user, req.query.limit));
    } catch (error) {
        sendError(res, error);
    }
};

const createMessage = async(req, res) => {
    try {
        res.status(201).json(await chatService.createMessage(req.params.chatId, req.user, req.body.content));
    } catch (error) {
        sendError(res, error);
    }
};

const createAttachment = async(req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Выберите файл.' });
        }
        res.status(201).json(await chatService.createAttachmentMessage(
            req.params.chatId,
            req.user,
            req.file,
            req.body.content
        ));
    } catch (error) {
        removeUploadedFile(req.file);
        sendError(res, error);
    }
};

const downloadAttachment = async(req, res) => {
    try {
        const attachment = await chatService.getAttachmentForDownload(req.params.attachmentId, req.user);
        if (!attachment.absolutePath || !fs.existsSync(attachment.absolutePath)) {
            return res.status(404).json({ error: 'Файл не найден на диске.' });
        }
        return res.download(attachment.absolutePath, attachment.filename);
    } catch (error) {
        sendError(res, error);
    }
};

const updateMessage = async(req, res) => {
    try {
        res.json(await chatService.updateMessage(req.params.chatId, req.params.messageId, req.user, req.body.content));
    } catch (error) {
        sendError(res, error);
    }
};

const deleteMessage = async(req, res) => {
    try {
        res.json(await chatService.deleteMessage(req.params.chatId, req.params.messageId, req.user));
    } catch (error) {
        sendError(res, error);
    }
};

const markRead = async(req, res) => {
    try {
        res.json(await chatService.markRead(req.params.chatId, req.user));
    } catch (error) {
        sendError(res, error);
    }
};

const getUnreadCount = async(req, res) => {
    try {
        res.json({ count: await chatService.getUnreadCount(req.user) });
    } catch (error) {
        sendError(res, error);
    }
};

const listAdmin = async(req, res) => {
    try {
        res.json(await chatService.listAdmin(req.query));
    } catch (error) {
        sendError(res, error);
    }
};

const clearAdmin = async(req, res) => {
    try {
        res.json(await chatService.clearAdmin(req.params.chatId));
    } catch (error) {
        sendError(res, error);
    }
};

const deleteAdmin = async(req, res) => {
    try {
        res.json(await chatService.deleteAdmin(req.params.chatId));
    } catch (error) {
        sendError(res, error);
    }
};

module.exports = {
    getSettings,
    updateSettings,
    list,
    listUsers,
    createDirect,
    addMember,
    removeMember,
    listTicketMembers,
    addTicketMember,
    removeTicketMember,
    listMessages,
    createMessage,
    createAttachment,
    downloadAttachment,
    updateMessage,
    deleteMessage,
    markRead,
    getUnreadCount,
    listAdmin,
    clearAdmin,
    deleteAdmin
};
