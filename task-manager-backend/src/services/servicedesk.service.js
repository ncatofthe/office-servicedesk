const prisma = require('../prisma/prisma.js');
const { isAdminRole, isAgentRole } = require('../utils/roles.js');
const { getAgentAccessibleFolderIds } = require('../utils/team-folder-access.js');

const FOLDER_SELECT = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: {
        select: {
            tasks: true,
            types: true,
            subtypes: true,
            teams: true,
            teamAccesses: true,
            slaPolicies: true,
            productSettings: true
        }
    }
};

const ENTITY_SELECT = {
    id: true,
    name: true,
    code: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: {
        select: {
            tasks: true,
            types: true
        }
    }
};

const TYPE_SELECT = {
    id: true,
    name: true,
    code: true,
    description: true,
    isActive: true,
    folderId: true,
    entityId: true,
    folder: { select: { id: true, name: true, description: true, isActive: true } },
    entity: { select: { id: true, name: true, code: true, description: true, isActive: true } },
    createdAt: true,
    updatedAt: true,
    _count: {
        select: {
            tasks: true,
            subtypes: true,
            slaPolicies: true
        }
    }
};

const SUBTYPE_SELECT = {
    id: true,
    name: true,
    code: true,
    description: true,
    isActive: true,
    typeId: true,
    folderId: true,
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
    folder: { select: { id: true, name: true, description: true, isActive: true } },
    createdAt: true,
    updatedAt: true,
    _count: {
        select: {
            tasks: true,
            slaPolicies: true
        }
    }
};

const TEAM_MEMBER_SELECT = {
    id: true,
    teamId: true,
    userId: true,
    role: true,
    isLead: true,
    createdAt: true,
    updatedAt: true,
    user: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true
        }
    }
};

const TEAM_SELECT = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    folderId: true,
    folder: { select: { id: true, name: true, description: true, isActive: true } },
    folderAccesses: {
        select: {
            id: true,
            folderId: true,
            folder: { select: { id: true, name: true, description: true, isActive: true } },
            createdAt: true,
            updatedAt: true
        },
        orderBy: {
            createdAt: 'asc'
        }
    },
    members: {
        select: TEAM_MEMBER_SELECT,
        orderBy: [
            { isLead: 'desc' },
            { createdAt: 'asc' }
        ]
    },
    createdAt: true,
    updatedAt: true,
    _count: {
        select: {
            members: true,
            folderAccesses: true
        }
    }
};

const createServiceDeskError = (message, code, extra = {}) => {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, extra);
    return error;
};

const normalizeRequiredString = (value, fieldLabel) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw createServiceDeskError(`${fieldLabel} обязательно.`, 'SERVICEDESK_INVALID');
    }
    return normalized;
};

const normalizeOptionalString = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
};

const normalizeOptionalCode = (value) => {
    const normalized = normalizeOptionalString(value);
    return normalized ? normalized.toUpperCase() : null;
};

const assertNoUnsupportedFields = (payload, allowedFields) => {
    const invalidFields = Object.keys(payload || {}).filter((field) => !allowedFields.includes(field));
    if (invalidFields.length > 0) {
        throw createServiceDeskError(
            `Неподдерживаемые поля: ${invalidFields.join(', ')}.`,
            'SERVICEDESK_INVALID'
        );
    }
};

const normalizeFolderIdsInput = (folderIds) => {
    if (folderIds === undefined) return undefined;
    if (!Array.isArray(folderIds)) {
        throw createServiceDeskError('folderIds должен быть массивом идентификаторов папок.', 'SERVICEDESK_INVALID');
    }

    return [...new Set(folderIds
        .filter((folderId) => folderId !== null && folderId !== undefined && String(folderId).trim().length > 0)
        .map((folderId) => String(folderId).trim()))];
};

const resolveActiveFolderId = async(folderId, db = prisma, { allowNull = true } = {}) => {
    if (folderId === undefined) return undefined;
    if (folderId === null) {
        if (allowNull) return null;
        throw createServiceDeskError('Папка заявки обязательна.', 'SERVICEDESK_INVALID');
    }

    const folder = await db.ticketFolder.findFirst({
        where: { id: folderId, isActive: true },
        select: { id: true }
    });

    if (!folder) {
        throw createServiceDeskError('Активная папка заявки не найдена.', 'SERVICEDESK_NOT_FOUND');
    }

    return folder.id;
};

