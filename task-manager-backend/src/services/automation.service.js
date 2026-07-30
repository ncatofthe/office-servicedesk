const prisma = require('../prisma/prisma.js');
const productSettingsService = require('./product-settings.service.js');
const { createServiceDeskError } = require('./servicedesk.service.js');
const { safeRecordTimelineEvent } = require('./timeline.service.js');
const { resolveTaskServiceDeskReferences } = require('../utils/task-servicedesk-refs.js');
const { isAdminRole, isAgentRole } = require('../utils/roles.js');

const RULE_SELECT = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    sortOrder: true,
    triggerType: true,
    conditionChannel: true,
    conditionFolderId: true,
    conditionEntityId: true,
    conditionTypeId: true,
    conditionSubtypeId: true,
    conditionPriority: true,
    conditionRequesterEmailContains: true,
    conditionTitleContains: true,
    actionSetFolderId: true,
    actionSetEntityId: true,
    actionSetTypeId: true,
    actionSetSubtypeId: true,
    actionSetPriority: true,
    actionSetAssigneeIdsEnabled: true,
    actionSetAssigneeIds: true,
    createdAt: true,
    updatedAt: true
};

const RUN_SELECT = {
    id: true,
    ruleId: true,
    ruleName: true,
    taskId: true,
    triggerType: true,
    appliedActions: true,
    status: true,
    errorMessage: true,
    createdAt: true
};

const TASK_EXECUTION_SELECT = {
    id: true,
    title: true,
    priority: true,
    folderId: true,
    entityId: true,
    typeId: true,
    subtypeId: true,
    author: {
        select: {
            id: true,
            email: true
        }
    },
    assignees: {
        select: {
            userId: true
        },
        orderBy: {
            userId: 'asc'
        }
    }
};

const RULE_TRIGGER_TYPES = ['TASK_CREATED', 'EMAIL_TICKET_CREATED'];
const RULE_CHANNELS = ['WEB', 'EMAIL'];
const RULE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const TOP_LEVEL_FIELDS = ['name', 'description', 'isActive', 'sortOrder', 'triggerType', 'conditions', 'actions'];
const CONDITION_FIELDS = [
    'channel',
    'folderId',
    'entityId',
    'typeId',
    'subtypeId',
    'priority',
    'requesterEmailContains',
    'titleContains'
];
const ACTION_FIELDS = [
    'setFolderId',
    'setEntityId',
    'setTypeId',
    'setSubtypeId',
    'setPriority',
    'setAssigneeIds'
];

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const assertNoUnsupportedFields = (payload, allowedFields, label) => {
    const invalidFields = Object.keys(payload || {}).filter((field) => !allowedFields.includes(field));
    if (invalidFields.length > 0) {
        throw createServiceDeskError(
            `Неподдерживаемые поля ${label}: ${invalidFields.join(', ')}.`,
            'SERVICEDESK_INVALID'
        );
    }
};

const normalizeRequiredString = (value, fieldLabel) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw createServiceDeskError(`${fieldLabel} обязательно.`, 'SERVICEDESK_INVALID');
    }
    return normalized;
};

const normalizeOptionalString = (value, fieldLabel, { allowNull = true } = {}) => {
    if (value === undefined) return undefined;
    if (value === null) {
        if (allowNull) return null;
        throw createServiceDeskError(`${fieldLabel} не может быть null.`, 'SERVICEDESK_INVALID');
    }

    if (typeof value !== 'string') {
        throw createServiceDeskError(`${fieldLabel} должно быть строкой.`, 'SERVICEDESK_INVALID');
    }

    const normalized = value.trim();
    if (!normalized) {
        if (allowNull) return null;
        throw createServiceDeskError(`${fieldLabel} не должно быть пустым.`, 'SERVICEDESK_INVALID');
    }

    return normalized;
};

const normalizeOptionalBoolean = (value, fieldLabel) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') {
        throw createServiceDeskError(`${fieldLabel} должен быть boolean.`, 'SERVICEDESK_INVALID');
    }
    return value;
};

const normalizeOptionalInteger = (value, fieldLabel) => {
    if (value === undefined) return undefined;
    if (!Number.isInteger(value)) {
        throw createServiceDeskError(`${fieldLabel} должен быть целым числом.`, 'SERVICEDESK_INVALID');
    }
    return value;
};

