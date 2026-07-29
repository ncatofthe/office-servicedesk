const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const { getReviews, updateReview } = require('../controllers/review.controller.js');

router.get('/reviews', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), getReviews);
router.patch(
    '/reviews/:id',
    authMiddleware,
    roleMiddleware(['ADMIN', 'AGENT']),
    param('id').isString().withMessage('Invalid review ID'),
    body('status').isIn(['APPROVED', 'REJECTED', 'PENDING']).withMessage('Invalid review status'),
    body('amount').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Amount must be a non-negative number'),
    body('comment').optional({ nullable: true }).isString().withMessage('Comment must be a string'),
    body().custom((value) => {
        const payload = value || {};
        if (payload.status === 'REJECTED' && (!payload.comment || String(payload.comment).trim().length === 0)) {
            throw new Error('Reject comment is required');
        }

        return true;
    }),
    validate,
    updateReview
);

module.exports = router;