const resolveActiveEntityId = async(entityId, db = prisma) => {
    if (entityId === undefined) return undefined;
    if (entityId === null) return null;

    const entity = await db.ticketEntity.findFirst({
        where: { id: entityId, isActive: true },
        select: { id: true }
    });

    if (!entity) {
        throw createServiceDeskError('Активная сущность заявки не найдена.', 'SERVICEDESK_NOT_FOUND');
    }

    return entity.id;
};

const resolveActiveTypeId = async(typeId, db = prisma) => {
    if (typeId === undefined) return undefined;
    if (typeId === null) return null;

    const type = await db.ticketType.findFirst({
        where: { id: typeId, isActive: true },
        select: { id: true }
    });

    if (!type) {
        throw createServiceDeskError('Активный тип заявки не найден.', 'SERVICEDESK_NOT_FOUND');
    }

    return type.id;
};

const assertSubtypeFolderConsistency = async(typeId, folderId, db = prisma) => {
    if (!typeId || !folderId) return;

    const type = await db.ticketType.findUnique({
        where: { id: typeId },
        select: { folderId: true }
    });

    if (type?.folderId && type.folderId !== folderId) {
        throw createServiceDeskError(
            'Подтип нельзя привязать к папке, отличной от папки его типа.',
            'SERVICEDESK_INVALID'
        );
    }
};

const getFolder = async(id, db = prisma) => {
    const folder = await db.ticketFolder.findUnique({
        where: { id },
        select: FOLDER_SELECT
    });
    if (!folder) {
        throw createServiceDeskError('Папка заявки не найдена.', 'SERVICEDESK_NOT_FOUND');
    }
    return folder;
};

const getEntity = async(id, db = prisma) => {
    const entity = await db.ticketEntity.findUnique({
        where: { id },
        select: ENTITY_SELECT
    });
    if (!entity) {
        throw createServiceDeskError('Сущность заявки не найдена.', 'SERVICEDESK_NOT_FOUND');
    }
    return entity;
};

const getType = async(id, db = prisma) => {
    const type = await db.ticketType.findUnique({
        where: { id },
        select: TYPE_SELECT
    });
    if (!type) {
        throw createServiceDeskError('Тип заявки не найден.', 'SERVICEDESK_NOT_FOUND');
    }
    return type;
};

const getSubtype = async(id, db = prisma) => {
    const subtype = await db.ticketSubtype.findUnique({
        where: { id },
        select: SUBTYPE_SELECT
    });
    if (!subtype) {
        throw createServiceDeskError('Подтип заявки не найден.', 'SERVICEDESK_NOT_FOUND');
    }
    return subtype;
};

const getTeam = async(id, db = prisma) => {
    const team = await db.supportTeam.findUnique({
        where: { id },
        select: TEAM_SELECT
    });
    if (!team) {
        throw createServiceDeskError('Команда исполнителей не найдена.', 'SERVICEDESK_NOT_FOUND');
    }
    return team;
};

const listFolders = () => prisma.ticketFolder.findMany({
    select: FOLDER_SELECT,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
});

const listActiveFolders = () => prisma.ticketFolder.findMany({
    where: { isActive: true },
    select: FOLDER_SELECT,
    orderBy: { name: 'asc' }
});

const listAvailableFoldersForUser = async(user) => {
    if (!user || isAdminRole(user.role) || !isAgentRole(user.role)) {
        return listActiveFolders();
    }

    const accessibleFolderIds = await getAgentAccessibleFolderIds(user.id);
    if (accessibleFolderIds.length === 0) {
        return [];
    }

    return prisma.ticketFolder.findMany({
        where: {
            isActive: true,
            id: { in: accessibleFolderIds }
        },
        select: FOLDER_SELECT,
        orderBy: { name: 'asc' }
    });
};