const normalizeOptionalEnum = (value, fieldLabel, allowedValues, { allowNull = true } = {}) => {
    if (value === undefined) return undefined;
    if (value === null) {
        if (allowNull) return null;
        throw createServiceDeskError(`${fieldLabel} не может быть null.`, 'SERVICEDESK_INVALID');
    }
    if (typeof value !== 'string' || !allowedValues.includes(value)) {
        throw createServiceDeskError(
            `${fieldLabel} должно быть одним из: ${allowedValues.join(', ')}.`,
            'SERVICEDESK_INVALID'
        );
    }
    return value;
};

const normalizeOptionalId = (value, fieldLabel) => normalizeOptionalString(value, fieldLabel, { allowNull: true });

const normalizeStringArray = (value, fieldLabel) => {
    if (!Array.isArray(value)) {
        throw createServiceDeskError(`${fieldLabel} должен быть массивом строк.`, 'SERVICEDESK_INVALID');
    }

    const normalized = [...new Set(value.map((item) => {
        if (typeof item !== 'string') {
            throw createServiceDeskError(`${fieldLabel} должен быть массивом строк.`, 'SERVICEDESK_INVALID');
        }

        const trimmed = item.trim();
        if (!trimmed) {
            throw createServiceDeskError(`${fieldLabel} не должен содержать пустые значения.`, 'SERVICEDESK_INVALID');
        }

        return trimmed;
    }))];

    return normalized.sort();
};

const normalizeConditionsPatch = (conditions) => {
    if (conditions === undefined) return {};
    if (!isPlainObject(conditions)) {
        throw createServiceDeskError('conditions должен быть объектом.', 'SERVICEDESK_INVALID');
    }

    assertNoUnsupportedFields(conditions, CONDITION_FIELDS, 'conditions');

    const patch = {};

    if (Object.prototype.hasOwnProperty.call(conditions, 'channel')) {
        patch.conditionChannel = normalizeOptionalEnum(
            conditions.channel,
            'conditions.channel',
            RULE_CHANNELS
        );
    }
    if (Object.prototype.hasOwnProperty.call(conditions, 'folderId')) {
        patch.conditionFolderId = normalizeOptionalId(conditions.folderId, 'conditions.folderId');
    }
    if (Object.prototype.hasOwnProperty.call(conditions, 'entityId')) {
        patch.conditionEntityId = normalizeOptionalId(conditions.entityId, 'conditions.entityId');
    }
    if (Object.prototype.hasOwnProperty.call(conditions, 'typeId')) {
        patch.conditionTypeId = normalizeOptionalId(conditions.typeId, 'conditions.typeId');
    }
    if (Object.prototype.hasOwnProperty.call(conditions, 'subtypeId')) {
        patch.conditionSubtypeId = normalizeOptionalId(conditions.subtypeId, 'conditions.subtypeId');
    }
    if (Object.prototype.hasOwnProperty.call(conditions, 'priority')) {
        patch.conditionPriority = normalizeOptionalEnum(
            conditions.priority,
            'conditions.priority',
            RULE_PRIORITIES
        );
    }
    if (Object.prototype.hasOwnProperty.call(conditions, 'requesterEmailContains')) {
        patch.conditionRequesterEmailContains = normalizeOptionalString(
            conditions.requesterEmailContains,
            'conditions.requesterEmailContains',
            { allowNull: true }
        );
    }
    if (Object.prototype.hasOwnProperty.call(conditions, 'titleContains')) {
        patch.conditionTitleContains = normalizeOptionalString(
            conditions.titleContains,
            'conditions.titleContains',
            { allowNull: true }
        );
    }

    return patch;
};

