const express = require('express');
const { body, param, query } = require('express-validator');
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const { requireFeature } = require('../middlewares/feature.middleware.js');
const controller = require('../controllers/servicedesk.controller.js');

const router = express.Router();

const adminOnly = [authMiddleware, roleMiddleware(['ADMIN'])];
const automationAdminOnly = [...adminOnly, requireFeature('automation')];
const emailAdminOnly = [...adminOnly, requireFeature('email')];
const freshdeskAdminOnly = [...adminOnly, requireFeature('freshdeskImport')];
const authenticated = [authMiddleware];
const idParam = param('id').isString().withMessage('Некорректный идентификатор.');
const teamIdParam = param('teamId').isString().withMessage('Некорректный идентификатор команды.');

const textRefValidation = [
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Название обязательно.'),
    body('description').optional({ nullable: true }).isString().withMessage('Описание должно быть строкой.'),
    body('isActive').optional().isBoolean().withMessage('Статус активности должен быть boolean.')
];

const textRefUpdateValidation = [
    body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Название обязательно.'),
    body('description').optional({ nullable: true }).isString().withMessage('Описание должно быть строкой.'),
    body('isActive').optional().isBoolean().withMessage('Статус активности должен быть boolean.')
];

const codedRefValidation = [
    ...textRefValidation,
    body('code').optional({ nullable: true }).isString().isLength({ max: 80 }).withMessage('Код должен быть строкой до 80 символов.')
];

const codedRefUpdateValidation = [
    ...textRefUpdateValidation,
    body('code').optional({ nullable: true }).isString().isLength({ max: 80 }).withMessage('Код должен быть строкой до 80 символов.')
];

const folderBindingValidation = [
    body('folderId').optional({ nullable: true }).isString().withMessage('folderId должен быть строкой или null.'),
    body('folderIds').optional().isArray().withMessage('folderIds должен быть массивом идентификаторов папок.'),
    body('folderIds.*').optional().isString().withMessage('folderIds должен содержать строковые идентификаторы папок.')
];

const entityBindingValidation = [
    body('entityId').optional({ nullable: true }).isString().withMessage('entityId должен быть строкой или null.')
];

const automationRuleBaseValidation = [
    body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Название должно быть от 1 до 255 символов.'),
    body('description').optional({ nullable: true }).isString().withMessage('Описание должно быть строкой или null.'),
    body('isActive').optional().isBoolean().withMessage('isActive должен быть boolean.'),
    body('sortOrder').optional().isInt().withMessage('sortOrder должен быть целым числом.'),
    body('triggerType').optional().isIn(['TASK_CREATED', 'EMAIL_TICKET_CREATED']).withMessage('Некорректный triggerType.'),
    body('conditions').optional().isObject().withMessage('conditions должен быть объектом.'),
    body('conditions.channel').optional({ nullable: true }).isIn(['WEB', 'EMAIL']).withMessage('conditions.channel должен быть WEB или EMAIL.'),
    body('conditions.folderId').optional({ nullable: true }).isString().withMessage('conditions.folderId должен быть строкой или null.'),
    body('conditions.entityId').optional({ nullable: true }).isString().withMessage('conditions.entityId должен быть строкой или null.'),
    body('conditions.typeId').optional({ nullable: true }).isString().withMessage('conditions.typeId должен быть строкой или null.'),
    body('conditions.subtypeId').optional({ nullable: true }).isString().withMessage('conditions.subtypeId должен быть строкой или null.'),
    body('conditions.priority').optional({ nullable: true }).isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('conditions.priority имеет некорректное значение.'),
    body('conditions.requesterEmailContains').optional({ nullable: true }).isString().withMessage('conditions.requesterEmailContains должен быть строкой или null.'),
    body('conditions.titleContains').optional({ nullable: true }).isString().withMessage('conditions.titleContains должен быть строкой или null.'),
    body('actions').optional().isObject().withMessage('actions должен быть объектом.'),
    body('actions.setFolderId').optional({ nullable: true }).isString().withMessage('actions.setFolderId должен быть строкой или null.'),
    body('actions.setEntityId').optional({ nullable: true }).isString().withMessage('actions.setEntityId должен быть строкой или null.'),
    body('actions.setTypeId').optional({ nullable: true }).isString().withMessage('actions.setTypeId должен быть строкой или null.'),
    body('actions.setSubtypeId').optional({ nullable: true }).isString().withMessage('actions.setSubtypeId должен быть строкой или null.'),
    body('actions.setPriority').optional({ nullable: true }).isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('actions.setPriority имеет некорректное значение.'),
    body('actions.setAssigneeIds').optional({ nullable: true }).isArray().withMessage('actions.setAssigneeIds должен быть массивом строк или null.'),
    body('actions.setAssigneeIds.*').optional().isString().withMessage('actions.setAssigneeIds должен содержать строковые ID.')
];