const createFolder = async(data) => {
    assertNoUnsupportedFields(data, ['name', 'description', 'isActive']);
    return prisma.ticketFolder.create({
        data: {
            name: normalizeRequiredString(data.name, 'Название папки'),
            description: normalizeOptionalString(data.description),
            isActive: data.isActive === undefined ? true : Boolean(data.isActive)
        },
        select: FOLDER_SELECT
    });
};

const updateFolder = async(id, data) => {
    assertNoUnsupportedFields(data, ['name', 'description', 'isActive']);
    await getFolder(id);

    const updateData = {};
    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        updateData.name = normalizeRequiredString(data.name, 'Название папки');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) {
        updateData.description = normalizeOptionalString(data.description);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isActive')) {
        updateData.isActive = Boolean(data.isActive);
        if (!updateData.isActive) {
            const defaultsUsingFolder = await prisma.productSettings.count({
                where: { defaultFolderId: id }
            });
            if (defaultsUsingFolder > 0) {
                throw createServiceDeskError(
                    'Нельзя отключить папку, пока она выбрана папкой по умолчанию в настройках продукта.',
                    'SERVICEDESK_DELETE_BLOCKED',
                    { blockers: { productSettings: defaultsUsingFolder } }
                );
            }
        }
    }
    if (Object.keys(updateData).length === 0) {
        throw createServiceDeskError('Нет данных для обновления папки.', 'SERVICEDESK_INVALID');
    }

    return prisma.ticketFolder.update({ where: { id }, data: updateData, select: FOLDER_SELECT });
};

const deleteFolder = async(id, options = {}) => {
    const folder = await getFolder(id);
    const automationRules = await prisma.automationRule.count({
        where: {
            OR: [
                { conditionFolderId: id },
                { actionSetFolderId: id }
            ]
        }
    });
    const blockers = {
        tasks: folder._count.tasks,
        types: folder._count.types,
        subtypes: folder._count.subtypes,
        teams: folder._count.teams,
        teamAccesses: folder._count.teamAccesses,
        slaPolicies: folder._count.slaPolicies,
        productSettings: folder._count.productSettings,
        automationRules
    };
    const detachRelations = options.mode === 'detach';
    if (Object.values(blockers).some((count) => count > 0) && !detachRelations) {
        throw createServiceDeskError(
            'Нельзя удалить папку, пока к ней привязаны заявки, типы, подтипы, команды, доступы команд, SLA policy, настройки продукта или automation rules.',
            'SERVICEDESK_DELETE_BLOCKED',
            { blockers }
        );
    }
    if (detachRelations) {
        await prisma.$transaction(async(tx) => {
            await tx.productSettings.updateMany({ where: { defaultFolderId: id }, data: { defaultFolderId: null } });
            await tx.task.updateMany({ where: { folderId: id }, data: { folderId: null } });
            await tx.ticketType.updateMany({ where: { folderId: id }, data: { folderId: null } });
            await tx.ticketSubtype.updateMany({ where: { folderId: id }, data: { folderId: null } });
            await tx.supportTeam.updateMany({ where: { folderId: id }, data: { folderId: null } });
            await tx.supportTeamFolder.deleteMany({ where: { folderId: id } });
            await tx.slaPolicy.updateMany({ where: { folderId: id }, data: { folderId: null } });
            await tx.automationRule.updateMany({ where: { conditionFolderId: id }, data: { conditionFolderId: null } });
            await tx.automationRule.updateMany({ where: { actionSetFolderId: id }, data: { actionSetFolderId: null } });
            await tx.ticketFolder.delete({ where: { id } });
        });
    } else {
        await prisma.ticketFolder.delete({ where: { id } });
    }
    return {
        message: detachRelations
            ? 'Папка удалена. Заявки и правила сохранены без этой привязки.'
            : 'Папка заявки удалена.',
        detached: detachRelations,
        affected: detachRelations ? blockers : undefined
    };
};

const listEntities = () => prisma.ticketEntity.findMany({
    select: ENTITY_SELECT,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
});

const listActiveEntities = () => prisma.ticketEntity.findMany({
    where: { isActive: true },
    select: ENTITY_SELECT,
    orderBy: { name: 'asc' }
});

