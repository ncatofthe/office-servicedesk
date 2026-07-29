const prisma = require('../prisma/prisma.js');
const {
    buildSlaFields,
    matchesSlaPolicy,
    pickMatchingSlaPolicy,
    toDateOrNull
} = require('../utils/sla.js');
const { isAdminRole, isAgentRole } = require('../utils/roles.js');
const { resolveTaskServiceDeskReferences } = require('../utils/task-servicedesk-refs.js');

const SLA_POLICY_SELECT = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    sortOrder: true,
    folderId: true,
    typeId: true,
    subtypeId: true,
    priority: true,
    firstResponseMinutes: true,
    resolutionMinutes: true,
    createdAt: true,
    updatedAt: true,
    folder: {
        select: {
            id: true,
            name: true,
            description: true,
            isActive: true
        }
    },
    type: {
        select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,
            folderId: true,
            entityId: true
        }
    },
    subtype: {
        select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,
            typeId: true,
            folderId: true
        }
    },
    _count: {
        select: {
            tasks: true
        }
    }
};

const TASK_SLA_POLICY_SELECT = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    sortOrder: true,
    folderId: true,
    typeId: true,
    subtypeId: true,
    priority: true,
    firstResponseMinutes: true,
    resolutionMinutes: true,
    createdAt: true,
    updatedAt: true
};

const TASK_SLA_EVALUATION_SELECT = {
    id: true,
    title: true,
    status: true,
    priority: true,
    folderId: true,
    typeId: true,
    subtypeId: true,
    createdAt: true,
    firstResponseAt: true,
    resolvedAt: true
};

const createSlaError = (message, code, extra = {}) => {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, extra);
    return error;
};

const normalizeRequiredString = (value, fieldLabel) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw createSlaError(`${fieldLabel} обязательно.`, 'SERVICEDESK_INVALID');
    }
    return normalized;
};

const normalizeOptionalString = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const normalized = String(value).trim();
    return normalized || null;
};

const normalizeNullablePriority = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;

    if (!['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(value)) {
        throw createSlaError('priority имеет некорректное значение.', 'SERVICEDESK_INVALID');
    }

    return value;
};

const normalizeNullableInteger = (value, fieldLabel) => {
    if (value === undefined) return undefined;
    if (value === null) return null;

    const parsed = Number.parseInt(`${value}`, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw createSlaError(`${fieldLabel} должен быть целым числом 0 или больше.`, 'SERVICEDESK_INVALID');
    }

    return parsed;
};

const assertNoUnsupportedFields = (payload, allowedFields) => {
    const invalidFields = Object.keys(payload || {}).filter((field) => !allowedFields.includes(field));
    if (invalidFields.length > 0) {
        throw createSlaError(`Неподдерживаемые поля: ${invalidFields.join(', ')}.`, 'SERVICEDESK_INVALID');
    }
};

const resolveActiveFolderId = async(folderId, db = prisma) => {
    if (folderId === undefined) return undefined;
    if (folderId === null) return null;

    const folder = await db.ticketFolder.findFirst({
        where: { id: folderId, isActive: true },
        select: { id: true }
    });
    if (!folder) {
        throw createSlaError('Активная папка заявки не найдена.', 'SERVICEDESK_NOT_FOUND');
    }

    return folder.id;
};

const resolveActiveTypeId = async(typeId, db = prisma) => {
    if (typeId === undefined) return undefined;
    if (typeId === null) return null;

    const type = await db.ticketType.findFirst({
        where: { id: typeId, isActive: true },
        select: { id: true }
    });
    if (!type) {
        throw createSlaError('Активный тип заявки не найден.', 'SERVICEDESK_NOT_FOUND');
    }

    return type.id;
};

const resolveActiveSubtypeId = async(subtypeId, db = prisma) => {
    if (subtypeId === undefined) return undefined;
    if (subtypeId === null) return null;

    const subtype = await db.ticketSubtype.findFirst({
        where: { id: subtypeId, isActive: true },
        select: { id: true }
    });
    if (!subtype) {
        throw createSlaError('Активный подтип заявки не найден.', 'SERVICEDESK_NOT_FOUND');
    }

    return subtype.id;
};

const getPolicy = async(id, db = prisma) => {
    const policy = await db.slaPolicy.findUnique({
        where: { id },
        select: SLA_POLICY_SELECT
    });

    if (!policy) {
        throw createSlaError('SLA policy не найдена.', 'SERVICEDESK_NOT_FOUND');
    }

    return policy;
};

