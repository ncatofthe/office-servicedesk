const express = require('express');
const { body } = require('express-validator');
const { MAX_AVATAR_DATA_URL_LENGTH } = require('../utils/avatar.js');
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const { requireFeature } = require('../middlewares/feature.middleware.js');
const { upload } = require('../middlewares/upload.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const chatController = require('../controllers/chat.controller.js');

const router = express.Router();

router.use(authMiddleware, requireFeature('chats'));

router.get('/settings', chatController.getSettings);
router.patch('/admin/settings', roleMiddleware(['ADMIN']), chatController.updateSettings);
router.get('/users', chatController.listUsers);
router.get('/unread-count', chatController.getUnreadCount);
router.get('/admin', roleMiddleware(['ADMIN']), chatController.listAdmin);
router.delete('/admin/:chatId/messages', roleMiddleware(['ADMIN']), chatController.clearAdmin);
router.delete('/admin/:chatId', roleMiddleware(['ADMIN']), chatController.deleteAdmin);

router.get('/tickets/:taskId/members', chatController.listTicketMembers);
router.post(
    '/tickets/:taskId/members',
    body('userId').isString().notEmpty().withMessage('Выберите пользователя.'),
    validate,
    chatController.addTicketMember
);
router.delete('/tickets/:taskId/members/:userId', chatController.removeTicketMember);
router.get('/attachments/:attachmentId/download', chatController.downloadAttachment);

router.get('/', chatController.list);
router.post(
    '/direct',
    body('userId').isString().notEmpty().withMessage('Выберите пользователя.'),
    validate,
    chatController.createDirect
);
router.patch(
    '/:chatId',
    body().custom((value) => {
        if (!Object.prototype.hasOwnProperty.call(value || {}, 'title') && !Object.prototype.hasOwnProperty.call(value || {}, 'avatar')) {
            throw new Error('Укажите название или аватар чата.');
        }
        return true;
    }),
    body('title').optional().isString().isLength({ max: 80 }).withMessage('Название чата не должно превышать 80 символов.'),
    body('avatar').optional({ nullable: true }).isString().isLength({ max: MAX_AVATAR_DATA_URL_LENGTH }).withMessage('Аватар чата слишком большой.'),
    validate,
    chatController.updateThread
);
router.delete('/:chatId', chatController.deleteThread);
router.post(
    '/:chatId/members',
    body('userId').isString().notEmpty().withMessage('Выберите пользователя.'),
    validate,
    chatController.addMember
);
router.delete('/:chatId/members/:userId', chatController.removeMember);
router.get('/:chatId/messages', chatController.listMessages);
router.post(
    '/:chatId/messages',
    body('content').isString().isLength({ min: 1, max: 5000 }).withMessage('Введите сообщение до 5000 символов.'),
    validate,
    chatController.createMessage
);
router.post(
    '/:chatId/attachments',
    upload.single('file'),
    chatController.createAttachment
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
