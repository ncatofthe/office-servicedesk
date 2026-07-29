const {
    resolveUserDepartmentMemberships,
    resolvePrimaryDepartment
} = require('../utils/department-membership.js');

const toIsoString = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const normalizeSkills = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (Array.isArray(value)) {
        return value.map((item) => String(item));
    }
    if (typeof value === 'string') {
        return [value];
    }
    return null;
};

const serializeAuthUser = (user) => {
    if (!user) return null;

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: Object.prototype.hasOwnProperty.call(user, 'isActive') ? user.isActive : true,
        position: Object.prototype.hasOwnProperty.call(user, 'position') ? user.position : undefined,
        department: Object.prototype.hasOwnProperty.call(user, 'department') ? user.department : undefined,
        departmentMemberships: resolveUserDepartmentMemberships(user),
        primaryDepartment: resolvePrimaryDepartment(user)
    };
};

const serializeCurrentUser = (user) => {
    if (!user) return null;

    return {
        ...serializeAuthUser(user),
        skills: normalizeSkills(user.skills),
        createdAt: toIsoString(user.createdAt),
        updatedAt: toIsoString(user.updatedAt)
    };
};

const serializeRegisterResponse = (user) => ({
    message: 'User created successfully',
    user: serializeAuthUser(user)
});

const serializeLoginResponse = (user, token) => ({
    message: 'Login successful',
    token,
    user: serializeAuthUser(user)
});

const serializeGetMeResponse = (user) => ({
    user: serializeCurrentUser(user)
});

module.exports = {
    serializeAuthUser,
    serializeCurrentUser,
    serializeRegisterResponse,
    serializeLoginResponse,
    serializeGetMeResponse
};
