const normalizeDepartmentName = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : null;
};

const DEPARTMENT_PUBLIC_SELECT = {
    id: true,
    name: true,
    code: true,
    headUserId: true,
    isActive: true
};

const USER_DEPARTMENT_MEMBERSHIP_SELECT = {
    id: true,
    userId: true,
    departmentId: true,
    isPrimary: true,
    department: {
        select: DEPARTMENT_PUBLIC_SELECT
    }
};

const mapDepartmentSummary = (department) => {
    if (!department) {
        return null;
    }

    return {
        id: department.id ?? null,
        name: department.name,
        code: Object.prototype.hasOwnProperty.call(department, 'code') ? department.code : undefined,
        headUserId: Object.prototype.hasOwnProperty.call(department, 'headUserId') ? department.headUserId : undefined,
        isActive: Object.prototype.hasOwnProperty.call(department, 'isActive') ? department.isActive : undefined
    };
};

const mapDepartmentMembership = (membership) => {
    if (!membership || !membership.department) {
        return null;
    }

    return {
        id: membership.id ?? null,
        userId: Object.prototype.hasOwnProperty.call(membership, 'userId') ? membership.userId : undefined,
        departmentId: membership.departmentId ?? membership.department.id ?? null,
        isPrimary: Boolean(membership.isPrimary),
        department: mapDepartmentSummary(membership.department)
    };
};

const buildLegacyDepartmentMembership = (user) => {
    const legacyDepartmentName = normalizeDepartmentName(user && user.department);
    if (!legacyDepartmentName) {
        return null;
    }

    return {
        id: null,
        userId: user && Object.prototype.hasOwnProperty.call(user, 'id') ? user.id : undefined,
        departmentId: null,
        isPrimary: true,
        department: {
            id: null,
            name: legacyDepartmentName,
            code: null,
            headUserId: null,
            isActive: true
        }
    };
};

const sortDepartmentMemberships = (memberships) => memberships.sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
    }

    const leftName = left.department && left.department.name ? left.department.name : '';
    const rightName = right.department && right.department.name ? right.department.name : '';
    return leftName.localeCompare(rightName);
});

const resolveUserDepartmentMemberships = (user) => {
    const relationMemberships = Array.isArray(user && user.departmentMemberships)
        ? sortDepartmentMemberships(
            user.departmentMemberships
                .map(mapDepartmentMembership)
                .filter(Boolean)
        )
        : [];

    if (relationMemberships.length > 0) {
        return relationMemberships;
    }

    const legacyMembership = buildLegacyDepartmentMembership(user);
    return legacyMembership ? [legacyMembership] : [];
};

const resolvePrimaryDepartment = (user) => {
    const relationMemberships = Array.isArray(user && user.departmentMemberships)
        ? sortDepartmentMemberships(
            user.departmentMemberships
                .map(mapDepartmentMembership)
                .filter(Boolean)
        )
        : [];

    const primaryMembership = relationMemberships.find((membership) => membership.isPrimary);
    if (primaryMembership) {
        return primaryMembership.department;
    }

    const legacyMembership = buildLegacyDepartmentMembership(user);
    return legacyMembership ? legacyMembership.department : null;
};

const syncUserPrimaryDepartmentMembership = async(db, userId, departmentName) => {
    const normalizedDepartmentName = normalizeDepartmentName(departmentName);

    if (!normalizedDepartmentName) {
        await db.userDepartment.deleteMany({
            where: { userId }
        });
        return null;
    }

    const department = await db.department.upsert({
        where: { name: normalizedDepartmentName },
        update: {
            isActive: true
        },
        create: {
            name: normalizedDepartmentName
        }
    });

    await db.userDepartment.upsert({
        where: {
            userId_departmentId: {
                userId,
                departmentId: department.id
            }
        },
        update: {
            isPrimary: true
        },
        create: {
            userId,
            departmentId: department.id,
            isPrimary: true
        }
    });

    await db.userDepartment.updateMany({
        where: {
            userId,
            NOT: {
                departmentId: department.id
            }
        },
        data: { isPrimary: false }
    });

    return department;
};

const backfillUserDepartmentsFromLegacy = async(db) => {
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

    let syncedUsers = 0;
    for (const user of users) {
        const normalizedDepartmentName = normalizeDepartmentName(user.department);
        if (!normalizedDepartmentName) {
            continue;
        }

        await syncUserPrimaryDepartmentMembership(db, user.id, normalizedDepartmentName);
        syncedUsers += 1;
    }

    return {
        totalUsers: users.length,
        syncedUsers
    };
};

module.exports = {
    DEPARTMENT_PUBLIC_SELECT,
    USER_DEPARTMENT_MEMBERSHIP_SELECT,
    normalizeDepartmentName,
    resolveUserDepartmentMemberships,
    resolvePrimaryDepartment,
    syncUserPrimaryDepartmentMembership,
    backfillUserDepartmentsFromLegacy
};