const listPolicies = async(db = prisma) => db.slaPolicy.findMany({
    select: SLA_POLICY_SELECT,
    orderBy: [
        { isActive: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' }
    ]
});

const listActivePoliciesForMatching = async(db = prisma) => db.slaPolicy.findMany({
    where: { isActive: true },
    select: TASK_SLA_POLICY_SELECT,
    orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'asc' }
    ]
});

const findMatchingPolicyForTask = async(taskLike, db = prisma) => {
    const policies = await listActivePoliciesForMatching(db);
    return pickMatchingSlaPolicy(policies, taskLike);
};

const buildTaskSlaSnapshot = async(taskLike, db = prisma, options = {}) => {
    const now = options.now || new Date();
    const policy = Object.prototype.hasOwnProperty.call(options, 'policy')
        ? options.policy
        : await findMatchingPolicyForTask(taskLike, db);

    return {
        policy,
        ...buildSlaFields({
            policy,
            createdAt: taskLike.createdAt,
            firstResponseAt: taskLike.firstResponseAt,
            resolvedAt: taskLike.resolvedAt,
            now
        })
    };
};

const createPolicy = async(data, db = prisma) => {
    assertNoUnsupportedFields(data, [
        'name',
        'description',
        'isActive',
        'sortOrder',
        'folderId',
        'typeId',
        'subtypeId',
        'priority',
        'firstResponseMinutes',
        'resolutionMinutes'
    ]);

    const folderId = await resolveActiveFolderId(data.folderId, db);
    const typeId = await resolveActiveTypeId(data.typeId, db);
    const subtypeId = await resolveActiveSubtypeId(data.subtypeId, db);
    await resolveTaskServiceDeskReferences(db, { folderId, typeId, subtypeId });

    return db.slaPolicy.create({
        data: {
            name: normalizeRequiredString(data.name, 'Название SLA policy'),
            description: normalizeOptionalString(data.description),
            isActive: data.isActive === undefined ? true : Boolean(data.isActive),
            sortOrder: normalizeNullableInteger(data.sortOrder === undefined ? 0 : data.sortOrder, 'sortOrder'),
            folderId,
            typeId,
            subtypeId,
            priority: normalizeNullablePriority(data.priority) ?? null,
            firstResponseMinutes: normalizeNullableInteger(data.firstResponseMinutes, 'firstResponseMinutes') ?? null,
            resolutionMinutes: normalizeNullableInteger(data.resolutionMinutes, 'resolutionMinutes') ?? null
        },
        select: SLA_POLICY_SELECT
    });
};

const updatePolicy = async(id, data, db = prisma) => {
    assertNoUnsupportedFields(data, [
        'name',
        'description',
        'isActive',
        'sortOrder',
        'folderId',
        'typeId',
        'subtypeId',
        'priority',
        'firstResponseMinutes',
        'resolutionMinutes'
    ]);
    const currentPolicy = await getPolicy(id, db);

    const updateData = {};

    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        updateData.name = normalizeRequiredString(data.name, 'Название SLA policy');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) {
        updateData.description = normalizeOptionalString(data.description);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isActive')) {
        updateData.isActive = Boolean(data.isActive);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'sortOrder')) {
        updateData.sortOrder = normalizeNullableInteger(data.sortOrder, 'sortOrder');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'folderId')) {
        updateData.folderId = await resolveActiveFolderId(data.folderId, db);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'typeId')) {
        updateData.typeId = await resolveActiveTypeId(data.typeId, db);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'subtypeId')) {
        updateData.subtypeId = await resolveActiveSubtypeId(data.subtypeId, db);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'priority')) {
        updateData.priority = normalizeNullablePriority(data.priority);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'firstResponseMinutes')) {
        updateData.firstResponseMinutes = normalizeNullableInteger(data.firstResponseMinutes, 'firstResponseMinutes');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'resolutionMinutes')) {
        updateData.resolutionMinutes = normalizeNullableInteger(data.resolutionMinutes, 'resolutionMinutes');
    }

    if (Object.keys(updateData).length === 0) {
        throw createSlaError('Нет данных для обновления SLA policy.', 'SERVICEDESK_INVALID');
    }

    await resolveTaskServiceDeskReferences(db, {
        folderId: Object.prototype.hasOwnProperty.call(updateData, 'folderId')
            ? updateData.folderId
            : currentPolicy.folderId,
        typeId: Object.prototype.hasOwnProperty.call(updateData, 'typeId')
            ? updateData.typeId
            : currentPolicy.typeId,
        subtypeId: Object.prototype.hasOwnProperty.call(updateData, 'subtypeId')
            ? updateData.subtypeId
            : currentPolicy.subtypeId
    });

    return db.slaPolicy.update({
        where: { id },
        data: updateData,
        select: SLA_POLICY_SELECT
    });
};

