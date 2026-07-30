const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.js');
const { requireFeature } = require('../middlewares/feature.middleware.js');
const {
    getNotifications,
    getUnreadCount,
    markRead,
    markAllRead
} = require('../controllers/notification.controller.js');

router.get('/notifications', authMiddleware, requireFeature('notifications'), getNotifications);
router.get('/notifications/unread-count', authMiddleware, requireFeature('notifications'), getUnreadCount);
router.patch('/notifications/:id/read', authMiddleware, requireFeature('notifications'), markRead);
router.patch('/notifications/read-all', authMiddleware, requireFeature('notifications'), markAllRead);

module.exports = router;
