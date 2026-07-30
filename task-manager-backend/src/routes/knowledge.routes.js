const express = require('express');
const { body, param, query } = require('express-validator');
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const controller = require('../controllers/knowledge.controller.js');
const { requireFeature } = require('../middlewares/feature.middleware.js');

const router = express.Router();
router.use(requireFeature('knowledge'));
const manageRoles = ['ADMIN', 'AGENT'];
const idParam = param('id').isString().withMessage('Некорректный идентификатор статьи.');

const listValidation = [
    query('search').optional({ nullable: true }).isString().withMessage('Поиск должен быть строкой.'),
    query('category').optional({ nullable: true }).isString().withMessage('Категория должна быть строкой.'),
    query('isPublished').optional({ nullable: true }).isBoolean().withMessage('isPublished должен быть true или false.')
];

const articleValidation = [
    body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Название статьи обязательно.'),
    body('body').trim().isLength({ min: 1 }).withMessage('Текст статьи обязателен.'),
    body('category').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('Категория должна быть строкой до 255 символов.'),
    body('isPublished').optional().isBoolean().withMessage('isPublished должен быть boolean.')
];

const articleUpdateValidation = [
    body('title').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Название статьи обязательно.'),
    body('body').optional().trim().isLength({ min: 1 }).withMessage('Текст статьи обязателен.'),
    body('category').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('Категория должна быть строкой до 255 символов.'),
    body('isPublished').optional().isBoolean().withMessage('isPublished должен быть boolean.')
];

router.get('/articles', authMiddleware, listValidation, validate, controller.listArticles);
router.get('/articles/:id', authMiddleware, idParam, validate, controller.getArticle);
router.post('/articles', authMiddleware, roleMiddleware(manageRoles), articleValidation, validate, controller.createArticle);
router.put('/articles/:id', authMiddleware, roleMiddleware(manageRoles), idParam, articleUpdateValidation, validate, controller.updateArticle);
router.delete('/articles/:id', authMiddleware, roleMiddleware(manageRoles), idParam, validate, controller.deleteArticle);

module.exports = router;
