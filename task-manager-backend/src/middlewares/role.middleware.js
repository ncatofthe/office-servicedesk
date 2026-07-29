const { normalizeRole } = require('../utils/roles.js');

const roleMiddleware = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No authenticated user' });
        }

        const normalizedUserRole = normalizeRole(req.user.role);
        const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role));

        if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

module.exports = roleMiddleware;
