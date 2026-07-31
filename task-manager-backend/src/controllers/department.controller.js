const departmentService = require('../services/department.service.js');

const handleDepartmentError = (error, res) => {
    if (error.code === 'DEPARTMENT_NOT_FOUND') {
        return res.status(404).json({ error: 'Отдел не найден.' });
    }

    if (error.code === 'DEPARTMENT_MEMBER_NOT_FOUND') {
        return res.status(404).json({ error: 'Сотрудник не найден в этом отделе.' });
    }

    if (error.code === 'DEPARTMENT_INVALID') {
        return res.status(400).json({ error: error.message });
    }

    if (error.code === 'DEPARTMENT_DELETE_BLOCKED') {
        return res.status(409).json({
            error: error.message,
            blockers: error.blockers
        });
    }

    if (error.code === 'P2002') {
        return res.status(400).json({ error: 'Отдел с таким названием уже существует.' });
    }

    return res.status(400).json({ error: error.message });
};

const getActiveDepartments = async(req, res) => {
    try {
        const departments = await departmentService.getActiveDepartments();
        res.json(departments);
    } catch (error) {
        handleDepartmentError(error, res);
    }
};

const getManagedDepartments = async(req, res) => {
    try {
        const departments = await departmentService.getManagedDepartments();
        res.json(departments);
    } catch (error) {
        handleDepartmentError(error, res);
    }
};

const createDepartment = async(req, res) => {
    try {
        const department = await departmentService.createDepartment(req.body || {});
        res.status(201).json(department);
    } catch (error) {
        handleDepartmentError(error, res);
    }
};

const updateDepartment = async(req, res) => {
    try {
        const department = await departmentService.updateDepartment(req.params.id, req.body || {});
        res.json(department);
    } catch (error) {
        handleDepartmentError(error, res);
    }
};

const removeDepartmentMember = async(req, res) => {
    try {
        const result = await departmentService.removeDepartmentMember(
            req.params.id,
            req.params.userId
        );
        res.json(result);
    } catch (error) {
        handleDepartmentError(error, res);
    }
};

const deleteDepartment = async(req, res) => {
    try {
        const result = await departmentService.deleteDepartment(
            req.params.id,
            undefined,
            { mode: req.query.mode }
        );
        res.json(result);
    } catch (error) {
        handleDepartmentError(error, res);
    }
};

module.exports = {
    getActiveDepartments,
    getManagedDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    removeDepartmentMember
};
