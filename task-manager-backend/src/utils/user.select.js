const {
    USER_DEPARTMENT_MEMBERSHIP_SELECT
} = require('./department-membership.js');

const USER_NAME_SELECT = {
    id: true,
    name: true,
    avatar: true
};

const USER_NAME_ROLE_SELECT = {
    id: true,
    name: true,
    avatar: true,
    role: true
};

const USER_PUBLIC_SELECT = {
    id: true,
    name: true,
    avatar: true,
    email: true,
    role: true,
    isActive: true,
    tokenVersion: true,
    position: true,
    department: true,
    createdAt: true,
    updatedAt: true
};

const USER_PUBLIC_WITH_DEPARTMENTS_SELECT = {
    ...USER_PUBLIC_SELECT,
    departmentMemberships: {
        select: USER_DEPARTMENT_MEMBERSHIP_SELECT,
        orderBy: [
            { isPrimary: 'desc' },
            { createdAt: 'asc' }
        ]
    }
};

const USER_CURRENT_WITH_DEPARTMENTS_SELECT = {
    ...USER_PUBLIC_WITH_DEPARTMENTS_SELECT,
    skills: true
};

module.exports = {
    USER_NAME_SELECT,
    USER_NAME_ROLE_SELECT,
    USER_PUBLIC_SELECT,
    USER_PUBLIC_WITH_DEPARTMENTS_SELECT,
    USER_CURRENT_WITH_DEPARTMENTS_SELECT
};
