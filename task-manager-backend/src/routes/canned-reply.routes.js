const express = require('express');
const { body, param, query } = require('express-validator');
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const controller = require('../controllers/canned-reply.controller.js');
const { requireFeature } = require('../middlewares/feature.middleware.js');

const router = express.Router();
router.use(requireFeature('tickets'), requireFeature('cannedReplies'));

const managerOnly = [authMiddleware, roleMiddleware(['ADMIN', 'AGENT'])];

const baseValidation = [
    body('title').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Название должно быть от 1 до 255 символов.'),
    body('body').optional().isString().withMessage('body должен быть строкой.'),
    body('category').optional({ nullable: true }).isString().withMessage('category должен быть строкой или null.'),
    body('isActive').optional().isBoolean().withMessage('isActive должен быть boolean.'),
    body('visibility').optional().isIn(['PRIVATE', 'SHARED']).withMessage('visibility должен быть PRIVATE или SHARED.')
];

router.get(
    '/canned-replies',
    ...managerOnly,
    query('search').optional().isString().withMessage('search должен быть строкой.'),
    query('category').optional({ nullable: true }).isString().withMessage('category должен быть строкой или null.'),
    query('visibility').optional().isIn(['PRIVATE', 'SHARED']).withMessage('visibility должен быть PRIVATE или SHARED.'),
    query('authorId').optional().isString().withMessage('authorId должен быть строкой.'),
    query('isActive').optional().isBoolean().withMessage('isActive должен быть boolean.'),
    validate,
    controller.listCannedReplies
);

router.get(
    '/canned-replies/:id',
    ...managerOnly,
    param('id').isString().withMessage('Некорректный идентификатор шаблона.'),
    validate,
    controller.getCannedReply
);

router.post(
    '/canned-replies',
    ...managerOnly,
    body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Название обязательно.'),
    body('body').isString().withMessage('body обязателен и должен быть строкой.'),
    ...baseValidation,
    validate,
    controller.createCannedReply
);

router.put(
    '/canned-replies/:id',
    ...managerOnly,
    param('id').isString().withMessage('Некорректный идентификатор шаблона.'),
    ...baseValidation,
    validate,
    controller.updateCannedReply
);

router.delete(
    '/canned-replies/:id',
    ...managerOnly,
    param('id').isString().withMessage('Некорректный идентификатор шаблона.'),
    validate,
    controller.deleteCannedReply
);

module.exports = router;