const normalizeActionsPatch = (actions) => {
    if (actions === undefined) return {};
    if (!isPlainObject(actions)) {
        throw createServiceDeskError('actions должен быть объектом.', 'SERVICEDESK_INVALID');
    }

    assertNoUnsupportedFields(actions, ACTION_FIELDS, 'actions');

    const patch = {};

    if (Object.prototype.hasOwnProperty.call(actions, 'setFolderId')) {
        patch.actionSetFolderId = normalizeOptionalId(actions.setFolderId, 'actions.setFolderId');
    }
    if (Object.prototype.hasOwnProperty.call(actions, 'setEntityId')) {
        patch.actionSetEntityId = normalizeOptionalId(actions.setEntityId, 'actions.setEntityId');
    }
    if (Object.prototype.hasOwnProperty.call(actions, 'setTypeId')) {
        patch.actionSetTypeId = normalizeOptionalId(actions.setTypeId, 'actions.setTypeId');
    }
    if (Object.prototype.hasOwnProperty.call(actions, 'setSubtypeId')) {
        patch.actionSetSubtypeId = normalizeOptionalId(actions.setSubtypeId, 'actions.setSubtypeId');
    }
    if (Object.prototype.hasOwnProperty.call(actions, 'setPriority')) {
        patch.actionSetPriority = normalizeOptionalEnum(
            actions.setPriority,
            'actions.setPriority',
            RULE_PRIORITIES
        );
    }
    if (Object.prototype.hasOwnProperty.call(actions, 'setAssigneeIds')) {
        if (actions.setAssigneeIds === null) {
            patch.actionSetAssigneeIdsEnabled = false;
            patch.actionSetAssigneeIds = [];
        } else {
            patch.actionSetAssigneeIdsEnabled = true;
            patch.actionSetAssigneeIds = normalizeStringArray(actions.setAssigneeIds, 'actions.setAssigneeIds');
        }
    }

    return patch;
};

const buildConditionsObject = (rule) => {
    const conditions = {};

    if (rule.conditionChannel) conditions.channel = rule.conditionChannel;
    if (rule.conditionFolderId) conditions.folderId = rule.conditionFolderId;
    if (rule.conditionEntityId) conditions.entityId = rule.conditionEntityId;
    if (rule.conditionTypeId) conditions.typeId = rule.conditionTypeId;
    if (rule.conditionSubtypeId) conditions.subtypeId = rule.conditionSubtypeId;
    if (rule.conditionPriority) conditions.priority = rule.conditionPriority;
    if (rule.conditionRequesterEmailContains) {
        conditions.requesterEmailContains = rule.conditionRequesterEmailContains;
    }
    if (rule.conditionTitleContains) conditions.titleContains = rule.conditionTitleContains;

    return conditions;
};

const buildActionsObject = (rule) => {
    const actions = {};

    if (rule.actionSetFolderId) actions.setFolderId = rule.actionSetFolderId;
    if (rule.actionSetEntityId) actions.setEntityId = rule.actionSetEntityId;
    if (rule.actionSetTypeId) actions.setTypeId = rule.actionSetTypeId;
    if (rule.actionSetSubtypeId) actions.setSubtypeId = rule.actionSetSubtypeId;
    if (rule.actionSetPriority) actions.setPriority = rule.actionSetPriority;
    if (rule.actionSetAssigneeIdsEnabled) actions.setAssigneeIds = [...(rule.actionSetAssigneeIds || [])];

    return actions;
};

const hasConfiguredActions = (rule) => Boolean(
    rule.actionSetFolderId
    || rule.actionSetEntityId
    || rule.actionSetTypeId
    || rule.actionSetSubtypeId
    || rule.actionSetPriority
    || rule.actionSetAssigneeIdsEnabled
);

const serializeAppliedActions = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return JSON.parse(JSON.stringify(value));
};

const mapTaskExecutionState = (task) => {
    if (!task) return null;

    return {
        id: task.id,
        title: task.title,
        priority: task.priority,
        folderId: task.folderId ?? null,
        entityId: task.entityId ?? null,
        typeId: task.typeId ?? null,
        subtypeId: task.subtypeId ?? null,
        requesterEmail: task.author?.email ?? null,
        assigneeIds: (task.assignees || []).map((assignee) => assignee.userId).sort()
    };
};

const fetchTaskExecutionState = async(taskId, db = prisma) => {
    const task = await db.task.findUnique({
        where: { id: taskId },
        select: TASK_EXECUTION_SELECT
    });

    if (!task) {
        throw createServiceDeskError('Заявка не найдена.', 'SERVICEDESK_NOT_FOUND');
    }

    return mapTaskExecutionState(task);
};

const fetchRuleOrThrow = async(id, db = prisma) => {
    const rule = await db.automationRule.findUnique({
        where: { id },
        select: RULE_SELECT
    });

    if (!rule) {
        throw createServiceDeskError('Automation rule не найдена.', 'SERVICEDESK_NOT_FOUND');
    }

    return rule;
};

