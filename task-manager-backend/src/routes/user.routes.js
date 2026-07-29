const express = require('express');
const { body } = require('express-validator');
const {
    getAll,
    getById,
    updateProfile,
    updateRole,
    updateAccessStatus,
    resetPassword,
    delete: deleteUser
} = require('../controllers/user.controller.js');
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const sharedRuntimeValidate = require('../middlewares/shared-runtime-validate.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const router = express.Router();

router.get('/', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), getAll);
router.get('/:id', authMiddleware, getById);
router.put(
    '/:id',
    authMiddleware,
    sharedRuntimeValidate('updateUserProfileRequestRuntimeSchema', { errorShape: 'single-error' }),
    updateProfile
);
router.patch(
    '/:id/role',
    authMiddleware,
    roleMiddleware(['ADMIN']),
    sharedRuntimeValidate('updateUserRoleRequestRuntimeSchema', { errorShape: 'single-error' }),
    updateRole
);
router.patch(
    '/:id/password',
    authMiddleware,
    roleMiddleware(['ADMIN']),
    body('password').isString().isLength({ min: 10 }).withMessage('Пароль должен содержать минимум 10 символов.'),
    validate,
    resetPassword
);
router.patch(
    '/:id/status',
    authMiddleware,
    roleMiddleware(['ADMIN']),
    body('isActive').isBoolean().withMessage('isActive должен быть boolean.'),
    validate,
    updateAccessStatus
);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), deleteUser);

module.exports = router;
