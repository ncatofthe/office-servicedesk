const express = require('express');
const { body, param } = require('express-validator');
const authMiddleware = require('../middlewares/auth.middleware.js');
const roleMiddleware = require('../middlewares/role.middleware.js');
const validate = require('../middlewares/validate.middleware.js');
const {
    getActiveDepartments,
    getManagedDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment
} = require('../controllers/department.controller.js');

const router = express.Router();

router.get('/departments/admin', authMiddleware, roleMiddleware(['ADMIN']), getManagedDepartments);
router.get('/departments', authMiddleware, getActiveDepartments);
router.post(
    '/departments',
    authMiddleware,
    roleMiddleware(['ADMIN']),
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Название отдела обязательно'),
    validate,
    createDepartment
);
router.patch(
    '/departments/:id',
    authMiddleware,
    roleMiddleware(['ADMIN']),
    param('id').isString().withMessage('Некорректный идентификатор отдела'),
    body().custom((value) => {
        const payload = value || {};
        const allowedFields = ['name', 'isActive'];
        const invalidFields = Object.keys(payload).filter((field) => !allowedFields.includes(field));
        if (invalidFields.length > 0) {
            throw new Error(`Unsupported fields: ${invalidFields.join(', ')}`);
        }
        return true;
    }),
    body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Название отдела обязательно'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    validate,
    updateDepartment
);
router.delete(
    '/departments/:id',
    authMiddleware,
    roleMiddleware(['ADMIN']),
    param('id').isString().withMessage('Некорректный идентификатор отдела'),
    validate,
    deleteDepartment
);

module.exports = router;