const deletePolicy = async(id, db = prisma) => {
    const policy = await getPolicy(id, db);
    const blockers = {
        tasks: policy._count?.tasks ?? 0
    };

    if (blockers.tasks > 0) {
        throw createSlaError(
            'Нельзя удалить SLA policy, пока к ней привязаны заявки.',
            'SERVICEDESK_DELETE_BLOCKED',
            { blockers }
        );
    }

    await db.slaPolicy.delete({ where: { id } });
    return { message: 'SLA policy удалена.' };
};

const testPolicy = async(id, taskId, db = prisma) => {
    const [policy, task] = await Promise.all([
        getPolicy(id, db),
        db.task.findUnique({
            where: { id: taskId },
            select: TASK_SLA_EVALUATION_SELECT
        })
    ]);

    if (!task) {
        throw createSlaError('Заявка для проверки SLA policy не найдена.', 'SERVICEDESK_NOT_FOUND');
    }

    const matched = matchesSlaPolicy(policy, task);
    const snapshot = matched
        ? buildSlaFields({
            policy,
            createdAt: task.createdAt,
            firstResponseAt: task.firstResponseAt,
            resolvedAt: task.resolvedAt,
            now: new Date()
        })
        : buildSlaFields({
            policy: null,
            createdAt: task.createdAt,
            firstResponseAt: task.firstResponseAt,
            resolvedAt: task.resolvedAt,
            now: new Date()
        });

    return {
        matched,
        policy: matched ? policy : null,
        resultingDueDates: {
            firstResponseDueAt: snapshot.firstResponseDueAt,
            resolutionDueAt: snapshot.resolutionDueAt
        },
        resultingStatuses: {
            firstResponseStatus: snapshot.slaFirstResponseStatus,
            resolutionStatus: snapshot.slaResolutionStatus
        }
    };
};

const markTaskFirstResponse = async(taskId, actor, db = prisma, options = {}) => {
    if (!actor || (!isAdminRole(actor.role) && !isAgentRole(actor.role))) {
        return null;
    }

    const task = await db.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            firstResponseAt: true,
            firstResponseDueAt: true
        }
    });

    if (!task || task.firstResponseAt) {
        return task;
    }

    const respondedAt = options.respondedAt || new Date();
    const slaFirstResponseStatus = task.firstResponseDueAt
        ? (respondedAt.getTime() <= task.firstResponseDueAt.getTime() ? 'MET' : 'BREACHED')
        : null;

    await db.task.update({
        where: { id: taskId },
        data: {
            firstResponseAt: respondedAt,
            slaFirstResponseStatus
        }
    });

    return {
        ...task,
        firstResponseAt: respondedAt,
        slaFirstResponseStatus
    };
};

const buildResolutionStatusForTask = (task, status, now = new Date()) => {
    if (status === 'DONE') {
        const resolvedAt = now;
        return {
            resolvedAt,
            slaResolutionStatus: task.resolutionDueAt
                ? (resolvedAt.getTime() <= task.resolutionDueAt.getTime() ? 'MET' : 'BREACHED')
                : null
        };
    }

    if (task.status === 'DONE') {
        return {
            resolvedAt: null,
            slaResolutionStatus: task.resolutionDueAt
                ? (now.getTime() > task.resolutionDueAt.getTime() ? 'BREACHED' : 'PENDING')
                : null
        };
    }

    return {
        resolvedAt: task.resolvedAt ? toDateOrNull(task.resolvedAt) : null,
        slaResolutionStatus: task.resolutionDueAt
            ? (task.resolvedAt
                ? (toDateOrNull(task.resolvedAt).getTime() <= task.resolutionDueAt.getTime() ? 'MET' : 'BREACHED')
                : (now.getTime() > task.resolutionDueAt.getTime() ? 'BREACHED' : 'PENDING'))
            : null
    };
};

module.exports = {
    SLA_POLICY_SELECT,
    TASK_SLA_POLICY_SELECT,
    TASK_SLA_EVALUATION_SELECT,
    buildResolutionStatusForTask,
    buildTaskSlaSnapshot,
    createPolicy,
    createSlaError,
    deletePolicy,
    findMatchingPolicyForTask,
    getPolicy,
    listPolicies,
    markTaskFirstResponse,
    matchesSlaPolicy,
    testPolicy,
    updatePolicy
};
