const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.js');
const { getTaskComments, createComment, updateComment, deleteComment } = require('../controllers/comment.controller.js');
const validate = require('../middlewares/validate.middleware.js');
const { requireFeature } = require('../middlewares/feature.middleware.js');

router.use(requireFeature('tickets'));

// Validation rules
const commentValidation = [
    body('content').trim().isLength({ min: 1 }).withMessage('Comment content is required'),
    body('visibility').optional().isIn(['PUBLIC', 'INTERNAL']).withMessage('visibility must be PUBLIC or INTERNAL'),
    body('type').optional().isIn(['PUBLIC', 'INTERNAL']).withMessage('type must be PUBLIC or INTERNAL'),
];

// Comments - GET /api/comments/:taskId, POST /api/comments/:taskId
router.get('/comments/:taskId', param('taskId').isString().withMessage('Invalid taskId'), validate, authMiddleware, getTaskComments);
router.post('/comments/:taskId', param('taskId').isString().withMessage('Invalid taskId'), commentValidation, validate, authMiddleware, createComment);
router.put('/comments/:id', param('id').isString().withMessage('Invalid comment ID'), commentValidation, validate, authMiddleware, updateComment);
router.delete('/comments/:id', param('id').isString().withMessage('Invalid comment ID'), validate, authMiddleware, deleteComment);

module.exports = router;