const loadActiveType = async(id, db = prisma) => {
    if (!id) return null;
    return db.ticketType.findFirst({
        where: { id, isActive: true },
        select: { id: true, folderId: true, entityId: true }
    });
};

const loadActiveSubtype = async(id, db = prisma) => {
    if (!id) return null;
    return db.ticketSubtype.findFirst({
        where: { id, isActive: true },
        select: {
            id: true,
            typeId: true,
            folderId: true,
            type: {
                select: {
                    id: true,
                    folderId: true,
                    entityId: true
                }
            }
        }
    });
};

const assertActiveRecordExists = async(id, label, loader, db = prisma) => {
    if (!id) return null;

    const record = await loader(id, db);
    if (!record) {
        throw createServiceDeskError(`${label} не найден(а) или неактивен(а).`, 'SERVICEDESK_NOT_FOUND');
    }

    return record;
};

const assertOptionalServiceDeskRecord = async(modelName, id, label, db = prisma) => {
    if (!id) return null;

    const model = db[modelName];
    const record = await model.findFirst({
        where: { id, isActive: true },
        select: { id: true }
    });

    if (!record) {
        throw createServiceDeskError(`${label} не найден(а) или неактивен(а).`, 'SERVICEDESK_NOT_FOUND');
    }

    return record;
};

const assertRuleReferenceConsistency = (scopeLabel, refs) => {
    const { folderId, entityId, typeId, type, subtypeId, subtype } = refs;
    const effectiveType = subtype ? subtype.type : type;

    if (subtype && typeId && subtype.typeId !== typeId) {
        throw createServiceDeskError(
            `${scopeLabel}: подтип не относится к указанному типу.`,
            'SERVICEDESK_INVALID'
        );
    }

    if (effectiveType && entityId && effectiveType.entityId && effectiveType.entityId !== entityId) {
        throw createServiceDeskError(
            `${scopeLabel}: тип привязан к другой сущности.`,
            'SERVICEDESK_INVALID'
        );
    }

    if (effectiveType && folderId && effectiveType.folderId && effectiveType.folderId !== folderId) {
        throw createServiceDeskError(
            `${scopeLabel}: тип привязан к другой папке.`,
            'SERVICEDESK_INVALID'
        );
    }

    if (subtype && folderId && subtype.folderId && subtype.folderId !== folderId) {
        throw createServiceDeskError(
            `${scopeLabel}: подтип привязан к другой папке.`,
            'SERVICEDESK_INVALID'
        );
    }
};

const validateRuleReferences = async(rule, db = prisma) => {
    await Promise.all([
        assertOptionalServiceDeskRecord('ticketFolder', rule.conditionFolderId, 'conditions.folderId', db),
        assertOptionalServiceDeskRecord('ticketEntity', rule.conditionEntityId, 'conditions.entityId', db),
        assertOptionalServiceDeskRecord('ticketFolder', rule.actionSetFolderId, 'actions.setFolderId', db),
        assertOptionalServiceDeskRecord('ticketEntity', rule.actionSetEntityId, 'actions.setEntityId', db)
    ]);

    const [
        conditionType,
        conditionSubtype,
        actionType,
        actionSubtype
    ] = await Promise.all([
        assertActiveRecordExists(rule.conditionTypeId, 'conditions.typeId', loadActiveType, db),
        assertActiveRecordExists(rule.conditionSubtypeId, 'conditions.subtypeId', loadActiveSubtype, db),
        assertActiveRecordExists(rule.actionSetTypeId, 'actions.setTypeId', loadActiveType, db),
        assertActiveRecordExists(rule.actionSetSubtypeId, 'actions.setSubtypeId', loadActiveSubtype, db)
    ]);

    assertRuleReferenceConsistency('conditions', {
        folderId: rule.conditionFolderId,
        entityId: rule.conditionEntityId,
        typeId: rule.conditionTypeId,
        type: conditionType,
        subtypeId: rule.conditionSubtypeId,
        subtype: conditionSubtype
    });

    assertRuleReferenceConsistency('actions', {
        folderId: rule.actionSetFolderId,
        entityId: rule.actionSetEntityId,
        typeId: rule.actionSetTypeId,
        type: actionType,
        subtypeId: rule.actionSetSubtypeId,
        subtype: actionSubtype
    });
};