const createEntity = async(data) => {
    assertNoUnsupportedFields(data, ['name', 'code', 'description', 'isActive']);
    return prisma.ticketEntity.create({
        data: {
            name: normalizeRequiredString(data.name, 'Название сущности'),
            code: normalizeOptionalCode(data.code),
            description: normalizeOptionalString(data.description),
            isActive: data.isActive === undefined ? true : Boolean(data.isActive)
        },
        select: ENTITY_SELECT
    });
};

const updateEntity = async(id, data) => {
    assertNoUnsupportedFields(data, ['name', 'code', 'description', 'isActive']);
    await getEntity(id);

    const updateData = {};
    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        updateData.name = normalizeRequiredString(data.name, 'Название сущности');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'code')) {
        updateData.code = normalizeOptionalCode(data.code);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) {
        updateData.description = normalizeOptionalString(data.description);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isActive')) {
        updateData.isActive = Boolean(data.isActive);
    }
    if (Object.keys(updateData).length === 0) {
        throw createServiceDeskError('Нет данных для обновления сущности.', 'SERVICEDESK_INVALID');
    }

    return prisma.ticketEntity.update({ where: { id }, data: updateData, select: ENTITY_SELECT });
};

const deleteEntity = async(id, options = {}) => {
    const entity = await getEntity(id);
    const automationRules = await prisma.automationRule.count({
        where: {
            OR: [
                { conditionEntityId: id },
                { actionSetEntityId: id }
            ]
        }
    });
    const blockers = {
        tasks: entity._count.tasks,
        types: entity._count.types,
        automationRules
    };
    const detachRelations = options.mode === 'detach';
    if (Object.values(blockers).some((count) => count > 0) && !detachRelations) {
        throw createServiceDeskError(
            'Нельзя удалить сущность, пока к ней привязаны заявки, типы или automation rules.',
            'SERVICEDESK_DELETE_BLOCKED',
            { blockers }
        );
    }
    if (detachRelations) {
        await prisma.$transaction(async(tx) => {
            await tx.task.updateMany({ where: { entityId: id }, data: { entityId: null } });
            await tx.ticketType.updateMany({ where: { entityId: id }, data: { entityId: null } });
            await tx.automationRule.updateMany({ where: { conditionEntityId: id }, data: { conditionEntityId: null } });
            await tx.automationRule.updateMany({ where: { actionSetEntityId: id }, data: { actionSetEntityId: null } });
            await tx.ticketEntity.delete({ where: { id } });
        });
    } else {
        await prisma.ticketEntity.delete({ where: { id } });
    }
    return {
        message: detachRelations
            ? 'Категория удалена. Заявки и типы сохранены без этой привязки.'
            : 'Сущность заявки удалена.',
        detached: detachRelations,
        affected: detachRelations ? blockers : undefined
    };
};

const listTypes = () => prisma.ticketType.findMany({
    select: TYPE_SELECT,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
});

const listActiveTypes = async(user) => {
    const folderIds = user && isAgentRole(user.role) && !isAdminRole(user.role)
        ? await getAgentAccessibleFolderIds(user.id)
        : null;

    return prisma.ticketType.findMany({
    where: {
        isActive: true,
        ...(folderIds ? {
            OR: [
                { folderId: null },
                { folderId: { in: folderIds } }
            ]
        } : {})
    },
    select: TYPE_SELECT,
    orderBy: { name: 'asc' }
    });
};

const createType = async(data) => {
    assertNoUnsupportedFields(data, ['name', 'code', 'description', 'isActive', 'folderId', 'entityId']);
    const folderId = await resolveActiveFolderId(data.folderId);
    const entityId = await resolveActiveEntityId(data.entityId);

    return prisma.ticketType.create({
        data: {
            name: normalizeRequiredString(data.name, 'Название типа'),
            code: normalizeOptionalCode(data.code),
            description: normalizeOptionalString(data.description),
            isActive: data.isActive === undefined ? true : Boolean(data.isActive),
            folderId,
            entityId
        },
        select: TYPE_SELECT
    });
};