const createAutomationRuleValidation = [
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Название обязательно.'),
    body('triggerType').isIn(['TASK_CREATED', 'EMAIL_TICKET_CREATED']).withMessage('Некорректный triggerType.'),
    body('actions').isObject().withMessage('actions обязателен и должен быть объектом.'),
    ...automationRuleBaseValidation
];

const updateAutomationRuleValidation = [
    ...automationRuleBaseValidation
];

const slaPolicyBaseValidation = [
    body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Название должно быть от 1 до 255 символов.'),
    body('description').optional({ nullable: true }).isString().withMessage('Описание должно быть строкой или null.'),
    body('isActive').optional().isBoolean().withMessage('isActive должен быть boolean.'),
    body('sortOrder').optional().isInt({ min: 0 }).withMessage('sortOrder должен быть целым числом 0 или больше.'),
    body('folderId').optional({ nullable: true }).isString().withMessage('folderId должен быть строкой или null.'),
    body('typeId').optional({ nullable: true }).isString().withMessage('typeId должен быть строкой или null.'),
    body('subtypeId').optional({ nullable: true }).isString().withMessage('subtypeId должен быть строкой или null.'),
    body('priority').optional({ nullable: true }).isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('priority имеет некорректное значение.'),
    body('firstResponseMinutes').optional({ nullable: true }).isInt({ min: 0 }).withMessage('firstResponseMinutes должен быть целым числом 0 или больше.'),
    body('resolutionMinutes').optional({ nullable: true }).isInt({ min: 0 }).withMessage('resolutionMinutes должен быть целым числом 0 или больше.')
];

const createSlaPolicyValidation = [
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Название обязательно.'),
    ...slaPolicyBaseValidation
];

const updateSlaPolicyValidation = [
    ...slaPolicyBaseValidation
];

const emailOutboxListValidation = [
    query('status')
        .optional()
        .isIn(['DRY_RUN', 'SENT', 'FAILED', 'RETRY_PENDING'])
        .withMessage('status должен быть DRY_RUN, SENT, FAILED или RETRY_PENDING.'),
    query('taskId').optional().isString().withMessage('taskId должен быть строкой.')
];

const freshdeskImportPayloadValidation = [
    body().custom((value) => {
        if (Array.isArray(value) || Array.isArray(value?.tickets)) {
            return true;
        }
        throw new Error('Передайте массив заявок или объект { tickets: [...] }.');
    })
];

const freshdeskPullValidation = [
    body('updatedSince').optional().isISO8601().withMessage('updatedSince должен быть ISO-датой.'),
    body('maxTickets').optional().isInt({ min: 1, max: 100 }).withMessage('maxTickets должен быть от 1 до 100.'),
    body('downloadAttachments').optional().isBoolean().withMessage('downloadAttachments должен быть boolean.')
];

