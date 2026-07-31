const prisma = require('../prisma/prisma.js');
const { normalizeDepartmentName } = require('../utils/department-membership.js');

const DEPARTMENT_LIST_SELECT = {
    id: true,
    name: true,
    code: true,
    isActive: true
};
const DEPARTMENT_MANAGED_SELECT = {
    ...DEPARTMENT_LIST_SELECT,
    headUserId: true,
    headUser: {
        select: {
            id: true,
            name: true
        }
    },
    memberships: {
        select: {
            isPrimary: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true,
                    avatar: true
                }
            }
        },
        orderBy: [
            { isPrimary: 'desc' },
            { user: { name: 'asc' } }
        ]
    },
    _count: {
        select: {
            memberships: true,
            tasks: true
        }
    }
};

const createDepartmentError = (message, code, extra = {}) => {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, extra);
    return error;
};

const buildLegacyDepartmentUsageMap = async(db = prisma) => {
    const users = await db.user.findMany({
        where: {
            department: {
                not: null
            }
        },
        select: {
            department: true
        }
    });

    const usageMap = new Map();
    for (const user of users) {
        const normalizedName = normalizeDepartmentName(user.department);
        if (!normalizedName) {
            continue;
        }

        usageMap.set(normalizedName, (usageMap.get(normalizedName) || 0) + 1);
    }

    return usageMap;
};

const getLegacyDepartmentUserIds = async(departmentName, db = prisma) => {
    const normalizedName = normalizeDepartmentName(departmentName);
    if (!normalizedName) {
        return [];
    }

    const users = await db.user.findMany({
        where: {
            department: {
                not: null
            }
        },
        select: {
            id: true,
            department: true
        }
    });

    return users
        .filter((user) => normalizeDepartmentName(user.department) === normalizedName)
        .map((user) => user.id);
};

const mapManagedDepartment = (department, legacyUserCount = 0) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    isActive: department.isActive,
    headUser: department.headUser
        ? {
            id: department.headUser.id,
            name: department.headUser.name
        }
        : null,
    membershipCount: Number(department._count?.memberships || 0),
    taskCount: Number(department._count?.tasks || 0),
    legacyUserCount: Number(legacyUserCount || 0),
    members: Array.isArray(department.memberships)
        ? department.memberships.map((membership) => ({
            id: membership.user.id,
            name: membership.user.name,
            email: membership.user.email,
            role: membership.user.role,
            isActive: membership.user.isActive,
            avatar: membership.user.avatar,
            isPrimary: Boolean(membership.isPrimary)
        }))
        : [],
    canDelete: !department.headUserId
        && Number(department._count?.memberships || 0) === 0
        && Number(department._count?.tasks || 0) === 0
        && Number(legacyUserCount || 0) === 0
});

const formatDepartmentDeleteError = (blockers) => {
    const labels = [];

    if (blockers.memberships > 0) {
        labels.push(`сотрудники в отделе (${blockers.memberships})`);
    }
    if (blockers.tasks > 0) {
        labels.push(`задачи отдела (${blockers.tasks})`);
    }
    if (blockers.legacyUsers > 0) {
        labels.push(`профили сотрудников с legacy-отделом (${blockers.legacyUsers})`);
    }
    if (blockers.headUser > 0) {
        labels.push('назначенный руководитель отдела');
    }

    if (labels.length === 0) {
        return 'Нельзя удалить отдел, пока он используется в системе.';
    }

    return `Нельзя удалить отдел, пока он используется в системе: ${labels.join(', ')}.`;
};

const getActiveDepartments = async() => {
    return prisma.department.findMany({
        where: {
            isActive: true
        },
        select: DEPARTMENT_LIST_SELECT,
        orderBy: {
            name: 'asc'
        }
    });
};

const getManagedDepartments = async(db = prisma) => {
    const [departments, legacyUsageMap] = await Promise.all([
        db.department.findMany({
            select: DEPARTMENT_MANAGED_SELECT,
            orderBy: [
                { isActive: 'desc' },
                { name: 'asc' }
            ]
        }),
        buildLegacyDepartmentUsageMap(db)
    ]);

    return departments.map((department) =>
        mapManagedDepartment(
            department,
            legacyUsageMap.get(normalizeDepartmentName(department.name)) || 0
        )
    );
};

const createDepartment = async(data, db = prisma) => {
    const normalizedName = normalizeDepartmentName(data && data.name);

    if (!normalizedName) {
        throw createDepartmentError('Название отдела обязательно.', 'DEPARTMENT_INVALID');
    }

    const createdDepartment = await db.department.create({
        data: {
            name: normalizedName
        },
        select: DEPARTMENT_MANAGED_SELECT
    });

    return mapManagedDepartment(createdDepartment, 0);
};