const updateType = async(id, data) => {
    assertNoUnsupportedFields(data, ['name', 'code', 'description', 'isActive', 'folderId', 'entityId']);
    await getType(id);

    const updateData = {};
    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        updateData.name = normalizeRequiredString(data.name, 'Название типа');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'code')) {
        updateData.code = normalizeOptionalCode(data.code);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) {
        updateData.description = normalizeOptionalString(data.description);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isActive')) {
        updateData.isActive = Boolean(data.isActive);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'folderId')) {
        updateData.folderId = await resolveActiveFolderId(data.folderId);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'entityId')) {
        updateData.entityId = await resolveActiveEntityId(data.entityId);
    }
    if (Object.keys(updateData).length === 0) {
        throw createServiceDeskError('Нет данных для обновления типа.', 'SERVICEDESK_INVALID');
    }

    return prisma.ticketType.update({ where: { id }, data: updateData, select: TYPE_SELECT });
};

const deleteType = async(id, options = {}) => {
    const type = await getType(id);
    const automationRules = await prisma.automationRule.count({
        where: {
            OR: [
                { conditionTypeId: id },
                { actionSetTypeId: id }
            ]
        }
    });
    const blockers = {
        tasks: type._count.tasks,
        subtypes: type._count.subtypes,
        slaPolicies: type._count.slaPolicies,
        automationRules
    };
    const detachRelations = options.mode === 'detach';
    if (Object.values(blockers).some((count) => count > 0) && !detachRelations) {
        throw createServiceDeskError(
            'Нельзя удалить тип, пока к нему привязаны заявки, подтипы, SLA policy или automation rules.',
            'SERVICEDESK_DELETE_BLOCKED',
            { blockers }
        );
    }
    if (detachRelations) {
        await prisma.$transaction(async(tx) => {
            const subtypeIds = (await tx.ticketSubtype.findMany({
                where: { typeId: id },
                select: { id: true }
            })).map((subtype) => subtype.id);
            const subtypeFilter = subtypeIds.length > 0 ? { in: subtypeIds } : { in: ['__none__'] };
            await tx.task.updateMany({
                where: { OR: [{ typeId: id }, { subtypeId: subtypeFilter }] },
                data: { typeId: null, subtypeId: null }
            });
            await tx.slaPolicy.updateMany({
                where: { OR: [{ typeId: id }, { subtypeId: subtypeFilter }] },
                data: { typeId: null, subtypeId: null }
            });
            await tx.automationRule.updateMany({ where: { conditionTypeId: id }, data: { conditionTypeId: null } });
            await tx.automationRule.updateMany({ where: { actionSetTypeId: id }, data: { actionSetTypeId: null } });
            await tx.automationRule.updateMany({
                where: { conditionSubtypeId: subtypeFilter },
                data: { conditionSubtypeId: null }
            });
            await tx.automationRule.updateMany({
                where: { actionSetSubtypeId: subtypeFilter },
                data: { actionSetSubtypeId: null }
            });
            await tx.ticketSubtype.deleteMany({ where: { typeId: id } });
            await tx.ticketType.delete({ where: { id } });
        });
    } else {
        await prisma.ticketType.delete({ where: { id } });
    }
    return {
        message: detachRelations
            ? 'Тип и его подтипы удалены. История заявок сохранена.'
            : 'Тип заявки удалён.',
        detached: detachRelations,
        affected: detachRelations ? blockers : undefined
    };
};

const listSubtypes = () => prisma.ticketSubtype.findMany({
    select: SUBTYPE_SELECT,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
});

const listActiveSubtypes = async(user) => {
    const folderIds = user && isAgentRole(user.role) && !isAdminRole(user.role)
        ? await getAgentAccessibleFolderIds(user.id)
        : null;

    return prisma.ticketSubtype.findMany({
    where: {
        isActive: true,
        ...(folderIds ? {
            OR: [
                { folderId: null },
                { folderId: { in: folderIds } }
            ]
        } : {})
    },
    select: SUBTYPE_SELECT,
    orderBy: { name: 'asc' }
    });
};