const updateProductSettingsValidation = [
    body('portalName').optional().trim().isLength({ min: 1, max: 120 }).withMessage('portalName должен быть от 1 до 120 символов.'),
    body('companyName').optional().trim().isLength({ max: 255 }).withMessage('companyName должен быть до 255 символов.'),
    body('welcomeMessage').optional({ nullable: true }).isString().isLength({ max: 2000 }).withMessage('welcomeMessage должен быть строкой до 2000 символов или null.'),
    body('locale').optional().trim().isLength({ min: 2, max: 35 }).withMessage('locale должен быть от 2 до 35 символов.'),
    body('timezone').optional().trim().isLength({ min: 1, max: 100 }).withMessage('timezone должен быть от 1 до 100 символов.'),
    body('defaultPriority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('defaultPriority имеет некорректное значение.'),
    body('defaultFolderId').optional({ nullable: true }).isString().withMessage('defaultFolderId должен быть строкой или null.'),
    body('features').optional().isObject().withMessage('features должен быть объектом.'),
    body('features.*').optional().isBoolean().withMessage('Значения features должны быть boolean.')
];

router.get('/servicedesk/product-settings', controller.getProductSettings);
router.get('/servicedesk/folders', ...authenticated, controller.listActiveFolders);
router.get('/servicedesk/entities', ...authenticated, controller.listActiveEntities);
router.get('/servicedesk/types', ...authenticated, controller.listActiveTypes);
router.get('/servicedesk/subtypes', ...authenticated, controller.listActiveSubtypes);
router.get('/servicedesk/teams', ...authenticated, controller.listActiveTeams);

router.get('/service-desk/ticket-types', ...authenticated, controller.listActiveTypes);
router.get('/service-desk/ticket-subtypes', ...authenticated, controller.listActiveSubtypes);
router.get('/service-desk/entities', ...authenticated, controller.listActiveEntities);
router.get('/service-desk/teams', ...authenticated, controller.listActiveTeams);

// This control-plane endpoint intentionally has no feature middleware: it is
// the recovery path for re-enabling every optional module.
router.get('/servicedesk/admin/product-settings', ...adminOnly, controller.getAdminProductSettings);
router.patch(
    '/servicedesk/admin/product-settings',
    ...adminOnly,
    updateProductSettingsValidation,
    validate,
    controller.updateProductSettings
);

router.get('/servicedesk/admin/folders', ...adminOnly, controller.listFolders);
router.post('/servicedesk/admin/folders', ...adminOnly, textRefValidation, validate, controller.createFolder);
router.patch('/servicedesk/admin/folders/:id', ...adminOnly, idParam, textRefUpdateValidation, validate, controller.updateFolder);
router.delete('/servicedesk/admin/folders/:id', ...adminOnly, idParam, validate, controller.deleteFolder);

router.get('/servicedesk/admin/entities', ...adminOnly, controller.listEntities);
router.post('/servicedesk/admin/entities', ...adminOnly, codedRefValidation, validate, controller.createEntity);
router.patch('/servicedesk/admin/entities/:id', ...adminOnly, idParam, codedRefUpdateValidation, validate, controller.updateEntity);
router.delete('/servicedesk/admin/entities/:id', ...adminOnly, idParam, validate, controller.deleteEntity);

router.get('/servicedesk/admin/types', ...adminOnly, controller.listTypes);
router.post(
    '/servicedesk/admin/types',
    ...adminOnly,
    codedRefValidation,
    folderBindingValidation,
    entityBindingValidation,
    validate,
    controller.createType
);
router.get(
    '/servicedesk/admin/freshdesk-import/source-health',
    ...freshdeskAdminOnly,
    controller.getFreshdeskSourceHealth
);
router.post(
    '/servicedesk/admin/freshdesk-import/pull/dry-run',
    ...freshdeskAdminOnly,
    freshdeskPullValidation,
    validate,
    controller.dryRunFreshdeskApiPull
);
router.post(
    '/servicedesk/admin/freshdesk-import/pull',
    ...freshdeskAdminOnly,
    freshdeskPullValidation,
    validate,
    controller.createFreshdeskApiPull
);
router.patch(
    '/servicedesk/admin/types/:id',
    ...adminOnly,
    idParam,
    codedRefUpdateValidation,
    folderBindingValidation,
    entityBindingValidation,
    validate,
    controller.updateType
);
router.delete('/servicedesk/admin/types/:id', ...adminOnly, idParam, validate, controller.deleteType);

router.get('/servicedesk/admin/subtypes', ...adminOnly, controller.listSubtypes);
router.post(
    '/servicedesk/admin/subtypes',
    ...adminOnly,
    codedRefValidation,
    body('typeId').isString().withMessage('typeId обязателен.'),
    folderBindingValidation,
    validate,
    controller.createSubtype
);
router.patch(
    '/servicedesk/admin/subtypes/:id',
    ...adminOnly,
    idParam,
    codedRefUpdateValidation,
    body('typeId').optional().isString().withMessage('typeId должен быть строкой.'),
    folderBindingValidation,
    validate,
    controller.updateSubtype
);
router.delete('/servicedesk/admin/subtypes/:id', ...adminOnly, idParam, validate, controller.deleteSubtype);

router.get('/servicedesk/admin/teams', ...adminOnly, controller.listTeams);
router.post('/servicedesk/admin/teams', ...adminOnly, textRefValidation, folderBindingValidation, validate, controller.createTeam);
router.patch('/servicedesk/admin/teams/:id', ...adminOnly, idParam, textRefUpdateValidation, folderBindingValidation, validate, controller.updateTeam);
router.delete('/servicedesk/admin/teams/:id', ...adminOnly, idParam, validate, controller.deleteTeam);

router.get('/servicedesk/admin/teams/:teamId/members', ...adminOnly, teamIdParam, validate, controller.listTeamMembers);
router.post(
    '/servicedesk/admin/teams/:teamId/members',
    ...adminOnly,
    teamIdParam,
    body('userId').isString().withMessage('userId обязателен.'),
    body('role').optional({ nullable: true }).isString().withMessage('Роль в команде должна быть строкой.'),
    body('isLead').optional().isBoolean().withMessage('isLead должен быть boolean.'),
    validate,
    controller.createTeamMember
);
router.patch(
    '/servicedesk/admin/team-members/:id',
    ...adminOnly,
    idParam,
    body('role').optional({ nullable: true }).isString().withMessage('Роль в команде должна быть строкой.'),
    body('isLead').optional().isBoolean().withMessage('isLead должен быть boolean.'),
    validate,
    controller.updateTeamMember
);
router.delete('/servicedesk/admin/team-members/:id', ...adminOnly, idParam, validate, controller.deleteTeamMember);

router.get('/servicedesk/admin/sla-policies', ...adminOnly, controller.listSlaPolicies);
router.get('/servicedesk/admin/sla-policies/:id', ...adminOnly, idParam, validate, controller.getSlaPolicy);
router.post('/servicedesk/admin/sla-policies', ...adminOnly, createSlaPolicyValidation, validate, controller.createSlaPolicy);
router.put('/servicedesk/admin/sla-policies/:id', ...adminOnly, idParam, updateSlaPolicyValidation, validate, controller.updateSlaPolicy);
router.delete('/servicedesk/admin/sla-policies/:id', ...adminOnly, idParam, validate, controller.deleteSlaPolicy);
router.post(
    '/servicedesk/admin/sla-policies/:id/test',
    ...adminOnly,
    idParam,
    body('taskId').isString().withMessage('taskId обязателен.'),
    validate,
    controller.testSlaPolicy
);

router.get('/servicedesk/admin/automation-rules', ...automationAdminOnly, controller.listAutomationRules);
router.get('/servicedesk/admin/automation-rules/:id', ...automationAdminOnly, idParam, validate, controller.getAutomationRule);
router.post(
    '/servicedesk/admin/automation-rules',
    ...automationAdminOnly,
    createAutomationRuleValidation,
    validate,
    controller.createAutomationRule
);
router.put(
    '/servicedesk/admin/automation-rules/:id',
    ...automationAdminOnly,
    idParam,
    updateAutomationRuleValidation,
    validate,
    controller.updateAutomationRule
);
router.delete('/servicedesk/admin/automation-rules/:id', ...automationAdminOnly, idParam, validate, controller.deleteAutomationRule);
router.get(
    '/servicedesk/admin/automation-runs',
    ...automationAdminOnly,
    query('taskId').optional().isString().withMessage('taskId должен быть строкой.'),
    query('ruleId').optional().isString().withMessage('ruleId должен быть строкой.'),
    validate,
    controller.listAutomationRuns
);
router.post(
    '/servicedesk/admin/automation-rules/:id/test',
    ...automationAdminOnly,
    idParam,
    body('taskId').isString().withMessage('taskId обязателен.'),
    validate,
    controller.testAutomationRule
);

router.get(
    '/servicedesk/admin/email-outbox',
    ...emailAdminOnly,
    emailOutboxListValidation,
    validate,
    controller.listEmailOutbox
);
router.get(
    '/servicedesk/admin/email-health',
    ...emailAdminOnly,
    controller.getEmailHealth
);
router.get('/servicedesk/admin/email-settings', ...emailAdminOnly, controller.getEmailSettings);
router.patch('/servicedesk/admin/email-settings', ...emailAdminOnly, controller.updateEmailSettings);
router.post('/servicedesk/admin/email-settings/test', ...emailAdminOnly, controller.testEmailSettings);
router.post(
    '/servicedesk/admin/email-outbox/:id/retry',
    ...emailAdminOnly,
    idParam,
    validate,
    controller.retryEmailOutboxMessage
);

router.post(
    '/servicedesk/admin/freshdesk-import/dry-run',
    ...freshdeskAdminOnly,
    freshdeskImportPayloadValidation,
    validate,
    controller.dryRunFreshdeskImport
);
router.post(
    '/servicedesk/admin/freshdesk-import',
    ...freshdeskAdminOnly,
    freshdeskImportPayloadValidation,
    validate,
    controller.createFreshdeskImport
);
router.get(
    '/servicedesk/admin/freshdesk-import/runs',
    ...freshdeskAdminOnly,
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit должен быть от 1 до 100.'),
    query('cursor').optional().isISO8601().withMessage('cursor должен быть ISO датой.'),
    validate,
    controller.listFreshdeskImportRuns
);
router.get(
    '/servicedesk/admin/freshdesk-import/runs/:id',
    ...freshdeskAdminOnly,
    idParam,
    validate,
    controller.getFreshdeskImportRun
);

module.exports = router;