const updateDepartment = async(id, data, db = prisma) => {
    const existingDepartment = await db.department.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            isActive: true
        }
    });

    if (!existingDepartment) {
        throw createDepartmentError('Department not found', 'DEPARTMENT_NOT_FOUND');
    }

    const updateData = {};
    let legacyUserIds = [];

    if (Object.prototype.hasOwnProperty.call(data || {}, 'name')) {
        const normalizedName = normalizeDepartmentName(data.name);
        if (!normalizedName) {
            throw createDepartmentError('Название отдела обязательно.', 'DEPARTMENT_INVALID');
        }

        if (normalizedName !== existingDepartment.name) {
            updateData.name = normalizedName;
            legacyUserIds = await getLegacyDepartmentUserIds(existingDepartment.name, db);
        }
    }

    if (Object.prototype.hasOwnProperty.call(data || {}, 'isActive')) {
        if (typeof data.isActive !== 'boolean') {
            throw createDepartmentError('Некорректное значение статуса отдела.', 'DEPARTMENT_INVALID');
        }
        updateData.isActive = data.isActive;
    }

    if (Object.keys(updateData).length === 0) {
        throw createDepartmentError('Нет данных для обновления отдела.', 'DEPARTMENT_INVALID');
    }

    const updatedDepartment = await db.$transaction(async(tx) => {
        const department = await tx.department.update({
            where: { id },
            data: updateData,
            select: DEPARTMENT_MANAGED_SELECT
        });

        if (updateData.name && legacyUserIds.length > 0) {
            await tx.user.updateMany({
                where: {
                    id: {
                        in: legacyUserIds
                    }
                },
                data: {
                    department: updateData.name
                }
            });
        }

        return department;
    });

    const legacyUserCount = updateData.name
        ? legacyUserIds.length
        : (await getLegacyDepartmentUserIds(updatedDepartment.name, db)).length;

    return mapManagedDepartment(updatedDepartment, legacyUserCount);
};

const removeDepartmentMember = async(departmentId, userId, db = prisma) => {
    const [department, user] = await Promise.all([
        db.department.findUnique({
            where: { id: departmentId },
            select: { id: true, name: true, headUserId: true }
        }),
        db.user.findUnique({
            where: { id: userId },
            select: { id: true, department: true }
        })
    ]);

    if (!department) {
        throw createDepartmentError('Department not found', 'DEPARTMENT_NOT_FOUND');
    }
    if (!user) {
        throw createDepartmentError('User not found', 'DEPARTMENT_MEMBER_NOT_FOUND');
    }

    const membership = await db.userDepartment.findUnique({
        where: {
            userId_departmentId: {
                userId,
                departmentId
            }
        },
        select: { id: true, isPrimary: true }
    });
    const hasLegacyLink = normalizeDepartmentName(user.department) === normalizeDepartmentName(department.name);

    if (!membership && !hasLegacyLink && department.headUserId !== userId) {
        throw createDepartmentError('User is not a member of this department', 'DEPARTMENT_MEMBER_NOT_FOUND');
    }

    const primaryDepartment = await db.$transaction(async(tx) => {
        if (department.headUserId === userId) {
            await tx.department.update({
                where: { id: departmentId },
                data: { headUserId: null }
            });
        }

        if (membership) {
            await tx.userDepartment.delete({ where: { id: membership.id } });
        }

        let replacementDepartment = null;
        if (membership?.isPrimary || hasLegacyLink) {
            const replacementMembership = await tx.userDepartment.findFirst({
                where: { userId },
                orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                select: {
                    id: true,
                    department: { select: { name: true } }
                }
            });

            if (replacementMembership) {
                await tx.userDepartment.updateMany({
                    where: { userId },
                    data: { isPrimary: false }
                });
                await tx.userDepartment.update({
                    where: { id: replacementMembership.id },
                    data: { isPrimary: true }
                });
                replacementDepartment = replacementMembership.department.name;
            }

            await tx.user.update({
                where: { id: userId },
                data: { department: replacementDepartment }
            });
        }

        return replacementDepartment;
    });

    return {
        message: 'Сотрудник удалён из отдела.',
        userId,
        departmentId,
        primaryDepartment
    };
};

const deleteDepartment = async(id, db = prisma, options = {}) => {
    const department = await db.department.findUnique({
        where: { id },
        select: DEPARTMENT_MANAGED_SELECT
    });

    if (!department) {
        throw createDepartmentError('Department not found', 'DEPARTMENT_NOT_FOUND');
    }

    const blockers = {
        memberships: Number(department._count?.memberships || 0),
        tasks: Number(department._count?.tasks || 0),
        legacyUsers: (await getLegacyDepartmentUserIds(department.name, db)).length,
        headUser: department.headUserId ? 1 : 0
    };

    const hasBlockers = Object.values(blockers).some((count) => count > 0);
    const detachRelations = options.mode === 'detach';
    if (hasBlockers && !detachRelations) {
        throw createDepartmentError(
            formatDepartmentDeleteError(blockers),
            'DEPARTMENT_DELETE_BLOCKED',
            { blockers }
        );
    }

    if (detachRelations) {
        const legacyUserIds = await getLegacyDepartmentUserIds(department.name, db);
        await db.$transaction(async(tx) => {
            await tx.department.update({ where: { id }, data: { headUserId: null } });
            await tx.userDepartment.deleteMany({ where: { departmentId: id } });
            await tx.task.updateMany({ where: { departmentId: id }, data: { departmentId: null } });
            if (legacyUserIds.length > 0) {
                await tx.user.updateMany({
                    where: { id: { in: legacyUserIds } },
                    data: { department: null }
                });
            }
            await tx.department.delete({ where: { id } });
        });
    } else {
        await db.department.delete({ where: { id } });
    }

    return {
        message: detachRelations
            ? 'Отдел удалён. Сотрудники и заявки сохранены без привязки к отделу.'
            : 'Отдел удалён.',
        detached: detachRelations,
        affected: detachRelations ? blockers : undefined
    };
};

module.exports = {
    DEPARTMENT_LIST_SELECT,
    DEPARTMENT_MANAGED_SELECT,
    getActiveDepartments,
    getManagedDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    removeDepartmentMember
};
