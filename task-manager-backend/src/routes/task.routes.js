const express = require('express');
const { body, param } = require('express-validator');
const {
    getAll,
    getById,
    getTimeline,
    getEmailThread,
    create,
    update,
    delete: deleteTask,
    updateStatus,
    merge,
    getMergeInfo,
    approveClose,
    approveRequesterClose,
    emailReply,
    replyFromTemplate,
    addAssignee,
    removeAssignee
} = require('../controllers/task.controller.js');
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const sharedRuntimeValidate = require('../middlewares/shared-runtime-validate.middleware.js');

const router = express.Router();

// Validation rules
const taskValidation = [
    body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Название обязательно, максимум 255 символов.'),
    body('description').optional().trim(),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('Некорректный приоритет.'),
    body('status').optional().isIn(['NEW', 'IN_PROGRESS', 'DONE']).withMessage('Некорректный статус.'),
    body('startDate').optional().isISO8601().withMessage('Некорректный формат startDate.'),
    body('dueDate').optional().isISO8601().withMessage('Некорректный формат dueDate.'),
    body('departmentId').optional({ nullable: true }).isString().withMessage('departmentId должен быть строкой или null.'),
    body('folderId').optional({ nullable: true }).isString().withMessage('folderId должен быть строкой или null.'),
    body('serviceDeskFolderId').optional({ nullable: true }).isString().withMessage('serviceDeskFolderId должен быть строкой или null.'),
    body('entityId').optional({ nullable: true }).isString().withMessage('entityId должен быть строкой или null.'),
    body('typeId').optional({ nullable: true }).isString().withMessage('typeId должен быть строкой или null.'),
    body('ticketTypeId').optional({ nullable: true }).isString().withMessage('ticketTypeId должен быть строкой или null.'),
    body('subtypeId').optional({ nullable: true }).isString().withMessage('subtypeId должен быть строкой или null.'),
    body('ticketSubtypeId').optional({ nullable: true }).isString().withMessage('ticketSubtypeId должен быть строкой или null.'),
    body('assigneeIds').optional().isArray().withMessage('assigneeIds должен быть массивом.'),
    body('assigneeIds.*').optional().isString().withMessage('assigneeIds должен содержать строковые ID пользователей.'),
];

const taskUpdateValidation = [
    body().custom((value) => {
        const allowedFields = [
            'title',
            'description',
            'priority',
            'startDate',
            'dueDate',
            'progress',
            'departmentId',
            'folderId',
            'serviceDeskFolderId',
            'entityId',
            'typeId',
            'ticketTypeId',
            'subtypeId',
            'ticketSubtypeId',
            'requesterCloseRequired',
            'assigneeIds'
        ];
        const payload = value || {};
        const invalidFields = Object.keys(payload).filter((field) => !allowedFields.includes(field));
        if (invalidFields.length > 0) {
            throw new Error(`Неподдерживаемые поля: ${invalidFields.join(', ')}.`);
        }
        return true;
    }),
    body('title').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Название должно быть от 1 до 255 символов.'),
    body('description').optional({ nullable: true }).isString().withMessage('Описание должно быть строкой.'),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('Некорректный приоритет.'),
    body('startDate').optional({ nullable: true }).isISO8601().withMessage('Некорректный формат startDate.'),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('Некорректный формат dueDate.'),
    body('progress').optional().isInt({ min: 0, max: 100 }).withMessage('Прогресс должен быть от 0 до 100.'),
    body('departmentId').optional({ nullable: true }).isString().withMessage('departmentId должен быть строкой или null.'),
    body('folderId').optional({ nullable: true }).isString().withMessage('folderId должен быть строкой или null.'),
    body('serviceDeskFolderId').optional({ nullable: true }).isString().withMessage('serviceDeskFolderId должен быть строкой или null.'),
    body('entityId').optional({ nullable: true }).isString().withMessage('entityId должен быть строкой или null.'),
    body('typeId').optional({ nullable: true }).isString().withMessage('typeId должен быть строкой или null.'),
    body('ticketTypeId').optional({ nullable: true }).isString().withMessage('ticketTypeId должен быть строкой или null.'),
    body('subtypeId').optional({ nullable: true }).isString().withMessage('subtypeId должен быть строкой или null.'),
    body('ticketSubtypeId').optional({ nullable: true }).isString().withMessage('ticketSubtypeId должен быть строкой или null.'),
    body('requesterCloseRequired').optional().isBoolean().withMessage('requesterCloseRequired должен быть boolean.'),
    body('assigneeIds').optional().isArray().withMessage('assigneeIds должен быть массивом.'),
    body('assigneeIds.*').optional().isString().withMessage('assigneeIds должен содержать строковые ID пользователей.'),
];