const validateRuleConfiguration = async(rule, db = prisma) => {
    if (!rule.name || !String(rule.name).trim()) {
        throw createServiceDeskError('Название automation rule обязательно.', 'SERVICEDESK_INVALID');
    }

    if (!RULE_TRIGGER_TYPES.includes(rule.triggerType)) {
        throw createServiceDeskError('Некорректный triggerType.', 'SERVICEDESK_INVALID');
    }

    if (!Number.isInteger(rule.sortOrder)) {
        throw createServiceDeskError('sortOrder должен быть целым числом.', 'SERVICEDESK_INVALID');
    }

    if (!hasConfiguredActions(rule)) {
        throw createServiceDeskError('Automation rule должна содержать хотя бы одно действие.', 'SERVICEDESK_INVALID');
    }

    await validateRuleReferences(rule, db);
    if (rule.actionSetAssigneeIdsEnabled) {
        await assertAssigneesExist(rule.actionSetAssigneeIds, db);
    }
};

const normalizeCreatePayload = (data) => {
    if (!isPlainObject(data)) {
        throw createServiceDeskError('Тело запроса должно быть объектом.', 'SERVICEDESK_INVALID');
    }

    assertNoUnsupportedFields(data, TOP_LEVEL_FIELDS, 'automation rule');

    const finalRule = {
        name: normalizeRequiredString(data.name, 'Название automation rule'),
        description: normalizeOptionalString(data.description, 'Описание', { allowNull: true }) ?? null,
        isActive: normalizeOptionalBoolean(data.isActive, 'isActive'),
        sortOrder: normalizeOptionalInteger(data.sortOrder, 'sortOrder'),
        triggerType: normalizeOptionalEnum(data.triggerType, 'triggerType', RULE_TRIGGER_TYPES, { allowNull: false }),
        conditionChannel: null,
        conditionFolderId: null,
        conditionEntityId: null,
        conditionTypeId: null,
        conditionSubtypeId: null,
        conditionPriority: null,
        conditionRequesterEmailContains: null,
        conditionTitleContains: null,
        actionSetFolderId: null,
        actionSetEntityId: null,
        actionSetTypeId: null,
        actionSetSubtypeId: null,
        actionSetPriority: null,
        actionSetAssigneeIdsEnabled: false,
        actionSetAssigneeIds: []
    };

    if (finalRule.isActive === undefined) finalRule.isActive = true;
    if (finalRule.sortOrder === undefined) finalRule.sortOrder = 0;

    Object.assign(finalRule, normalizeConditionsPatch(data.conditions));
    Object.assign(finalRule, normalizeActionsPatch(data.actions));

    if (data.actions === undefined) {
        throw createServiceDeskError('actions обязательны.', 'SERVICEDESK_INVALID');
    }

    return finalRule;
};

const normalizeUpdatePatch = (data) => {
    if (!isPlainObject(data)) {
        throw createServiceDeskError('Тело запроса должно быть объектом.', 'SERVICEDESK_INVALID');
    }

    assertNoUnsupportedFields(data, TOP_LEVEL_FIELDS, 'automation rule');

    const patch = {};

    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        patch.name = normalizeRequiredString(data.name, 'Название automation rule');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) {
        patch.description = normalizeOptionalString(data.description, 'Описание', { allowNull: true }) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isActive')) {
        patch.isActive = normalizeOptionalBoolean(data.isActive, 'isActive');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'sortOrder')) {
        patch.sortOrder = normalizeOptionalInteger(data.sortOrder, 'sortOrder');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'triggerType')) {
        patch.triggerType = normalizeOptionalEnum(data.triggerType, 'triggerType', RULE_TRIGGER_TYPES, { allowNull: false });
    }

    Object.assign(patch, normalizeConditionsPatch(data.conditions));
    Object.assign(patch, normalizeActionsPatch(data.actions));

    return patch;
};

const listRules = async() => prisma.automationRule.findMany({
    select: RULE_SELECT,
    orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'asc' }
    ]
});

const getRule = async(id) => fetchRuleOrThrow(id);

