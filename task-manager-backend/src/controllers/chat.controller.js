const chatService = require('../services/chat.service.js');

const sendError = (res, error) => {
    if (error.message === 'Chat not found') {
        return res.status(404).json({ error: 'Чат не найден.' });
    }
    if (
        error.message === 'Можно редактировать только свои сообщения.'
        || error.message === 'Можно удалять только свои сообщения.'
    ) {
        return res.status(403).json({ error: error.message });
    }
    return res.status(400).json({ error: error.message });
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