const createSubtype = async(data) => {
    assertNoUnsupportedFields(data, ['name', 'code', 'description', 'isActive', 'typeId', 'folderId']);
    const typeId = await resolveActiveTypeId(data.typeId);
    if (!typeId) {
        throw createServiceDeskError('Тип заявки обязателен для подтипа.', 'SERVICEDESK_INVALID');
    }
    const folderId = await resolveActiveFolderId(data.folderId);
    await assertSubtypeFolderConsistency(typeId, folderId);

    return prisma.ticketSubtype.create({
        data: {
            name: normalizeRequiredString(data.name, 'Название подтипа'),
            code: normalizeOptionalCode(data.code),
            description: normalizeOptionalString(data.description),
            isActive: data.isActive === undefined ? true : Boolean(data.isActive),
            typeId,
            folderId
        },
        select: SUBTYPE_SELECT
    });
};

const updateSubtype = async(id, data) => {
    assertNoUnsupportedFields(data, ['name', 'code', 'description', 'isActive', 'typeId', 'folderId']);
    const currentSubtype = await getSubtype(id);

    const updateData = {};
    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        updateData.name = normalizeRequiredString(data.name, 'Название подтипа');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'code')) {
        updateData.code = normalizeOptionalCode(data.code);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) {
        updateData.description = normalizeOptionalString(data.description);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isActive')) {
        updateData.isActive = Boolean(data.isActive);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'typeId')) {
        const typeId = await resolveActiveTypeId(data.typeId);
        if (!typeId) {
            throw createServiceDeskError('Тип заявки обязателен для подтипа.', 'SERVICEDESK_INVALID');
        }
        updateData.typeId = typeId;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'folderId')) {
        updateData.folderId = await resolveActiveFolderId(data.folderId);
    }
    if (Object.keys(updateData).length === 0) {
        throw createServiceDeskError('Нет данных для обновления подтипа.', 'SERVICEDESK_INVALID');
    }

    await assertSubtypeFolderConsistency(
        Object.prototype.hasOwnProperty.call(updateData, 'typeId') ? updateData.typeId : currentSubtype.typeId,
        Object.prototype.hasOwnProperty.call(updateData, 'folderId') ? updateData.folderId : currentSubtype.folderId
    );

    return prisma.ticketSubtype.update({ where: { id }, data: updateData, select: SUBTYPE_SELECT });
};

const deleteSubtype = async(id, options = {}) => {
    const subtype = await getSubtype(id);
    const automationRules = await prisma.automationRule.count({
        where: {
            OR: [
                { conditionSubtypeId: id },
                { actionSetSubtypeId: id }
            ]
        }
    });
    const blockers = {
        tasks: subtype._count.tasks,
        slaPolicies: subtype._count.slaPolicies,
        automationRules
    };
    const detachRelations = options.mode === 'detach';
    if (Object.values(blockers).some((count) => count > 0) && !detachRelations) {
        throw createServiceDeskError(
            'Нельзя удалить подтип, пока к нему привязаны заявки, SLA policy или automation rules.',
            'SERVICEDESK_DELETE_BLOCKED',
            { blockers }
        );
    }
    if (detachRelations) {
        await prisma.$transaction(async(tx) => {
            await tx.task.updateMany({ where: { subtypeId: id }, data: { subtypeId: null } });
            await tx.slaPolicy.updateMany({ where: { subtypeId: id }, data: { subtypeId: null } });
            await tx.automationRule.updateMany({
                where: { conditionSubtypeId: id },
                data: { conditionSubtypeId: null }
            });
            await tx.automationRule.updateMany({
                where: { actionSetSubtypeId: id },
                data: { actionSetSubtypeId: null }
            });
            await tx.ticketSubtype.delete({ where: { id } });
        });
    } else {
        await prisma.ticketSubtype.delete({ where: { id } });
    }
    return {
        message: detachRelations
            ? 'Подтип удалён. История заявок сохранена.'
            : 'Подтип заявки удалён.',
        detached: detachRelations,
        affected: detachRelations ? blockers : undefined
    };
};

const listTeams = () => prisma.supportTeam.findMany({
    select: TEAM_SELECT,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
});