const statusValidation = [
    body('status').isIn(['NEW', 'IN_PROGRESS', 'DONE']).withMessage('Некорректный статус.'),
];

const mergeValidation = [
    body('mergeMode').isIn(['LINK', 'UNION']).withMessage('mergeMode должен быть LINK или UNION.'),
    body('childTaskIds').isArray({ min: 1 }).withMessage('childTaskIds должен быть непустым массивом.'),
    body('childTaskIds.*').isString().withMessage('childTaskIds должен содержать строковые ID заявок.'),
    body('reason').optional({ nullable: true }).isString().withMessage('reason должен быть строкой.')
];

const emailReplyValidation = [
    body('message').trim().isLength({ min: 1 }).withMessage('Текст ответа обязателен.')
];

const replyFromTemplateValidation = [
    body('templateId').isString().withMessage('templateId обязателен.'),
    body('mode').isIn(['COMMENT', 'EMAIL_REPLY']).withMessage('mode должен быть COMMENT или EMAIL_REPLY.'),
    body('bodyOverride').optional({ nullable: true }).isString().withMessage('bodyOverride должен быть строкой.')
];

// List tasks (all roles see own/filtered)
router.get('/', authMiddleware, getAll);

// Get task details (all roles see own)
router.get('/:id', authMiddleware, param('id').isString().withMessage('Invalid task ID'), validate, getById);
router.get('/:id/timeline', authMiddleware, param('id').isString().withMessage('Invalid task ID'), validate, getTimeline);
router.get('/:id/email-thread', authMiddleware, param('id').isString().withMessage('Invalid task ID'), validate, getEmailThread);

router.post(
    '/:id/merge',
    authMiddleware,
    param('id').isString().withMessage('Некорректный идентификатор заявки.'),
    mergeValidation,
    validate,
    merge
);
router.get(
    '/:id/merge-info',
    authMiddleware,
    param('id').isString().withMessage('Некорректный идентификатор заявки.'),
    validate,
    getMergeInfo
);
router.post(
    '/:id/close-approve',
    authMiddleware,
    param('id').isString().withMessage('Некорректный идентификатор заявки.'),
    validate,
    approveClose
);
router.post(
    '/:id/requester-close-approve',
    authMiddleware,
    param('id').isString().withMessage('Некорректный идентификатор заявки.'),
    validate,
    approveRequesterClose
);
router.post(
    '/:id/email-reply',
    authMiddleware,
    param('id').isString().withMessage('Некорректный идентификатор заявки.'),
    emailReplyValidation,
    validate,
    emailReply
);
router.post(
    '/:id/reply-from-template',
    authMiddleware,
    roleMiddleware(['ADMIN', 'AGENT']),
    param('id').isString().withMessage('Некорректный идентификатор заявки.'),
    replyFromTemplateValidation,
    validate,
    replyFromTemplate
);

// CRUD - ADMIN/AGENT/REQUESTER
router.post(
    '/',
    authMiddleware,
    roleMiddleware(['ADMIN', 'AGENT', 'REQUESTER']),
    taskValidation,
    validate,
    sharedRuntimeValidate('createTaskRequestRuntimeSchema', {
        passthroughFields: [
            'folderId',
            'serviceDeskFolderId',
            'entityId',
            'typeId',
            'ticketTypeId',
            'subtypeId',
            'ticketSubtypeId'
        ]
    }),
    create
);
router.put(
    '/:id',
    authMiddleware,
    roleMiddleware(['ADMIN', 'AGENT']),
    param('id').isString().withMessage('Invalid task ID'),
    taskUpdateValidation,
    validate,
    sharedRuntimeValidate('updateTaskRequestRuntimeSchema', {
        passthroughFields: [
            'folderId',
            'serviceDeskFolderId',
            'entityId',
            'typeId',
            'ticketTypeId',
            'subtypeId',
            'ticketSubtypeId',
            'requesterCloseRequired'
        ]
    }),
    update
);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), param('id').isString().withMessage('Invalid task ID'), validate, deleteTask);

// Status update (ADMIN/AGENT any, final ограничения проверяет service)
router.patch('/:id/status', authMiddleware, statusValidation, validate, sharedRuntimeValidate('updateTaskStatusRequestRuntimeSchema'), updateStatus);

// Assignees (ADMIN/AGENT)
router.post('/:id/assignees', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), body('userId').isString().withMessage('userId is required'), validate, addAssignee);
router.delete('/:id/assignees/:userId', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), removeAssignee);

module.exports = router;
