const express = require('express');
const { body } = require('express-validator');
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const chatController = require('../controllers/chat.controller.js');

const router = express.Router();

router.use(authMiddleware);

router.get('/users', chatController.listUsers);
router.get('/unread-count', chatController.getUnreadCount);
router.get('/admin', roleMiddleware(['ADMIN']), chatController.listAdmin);
router.delete('/admin/:chatId/messages', roleMiddleware(['ADMIN']), chatController.clearAdmin);
router.delete('/admin/:chatId', roleMiddleware(['ADMIN']), chatController.deleteAdmin);
router.get('/', chatController.list);
router.post(
    '/direct',
    body('userId').isString().notEmpty().withMessage('Выберите пользователя.'),
    validate,
    chatController.createDirect
);
router.get('/:chatId/messages', chatController.listMessages);
router.post(
    '/:chatId/messages',
    body('content').isString().isLength({ min: 1, max: 5000 }).withMessage('Введите сообщение до 5000 символов.'),
    validate,
    chatController.createMessage
);
router.patch(
    '/:chatId/messages/:messageId',
    body('content').isString().isLength({ min: 1, max: 5000 }).withMessage('Введите сообщение до 5000 символов.'),
    validate,
    chatController.updateMessage
);
router.delete('/:chatId/messages/:messageId', chatController.deleteMessage);
router.post('/:chatId/read', chatController.markRead);

module.exports = router;