const listActiveTeams = async(user) => prisma.supportTeam.findMany({
    where: {
        isActive: true,
        ...(user && isAgentRole(user.role) && !isAdminRole(user.role)
            ? {
                members: {
                    some: {
                        userId: user.id
                    }
                }
            }
            : {})
    },
    select: TEAM_SELECT,
    orderBy: { name: 'asc' }
});

const resolveTeamFolderAccess = async(data, db = prisma) => {
    const folderIdsFromArray = normalizeFolderIdsInput(data.folderIds);
    const legacyFolderId = Object.prototype.hasOwnProperty.call(data, 'folderId')
        ? await resolveActiveFolderId(data.folderId, db)
        : undefined;

    if (folderIdsFromArray === undefined && legacyFolderId === undefined) {
        return { provided: false };
    }

    const resolvedFolderIds = [];

    if (legacyFolderId) {
        resolvedFolderIds.push(legacyFolderId);
    }

    if (Array.isArray(folderIdsFromArray)) {
        for (const folderId of folderIdsFromArray) {
            const resolvedFolderId = await resolveActiveFolderId(folderId, db, { allowNull: false });
            if (!resolvedFolderIds.includes(resolvedFolderId)) {
                resolvedFolderIds.push(resolvedFolderId);
            }
        }
    }

    return {
        provided: true,
        folderIds: resolvedFolderIds,
        primaryFolderId: resolvedFolderIds[0] || null
    };
};

const syncTeamFolderAccess = async(teamId, folderIds, db = prisma) => {
    await db.supportTeamFolder.deleteMany({
        where: { teamId }
    });

    if (folderIds.length > 0) {
        await db.supportTeamFolder.createMany({
            data: folderIds.map((folderId) => ({
                teamId,
                folderId
            })),
            skipDuplicates: true
        });
    }
};

const createTeam = async(data) => {
    assertNoUnsupportedFields(data, ['name', 'description', 'isActive', 'folderId', 'folderIds']);
    const folderAccess = await resolveTeamFolderAccess(data);

    return prisma.$transaction(async(tx) => {
        const team = await tx.supportTeam.create({
            data: {
                name: normalizeRequiredString(data.name, 'Название команды'),
                description: normalizeOptionalString(data.description),
                isActive: data.isActive === undefined ? true : Boolean(data.isActive),
                folderId: folderAccess.provided ? folderAccess.primaryFolderId : null
            },
            select: { id: true }
        });

        if (folderAccess.provided) {
            await syncTeamFolderAccess(team.id, folderAccess.folderIds, tx);
        }

        return getTeam(team.id, tx);
    });
};

const updateTeam = async(id, data) => {
    assertNoUnsupportedFields(data, ['name', 'description', 'isActive', 'folderId', 'folderIds']);
    await getTeam(id);
    const folderAccess = await resolveTeamFolderAccess(data);

    const updateData = {};
    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        updateData.name = normalizeRequiredString(data.name, 'Название команды');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) {
        updateData.description = normalizeOptionalString(data.description);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isActive')) {
        updateData.isActive = Boolean(data.isActive);
    }
    if (folderAccess.provided) {
        updateData.folderId = folderAccess.primaryFolderId;
    }
    if (Object.keys(updateData).length === 0 && !folderAccess.provided) {
        throw createServiceDeskError('Нет данных для обновления команды.', 'SERVICEDESK_INVALID');
    }

    return prisma.$transaction(async(tx) => {
        if (Object.keys(updateData).length > 0) {
            await tx.supportTeam.update({ where: { id }, data: updateData });
        }

        if (folderAccess.provided) {
            await syncTeamFolderAccess(id, folderAccess.folderIds, tx);
        }

        return getTeam(id, tx);
    });
};

const deleteTeam = async(id) => {
    const team = await getTeam(id);
    if (team._count.members > 0) {
        throw createServiceDeskError(
            'Нельзя удалить команду, пока в ней есть участники.',
            'SERVICEDESK_DELETE_BLOCKED',
            { blockers: { members: team._count.members } }
        );
    }
    await prisma.supportTeam.delete({ where: { id } });
    return { message: 'Команда исполнителей удалена.' };
};