const createRule = async(data) => {
    const finalRule = normalizeCreatePayload(data || {});
    await validateRuleConfiguration(finalRule);

    return prisma.automationRule.create({
        data: finalRule,
        select: RULE_SELECT
    });
};

const updateRule = async(id, data) => {
    const currentRule = await fetchRuleOrThrow(id);
    const patch = normalizeUpdatePatch(data || {});

    if (Object.keys(patch).length === 0) {
        throw createServiceDeskError('Нет данных для обновления automation rule.', 'SERVICEDESK_INVALID');
    }

    const finalRule = {
        ...currentRule,
        ...patch
    };

    await validateRuleConfiguration(finalRule);

    return prisma.automationRule.update({
        where: { id },
        data: patch,
        select: RULE_SELECT
    });
};

const deleteRule = async(id) => {
    await fetchRuleOrThrow(id);
    await prisma.automationRule.delete({ where: { id } });
    return { message: 'Automation rule удалена.' };
};

const listRuns = async(filters = {}) => {
    const where = {};

    if (filters.taskId) {
        where.taskId = String(filters.taskId).trim();
    }

    if (filters.ruleId) {
        where.ruleId = String(filters.ruleId).trim();
    }

    return prisma.automationRun.findMany({
        where,
        select: RUN_SELECT,
        orderBy: [
            { createdAt: 'desc' },
            { id: 'desc' }
        ]
    });
};

const normalizeComparableString = (value) => String(value || '').trim().toLowerCase();

const doesRuleMatchTask = (rule, taskState, executionContext = {}) => {
    if (rule.conditionChannel && rule.conditionChannel !== executionContext.channel) {
        return false;
    }
    if (rule.conditionFolderId && rule.conditionFolderId !== taskState.folderId) {
        return false;
    }
    if (rule.conditionEntityId && rule.conditionEntityId !== taskState.entityId) {
        return false;
    }
    if (rule.conditionTypeId && rule.conditionTypeId !== taskState.typeId) {
        return false;
    }
    if (rule.conditionSubtypeId && rule.conditionSubtypeId !== taskState.subtypeId) {
        return false;
    }
    if (rule.conditionPriority && rule.conditionPriority !== taskState.priority) {
        return false;
    }

    const requesterEmail = normalizeComparableString(
        executionContext.requesterEmail !== undefined
            ? executionContext.requesterEmail
            : taskState.requesterEmail
    );
    const title = normalizeComparableString(taskState.title);

    if (rule.conditionRequesterEmailContains
        && !requesterEmail.includes(normalizeComparableString(rule.conditionRequesterEmailContains))) {
        return false;
    }

    if (rule.conditionTitleContains
        && !title.includes(normalizeComparableString(rule.conditionTitleContains))) {
        return false;
    }

    return true;
};

const assertAssigneesExist = async(assigneeIds, db = prisma) => {
    if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) {
        return;
    }

    const users = await db.user.findMany({
        where: {
            id: {
                in: assigneeIds
            }
        },
        select: {
            id: true,
            role: true,
            isActive: true
        }
    });

    if (users.length !== assigneeIds.length) {
        throw createServiceDeskError('Один или несколько assignee не найдены.', 'SERVICEDESK_NOT_FOUND');
    }

    const invalidUsers = users.filter((user) => (
        !user.isActive || (!isAdminRole(user.role) && !isAgentRole(user.role))
    ));
    if (invalidUsers.length > 0) {
        throw createServiceDeskError(
            'Исполнителем можно назначить только активного администратора или исполнителя.',
            'SERVICEDESK_INVALID'
        );
    }
};

const buildNextTaskState = (taskState, appliedActions, nextRefs, nextPriority, nextAssigneeIds, hasAssigneeAction) => ({
    ...taskState,
    folderId: Object.prototype.hasOwnProperty.call(appliedActions, 'setFolderId') ? nextRefs.folderId : taskState.folderId,
    entityId: Object.prototype.hasOwnProperty.call(appliedActions, 'setEntityId') ? nextRefs.entityId : taskState.entityId,
    typeId: Object.prototype.hasOwnProperty.call(appliedActions, 'setTypeId') ? nextRefs.typeId : taskState.typeId,
    subtypeId: Object.prototype.hasOwnProperty.call(appliedActions, 'setSubtypeId') ? nextRefs.subtypeId : taskState.subtypeId,
    priority: Object.prototype.hasOwnProperty.call(appliedActions, 'setPriority') ? nextPriority : taskState.priority,
    assigneeIds: hasAssigneeAction ? nextAssigneeIds : taskState.assigneeIds
});

