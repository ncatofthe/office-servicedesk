const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.js');
const {
    getNotifications,
    getUnreadCount,
    markRead,
    markAllRead
} = require('../controllers/notification.controller.js');

router.get('/notifications', authMiddleware, getNotifications);
router.get('/notifications/unread-count', authMiddleware, getUnreadCount);
router.patch('/notifications/:id/read', authMiddleware, markRead);
router.patch('/notifications/read-all', authMiddleware, markAllRead);

module.exports = router;
