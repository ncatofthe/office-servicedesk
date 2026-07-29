const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe, logout, getPublicConfig } = require('../controllers/auth.controller.js');
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const { loginRateLimit, registerRateLimit } = require('../middlewares/rate-limit.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const sharedRuntimeValidate = require('../middlewares/shared-runtime-validate.middleware.js');
const { PRODUCT_USER_ROLES, normalizeRole } = require('../utils/roles.js');
const router = express.Router();

// Validation rules
const registerValidation = [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 10 }).withMessage('Пароль должен содержать минимум 10 символов.'),
];

const adminRegisterValidation = [
    ...registerValidation,
    body('role').optional().custom((value) => PRODUCT_USER_ROLES.includes(normalizeRole(value))).withMessage('Invalid role'),
    body('position').optional().isString().withMessage('position must be a string'),
    body('department').optional().isString().withMessage('department must be a string'),
    body('skills').optional().isArray().withMessage('skills must be an array'),
    body('skills.*').optional().isString().withMessage('skills must contain strings'),
];

const loginValidation = [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
];

// Public registration (creates REQUESTER role only)
router.get('/config', getPublicConfig);
router.post('/register', registerRateLimit, registerValidation, validate, sharedRuntimeValidate('registerRequestRuntimeSchema'), register);

// Admin-only registration for creating users with specific roles
router.post('/register/admin', registerRateLimit, authMiddleware, roleMiddleware(['ADMIN']), adminRegisterValidation, validate, sharedRuntimeValidate('adminRegisterRequestRuntimeSchema'), register);

router.post('/login', loginRateLimit, loginValidation, validate, sharedRuntimeValidate('loginRequestRuntimeSchema'), login);
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

module.exports = router;