const createRunLog = async(data, db = prisma) => {
    try {
        return await db.automationRun.create({
            data: {
                ruleId: data.ruleId,
                ruleName: data.ruleName,
                taskId: data.taskId,
                triggerType: data.triggerType,
                appliedActions: data.appliedActions,
                status: data.status,
                errorMessage: data.errorMessage || null
            },
            select: RUN_SELECT
        });
    } catch (error) {
        console.error('[automation] Failed to persist automation run log', {
            ruleId: data.ruleId,
            taskId: data.taskId,
            error: error.message
        });
        return null;
    }
};

const executeRule = async(rule, taskState, executionContext = {}, { dryRun = false, db = prisma } = {}) => {
    const matched = doesRuleMatchTask(rule, taskState, executionContext);
    if (!matched) {
        return {
            matched: false,
            success: true,
            appliedActions: {},
            taskState
        };
    }

    try {
        const nextRefs = await resolveTaskServiceDeskReferences(db, {
            folderId: rule.actionSetFolderId !== null ? rule.actionSetFolderId : taskState.folderId,
            entityId: rule.actionSetEntityId !== null ? rule.actionSetEntityId : taskState.entityId,
            typeId: rule.actionSetTypeId !== null ? rule.actionSetTypeId : taskState.typeId,
            subtypeId: rule.actionSetSubtypeId !== null ? rule.actionSetSubtypeId : taskState.subtypeId
        });
        const nextPriority = rule.actionSetPriority !== null ? rule.actionSetPriority : taskState.priority;
        const nextAssigneeIds = rule.actionSetAssigneeIdsEnabled
            ? [...(rule.actionSetAssigneeIds || [])].sort()
            : taskState.assigneeIds;

        if (rule.actionSetAssigneeIdsEnabled) {
            await assertAssigneesExist(nextAssigneeIds, db);
        }

        const appliedActions = {};
        const updateData = {};

        if (rule.actionSetFolderId !== null && nextRefs.folderId !== taskState.folderId) {
            appliedActions.setFolderId = nextRefs.folderId;
            updateData.folderId = nextRefs.folderId;
        }
        if (rule.actionSetEntityId !== null && nextRefs.entityId !== taskState.entityId) {
            appliedActions.setEntityId = nextRefs.entityId;
            updateData.entityId = nextRefs.entityId;
        }
        if (rule.actionSetTypeId !== null && nextRefs.typeId !== taskState.typeId) {
            appliedActions.setTypeId = nextRefs.typeId;
            updateData.typeId = nextRefs.typeId;
        }
        if (rule.actionSetSubtypeId !== null && nextRefs.subtypeId !== taskState.subtypeId) {
            appliedActions.setSubtypeId = nextRefs.subtypeId;
            updateData.subtypeId = nextRefs.subtypeId;
        }
        if (rule.actionSetPriority !== null && nextPriority !== taskState.priority) {
            appliedActions.setPriority = nextPriority;
            updateData.priority = nextPriority;
        }

        const currentAssigneeIds = [...taskState.assigneeIds].sort();
        const hasAssigneeAction = rule.actionSetAssigneeIdsEnabled
            && JSON.stringify(currentAssigneeIds) !== JSON.stringify(nextAssigneeIds);

        if (hasAssigneeAction) {
            appliedActions.setAssigneeIds = nextAssigneeIds;
        }

        const nextTaskState = buildNextTaskState(
            taskState,
            appliedActions,
            nextRefs,
            nextPriority,
            nextAssigneeIds,
            hasAssigneeAction
        );

        if (dryRun) {
            return {
                matched: true,
                success: true,
                appliedActions,
                taskState: nextTaskState
            };
        }

        let persistedTaskState = nextTaskState;

        await db.$transaction(async(tx) => {
            if (Object.keys(updateData).length > 0) {
                await tx.task.update({
                    where: { id: taskState.id },
                    data: updateData
                });
            }

            if (rule.actionSetAssigneeIdsEnabled) {
                await tx.taskAssignee.deleteMany({
                    where: {
                        taskId: taskState.id,
                        ...(nextAssigneeIds.length > 0 ? { userId: { notIn: nextAssigneeIds } } : {})
                    }
                });

                if (nextAssigneeIds.length > 0) {
                    await tx.taskAssignee.createMany({
                        data: nextAssigneeIds.map((userId) => ({
                            taskId: taskState.id,
                            userId
                        })),
                        skipDuplicates: true
                    });
                }
            }

            await tx.automationRun.create({
                data: {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    taskId: taskState.id,
                    triggerType: rule.triggerType,
                    appliedActions,
                    status: 'SUCCESS',
                    errorMessage: null
                }
            });

            await safeRecordTimelineEvent({
                taskId: taskState.id,
                actorId: null,
                type: 'AUTOMATION_APPLIED',
                title: 'Применено правило автоматизации',
                description: rule.name,
                metadata: {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    triggerType: rule.triggerType,
                    appliedActions
                }
            }, tx);

            const refreshedTask = await tx.task.findUnique({
                where: { id: taskState.id },
                select: TASK_EXECUTION_SELECT
            });
            persistedTaskState = mapTaskExecutionState(refreshedTask);
        });

        return {
            matched: true,
            success: true,
            appliedActions,
            taskState: persistedTaskState
        };
    } catch (error) {
        if (!dryRun) {
            await createRunLog({
                ruleId: rule.id,
                ruleName: rule.name,
                taskId: taskState.id,
                triggerType: rule.triggerType,
                appliedActions: {},
                status: 'ERROR',
                errorMessage: error.message
            }, db);
        }

        return {
            matched: true,
            success: false,
            appliedActions: {},
            errorMessage: error.message,
            taskState
        };
    }
};

