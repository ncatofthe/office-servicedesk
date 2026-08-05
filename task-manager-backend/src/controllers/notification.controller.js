const notificationService = require('../services/notification.service.js');

const getNotifications = async(req, res) => {
    try {
        const notifications = await notificationService.getNotifications(req.user.id, req.query || {});
        res.json(notifications);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const getUnreadCount = async(req, res) => {
    try {
        const result = await notificationService.getUnreadCount(req.user.id, req.query || {});
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const markRead = async(req, res) => {
    try {
        const notification = await notificationService.markRead(req.params.id, req.user.id);
        res.json(notification);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const markAllRead = async(req, res) => {
    try {
        const result = await notificationService.markAllRead(req.user.id, req.body || {});
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    getNotifications,
    getUnreadCount,
    markRead,
    markAllRead
};
