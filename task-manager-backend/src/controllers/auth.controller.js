const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/prisma.js');
const {
    serializeRegisterResponse,
    serializeLoginResponse,
    serializeGetMeResponse
} = require('../serializers/auth.serializer.js');
const {
    syncUserPrimaryDepartmentMembership
} = require('../utils/department-membership.js');
const {
    USER_PUBLIC_WITH_DEPARTMENTS_SELECT,
    USER_CURRENT_WITH_DEPARTMENTS_SELECT
} = require('../utils/user.select.js');
const {
    DEFAULT_ROLE,
    PRODUCT_USER_ROLES,
    isAdminRole,
    normalizeRole
} = require('../utils/roles.js');

const isEnabled = (value, fallback = true) => {
    if (value === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const getPublicConfig = (req, res) => {
    res.json({
        publicRegistrationEnabled: isEnabled(process.env.PUBLIC_REGISTRATION_ENABLED, true)
    });
};

const register = async(req, res) => {
    try {
        const runtimeSchemaName = req.sharedRuntimeValidated && req.sharedRuntimeValidated.adminRegisterRequestRuntimeSchema
            ? 'adminRegisterRequestRuntimeSchema'
            : (req.sharedRuntimeValidated && req.sharedRuntimeValidated.registerRequestRuntimeSchema
                ? 'registerRequestRuntimeSchema'
                : null);
        const rawPayload = runtimeSchemaName
            ? (req.sharedRuntimeOriginalBodies && req.sharedRuntimeOriginalBodies[runtimeSchemaName]) || {}
            : (req.body || {});
        const { name, email, password, position, department, skills } = req.body;
        const requestedRole = Object.prototype.hasOwnProperty.call(rawPayload, 'role') ? rawPayload.role : DEFAULT_ROLE;
        const role = normalizeRole(requestedRole);

        // Public registration only allows REQUESTER role
        // Admin registration (via /register/admin) can set any role
        const isAdminRegistration = req.user && isAdminRole(req.user.role);

        if (!isAdminRegistration && !isEnabled(process.env.PUBLIC_REGISTRATION_ENABLED, true)) {
            return res.status(403).json({
                error: 'Самостоятельная регистрация отключена. Обратитесь к администратору ServiceDesk.'
            });
        }

        if (!isAdminRegistration && role !== 'REQUESTER') {
            return res.status(403).json({ error: 'Публичная регистрация создаёт только роль заявителя. Остальные роли администратор назначает отдельно.' });
        }

        if (isAdminRegistration && !PRODUCT_USER_ROLES.includes(role)) {
            return res.status(400).json({ error: `Role must be one of: ${PRODUCT_USER_ROLES.join(', ')}` });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const userData = {
            name,
            email,
            password: hashedPassword,
            role,
        };

        // Add optional fields if provided
        if (position) userData.position = position;
        if (department) userData.department = department;
        if (skills) userData.skills = Array.isArray(skills) ? skills : [skills];

        const createdUser = await prisma.user.create({
            data: userData,
        });

        if (Object.prototype.hasOwnProperty.call(req.body, 'department')) {
            await syncUserPrimaryDepartmentMembership(prisma, createdUser.id, req.body.department);
        }

        const user = await prisma.user.findUnique({
            where: { id: createdUser.id },
            select: USER_PUBLIC_WITH_DEPARTMENTS_SELECT
        });

        res.status(201).json(serializeRegisterResponse(user));
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: error.message });
    }
};

const login = async(req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user || user.isActive === false || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const responseUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: USER_PUBLIC_WITH_DEPARTMENTS_SELECT
        });

        const token = jwt.sign({
            id: user.id,
            email: user.email,
            role: user.role,
            tokenVersion: Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0
        },
            process.env.JWT_SECRET, { expiresIn: '7d' }
        );

        res.json(serializeLoginResponse(responseUser, token));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getMe = async(req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: USER_CURRENT_WITH_DEPARTMENTS_SELECT,
        });

        res.json(serializeGetMeResponse(user));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const logout = async(req, res) => {
    await prisma.user.update({
        where: { id: req.user.id },
        data: { tokenVersion: { increment: 1 } }
    });
    res.json({ message: 'Logged out successfully' });
};

module.exports = {
    register,
    login,
    getMe,
    logout,
    getPublicConfig,
};