const runAutomationRulesForTask = async({ taskId, triggerType, channel, requesterEmail } = {}, db = prisma) => {
    if (!(await productSettingsService.isFeatureEnabled('automation', db))) {
        return [];
    }

    if (!taskId) {
        throw createServiceDeskError('taskId обязателен для automation execution.', 'SERVICEDESK_INVALID');
    }

    if (!RULE_TRIGGER_TYPES.includes(triggerType)) {
        throw createServiceDeskError('Некорректный triggerType для automation execution.', 'SERVICEDESK_INVALID');
    }

    const rules = await db.automationRule.findMany({
        where: {
            isActive: true,
            triggerType
        },
        select: RULE_SELECT,
        orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'asc' }
        ]
    });

    let taskState = await fetchTaskExecutionState(taskId, db);
    const matchedRuns = [];

    for (const rule of rules) {
        const result = await executeRule(rule, taskState, {
            channel,
            requesterEmail: requesterEmail ?? taskState.requesterEmail
        }, { dryRun: false, db });

        if (!result.matched) {
            continue;
        }

        matchedRuns.push({
            ruleId: rule.id,
            success: result.success,
            appliedActions: result.appliedActions,
            errorMessage: result.errorMessage || null
        });
        taskState = result.taskState;
    }

    return {
        task: taskState,
        runs: matchedRuns
    };
};

const testRule = async(id, taskId) => {
    const rule = await fetchRuleOrThrow(id);
    const taskState = await fetchTaskExecutionState(taskId);
    const result = await executeRule(rule, taskState, {
        channel: rule.triggerType === 'EMAIL_TICKET_CREATED' ? 'EMAIL' : 'WEB',
        requesterEmail: taskState.requesterEmail
    }, { dryRun: true, db: prisma });

    return {
        dryRun: true,
        ruleId: rule.id,
        taskId,
        matched: result.matched,
        success: result.success,
        appliedActions: result.appliedActions,
        errorMessage: result.errorMessage || null,
        resultingTask: {
            id: result.taskState.id,
            title: result.taskState.title,
            priority: result.taskState.priority,
            folderId: result.taskState.folderId,
            entityId: result.taskState.entityId,
            typeId: result.taskState.typeId,
            subtypeId: result.taskState.subtypeId,
            assigneeIds: result.taskState.assigneeIds
        }
    };
};

module.exports = {
    RULE_SELECT,
    RUN_SELECT,
    buildActionsObject,
    buildConditionsObject,
    listRules,
    getRule,
    createRule,
    updateRule,
    deleteRule,
    listRuns,
    testRule,
    runAutomationRulesForTask
};