const listTeamMembers = async(teamId) => {
    await getTeam(teamId);
    return prisma.supportTeamMember.findMany({
        where: { teamId },
        select: TEAM_MEMBER_SELECT,
        orderBy: [
            { isLead: 'desc' },
            { createdAt: 'asc' }
        ]
    });
};

const createTeamMember = async(teamId, data) => {
    assertNoUnsupportedFields(data, ['userId', 'role', 'isLead']);
    await getTeam(teamId);

    const userId = normalizeRequiredString(data.userId, 'Пользователь');
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true }
    });
    if (!user) {
        throw createServiceDeskError('Пользователь для команды не найден.', 'SERVICEDESK_NOT_FOUND');
    }
    if (!user.isActive) {
        throw createServiceDeskError('Нельзя добавить в команду отключённого пользователя.', 'SERVICEDESK_INVALID');
    }
    if (!isAdminRole(user.role) && !isAgentRole(user.role)) {
        throw createServiceDeskError(
            'В команду исполнителей можно добавить только администратора или исполнителя.',
            'SERVICEDESK_INVALID'
        );
    }

    return prisma.supportTeamMember.create({
        data: {
            teamId,
            userId,
            role: normalizeOptionalString(data.role),
            isLead: data.isLead === undefined ? false : Boolean(data.isLead)
        },
        select: TEAM_MEMBER_SELECT
    });
};

const updateTeamMember = async(id, data) => {
    assertNoUnsupportedFields(data, ['role', 'isLead']);
    const member = await prisma.supportTeamMember.findUnique({ where: { id }, select: { id: true } });
    if (!member) {
        throw createServiceDeskError('Участник команды не найден.', 'SERVICEDESK_NOT_FOUND');
    }

    const updateData = {};
    if (Object.prototype.hasOwnProperty.call(data, 'role')) {
        updateData.role = normalizeOptionalString(data.role);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'isLead')) {
        updateData.isLead = Boolean(data.isLead);
    }
    if (Object.keys(updateData).length === 0) {
        throw createServiceDeskError('Нет данных для обновления участника команды.', 'SERVICEDESK_INVALID');
    }

    return prisma.supportTeamMember.update({ where: { id }, data: updateData, select: TEAM_MEMBER_SELECT });
};

const deleteTeamMember = async(id) => {
    const member = await prisma.supportTeamMember.findUnique({ where: { id }, select: { id: true } });
    if (!member) {
        throw createServiceDeskError('Участник команды не найден.', 'SERVICEDESK_NOT_FOUND');
    }
    await prisma.supportTeamMember.delete({ where: { id } });
    return { message: 'Участник команды удалён.' };
};

const mapUniqueConstraintMessage = (error) => {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : '';
    if (target.includes('name')) return 'Запись с таким названием уже существует.';
    if (target.includes('code')) return 'Запись с таким кодом уже существует.';
    if (target.includes('teamId') && target.includes('userId')) return 'Пользователь уже состоит в этой команде.';
    return 'Такая запись уже существует.';
};

module.exports = {
    FOLDER_SELECT,
    ENTITY_SELECT,
    TYPE_SELECT,
    SUBTYPE_SELECT,
    TEAM_SELECT,
    TEAM_MEMBER_SELECT,
    createServiceDeskError,
    mapUniqueConstraintMessage,
    resolveActiveFolderId,
    resolveActiveEntityId,
    resolveActiveTypeId,
    listFolders,
    listActiveFolders,
    listAvailableFoldersForUser,
    createFolder,
    updateFolder,
    deleteFolder,
    listEntities,
    listActiveEntities,
    createEntity,
    updateEntity,
    deleteEntity,
    listTypes,
    listActiveTypes,
    createType,
    updateType,
    deleteType,
    listSubtypes,
    listActiveSubtypes,
    createSubtype,
    updateSubtype,
    deleteSubtype,
    listTeams,
    listActiveTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    listTeamMembers,
    createTeamMember,
    updateTeamMember,
    deleteTeamMember
};
