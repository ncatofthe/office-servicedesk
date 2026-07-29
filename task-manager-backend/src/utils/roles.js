const USER_ROLES = ['ADMIN', 'AGENT', 'REQUESTER', 'VIEWER'];
const PRODUCT_USER_ROLES = ['ADMIN', 'AGENT', 'REQUESTER', 'VIEWER'];

const LEGACY_ROLE_ALIASES = {
    DIRECTOR: 'AGENT',
    MANAGER: 'AGENT',
    EMPLOYEE: 'AGENT',
    FINANCE: 'AGENT',
    USER: 'REQUESTER'
};

const DEFAULT_ROLE = 'REQUESTER';

const normalizeRole = (role) => {
    if (!role || typeof role !== 'string') {
        return DEFAULT_ROLE;
    }

    return LEGACY_ROLE_ALIASES[role] || role;
};

const isAdminRole = (role) => normalizeRole(role) === 'ADMIN';
const isAgentRole = (role) => normalizeRole(role) === 'AGENT';
const isRequesterRole = (role) => normalizeRole(role) === 'REQUESTER';
const isViewerRole = (role) => normalizeRole(role) === 'VIEWER';

const canManagePortalContent = (role) => isAdminRole(role) || isAgentRole(role);
const canReadAllTickets = (role) => isAdminRole(role) || isAgentRole(role) || isViewerRole(role);
const canCreateTickets = (role) => isAdminRole(role) || isAgentRole(role) || isRequesterRole(role);
const canUpdateTickets = (role) => isAdminRole(role) || isAgentRole(role);
const canReadUsers = (role) => isAdminRole(role) || isAgentRole(role);
const canManageUsers = (role) => isAdminRole(role);
const canReadReports = (role) => isAdminRole(role) || isViewerRole(role);

module.exports = {
    USER_ROLES,
    PRODUCT_USER_ROLES,
    DEFAULT_ROLE,
    normalizeRole,
    isAdminRole,
    isAgentRole,
    isRequesterRole,
    isViewerRole,
    canManagePortalContent,
    canReadAllTickets,
    canCreateTickets,
    canUpdateTickets,
    canReadUsers,
    canManageUsers,
    canReadReports
};
