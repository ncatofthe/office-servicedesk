const prisma = require('../prisma/prisma.js');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { uploadsDir } = require('../middlewares/upload.middleware.js');
const { resolveStoredAttachmentFilename } = require('../utils/attachment.utils.js');
const {
    USER_PUBLIC_WITH_DEPARTMENTS_SELECT,
    USER_CURRENT_WITH_DEPARTMENTS_SELECT
} = require('../utils/user.select.js');
const {
    syncUserPrimaryDepartmentMembership
} = require('../utils/department-membership.js');
const {
    serializeUserProfile,
    serializeTeamUsers,
    serializeUpdateUserProfileResponse,
    serializeUpdateUserRoleResponse
} = require('../serializers/user.serializer.js');
const {
    PRODUCT_USER_ROLES,
    canManageUsers,
    canReadUsers
} = require('../utils/roles.js');

const ALLOWED_PROFILE_FIELDS = ['name', 'email', 'password', 'position', 'department', 'skills'];
const ALLOWED_ROLE_VALUES = PRODUCT_USER_ROLES;
const USER_DELETION_HARD_BLOCKER_LABELS = {
    selfDelete: 'текущая учётная запись администратора',
    headedDepartments: 'руководимые отделы',
    account: 'финансовый счёт',
    taskTransactions: 'финансовые операции по задачам'
};

const hasOwnProperty = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const hasUserDeletionCounts = (counts) => Object.values(counts).some((count) => count > 0);

const formatUserDeletionError = (blockers) => {
    const activeLabels = Object.entries(blockers)
        .filter(([, count]) => count > 0)
        .map(([key]) => USER_DELETION_HARD_BLOCKER_LABELS[key])
        .filter(Boolean);

    if (activeLabels.length === 0) {
        return 'Нельзя удалить пользователя, пока с ним связаны критичные бизнес-данные.';
    }

    return `Нельзя удалить пользователя автоматически, пока с ним связаны критичные бизнес-данные: ${activeLabels.join(', ')}.`;
};

const deleteStoredFileIfPresent = (storedPath) => {
    const filename = resolveStoredAttachmentFilename(storedPath);
    const absolutePath = filename ? path.join(uploadsDir, filename) : null;

    if (!absolutePath || !fs.existsSync(absolutePath)) {
        return;
    }

    try {
        fs.unlinkSync(absolutePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[users] Failed to delete attachment file during user cleanup', {
                storedPath,
                absolutePath,
                error: error.message
            });
        }
    }
};

const buildUserDeletionSnapshot = async(userId, db = prisma) => {
    const authoredTasks = await db.task.findMany({
        where: { authorId: userId },
        select: { id: true }
    });
    const authoredTaskIds = authoredTasks.map((task) => task.id);

    const [
        headedDepartments,
        account,
        taskAssignments,
        comments,
        attachments,
        reviews,
        history,
        taskTransactions
    ] = await Promise.all([
        db.department.count({ where: { headUserId: userId } }),
        db.account.count({ where: { userId } }),
        db.taskAssignee.count({ where: { userId } }),
        db.taskComment.count({ where: { authorId: userId } }),
        db.taskAttachment.count({ where: { uploadedById: userId } }),
        db.taskReview.count({ where: { reviewerId: userId } }),
        db.taskHistory.count({ where: { userId } }),
        authoredTaskIds.length > 0
            ? db.transaction.count({
                where: {
                    taskId: { in: authoredTaskIds }
                }
            })
            : 0
    ]);

    return {
        authoredTaskIds,
        hardBlockers: {
            headedDepartments,
            account,
            taskTransactions
        },
        taskCleanup: {
            authoredTasks: authoredTaskIds.length,
            taskAssignments,
            comments,
            attachments,
            reviews,
            history
        }
    };
};

const cleanupUserTaskDomainData = async(userId, authoredTaskIds, db = prisma) => {
    const attachmentConditions = [{ uploadedById: userId }];
    if (authoredTaskIds.length > 0) {
        attachmentConditions.push({ taskId: { in: authoredTaskIds } });
    }

    const attachmentsToDelete = await db.taskAttachment.findMany({
        where: { OR: attachmentConditions },
        select: {
            id: true,
            path: true
        }
    });
    const attachmentIds = attachmentsToDelete.map((attachment) => attachment.id);
    const attachmentPaths = [...new Set(attachmentsToDelete.map((attachment) => attachment.path).filter(Boolean))];

    await db.$transaction(async(tx) => {
        if (authoredTaskIds.length > 0) {
            await tx.notification.deleteMany({
                where: {
                    taskId: { in: authoredTaskIds }
                }
            });
        }

        await tx.taskHistory.deleteMany({
            where: authoredTaskIds.length > 0
                ? {
                    OR: [
                        { userId },
                        { taskId: { in: authoredTaskIds } }
                    ]
                }
                : { userId }
        });

        await tx.taskReview.deleteMany({
            where: authoredTaskIds.length > 0
                ? {
                    OR: [
                        { reviewerId: userId },
                        { taskId: { in: authoredTaskIds } }
                    ]
                }
                : { reviewerId: userId }
        });

        if (attachmentIds.length > 0) {
            await tx.taskAttachment.deleteMany({
                where: {
                    id: { in: attachmentIds }
                }
            });
        }

        await tx.taskComment.deleteMany({
            where: authoredTaskIds.length > 0
                ? {
                    OR: [
                        { authorId: userId },
                        { taskId: { in: authoredTaskIds } }
                    ]
                }
                : { authorId: userId }
        });

        await tx.taskAssignee.deleteMany({
            where: authoredTaskIds.length > 0
                ? {
                    OR: [
                        { userId },
                        { taskId: { in: authoredTaskIds } }
                    ]
                }
                : { userId }
        });

        if (authoredTaskIds.length > 0) {
            await tx.task.deleteMany({
                where: {
                    id: { in: authoredTaskIds }
                }
            });
        }

        await tx.user.delete({
            where: { id: userId }
        });
    });

    attachmentPaths.forEach(deleteStoredFileIfPresent);
};

const getAll = async(req, res) => {
    try {
        const { role, search } = req.query;
        const where = {};

        if (role) {
            where.role = role;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        const users = await prisma.user.findMany({
            where,
            select: {
                ...USER_CURRENT_WITH_DEPARTMENTS_SELECT,
                _count: {
                    select: {
                        assignees: {
                            where: {
                                task: { status: 'DONE' }
                            }
                        },
                        tasks: {
                            where: { status: { in: ['IN_PROGRESS', 'REWORK'] } }
                        }
                    }
                }
            },
        });

        // Добавляем вычисляемые агрегированные показатели
        const usersWithStats = users.map(({ _count, ...user }) => ({
            ...user,
            doneTasks: _count.assignees,
            inProgressTasks: _count.tasks,
            // Deterministic estimate, avoids random values on each request.
            totalHours: _count.assignees * 8 + _count.tasks * 4
        }));

        res.json(serializeTeamUsers(usersWithStats));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getById = async(req, res) => {
    try {
        const { id } = req.params;

        if (req.user.id !== id && !canReadUsers(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const user = await prisma.user.findUnique({
            where: { id },
            select: USER_CURRENT_WITH_DEPARTMENTS_SELECT,
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(serializeUserProfile(user));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateProfile = async(req, res) => {
    try {
        const { id } = req.params;
        const runtimeValidated = Boolean(
            req.sharedRuntimeValidated && req.sharedRuntimeValidated.updateUserProfileRequestRuntimeSchema
        );
        const rawPayload = runtimeValidated
            ? (req.sharedRuntimeOriginalBodies && req.sharedRuntimeOriginalBodies.updateUserProfileRequestRuntimeSchema) || {}
            : (req.body || {});

        if (req.user.id !== id && !canManageUsers(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const payloadKeys = Object.keys(rawPayload);
        const invalidFields = payloadKeys.filter((field) => !ALLOWED_PROFILE_FIELDS.includes(field));
        if (invalidFields.length > 0) {
            return res.status(400).json({
                error: `Unsupported fields: ${invalidFields.join(', ')}`
            });
        }

        const data = {};

        for (const field of['name', 'email', 'position', 'department']) {
            if (hasOwnProperty(req.body, field)) {
                data[field] = req.body[field];
            }
        }

        if (hasOwnProperty(req.body, 'skills')) {
            if (req.body.skills !== null && !Array.isArray(req.body.skills)) {
                return res.status(400).json({ error: 'skills must be an array or null' });
            }
            data.skills = req.body.skills;
        }

        if (hasOwnProperty(req.body, 'password')) {
            if (!req.body.password || String(req.body.password).trim().length < 10) {
                return res.status(400).json({ error: 'Пароль должен содержать минимум 10 символов.' });
            }
            data.password = await bcrypt.hash(req.body.password, 12);
            data.tokenVersion = { increment: 1 };
        }

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        await prisma.user.update({
            where: { id },
            data,
        });

        if (hasOwnProperty(req.body, 'department')) {
            await syncUserPrimaryDepartmentMembership(prisma, id, req.body.department);
        }

        const user = await prisma.user.findUnique({
            where: { id },
            select: USER_CURRENT_WITH_DEPARTMENTS_SELECT
        });

        res.json(serializeUpdateUserProfileResponse(user));
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: error.message });
    }
};

const updateAccessStatus = async(req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (req.user.id === id && isActive === false) {
            return res.status(409).json({ error: 'Нельзя отключить собственную учётную запись.' });
        }

        const existingUser = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true, isActive: true }
        });
        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (existingUser.role === 'ADMIN' && existingUser.isActive && isActive === false) {
            const activeAdminCount = await prisma.user.count({
                where: { role: 'ADMIN', isActive: true }
            });
            if (activeAdminCount <= 1) {
                return res.status(409).json({ error: 'Нельзя отключить последнего активного администратора.' });
            }
        }

        const user = await prisma.user.update({
            where: { id },
            data: {
                isActive,
                tokenVersion: { increment: 1 }
            },
            select: USER_CURRENT_WITH_DEPARTMENTS_SELECT
        });

        res.json({
            message: isActive ? 'Доступ пользователя включён.' : 'Доступ пользователя отключён.',
            user: serializeUserProfile(user)
        });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(500).json({ error: 'Не удалось изменить доступ пользователя.' });
    }
};

const resetPassword = async(req, res) => {
    try {
        const { id } = req.params;
        const password = String(req.body?.password || '');
        const user = await prisma.user.update({
            where: { id },
            data: {
                password: await bcrypt.hash(password, 12),
                tokenVersion: { increment: 1 }
            },
            select: USER_CURRENT_WITH_DEPARTMENTS_SELECT
        });
        res.json({
            message: req.user.id === id
                ? 'Пароль администратора изменён. Текущая сессия отозвана.'
                : 'Пароль пользователя изменён. Все его активные сессии отозваны.',
            user: serializeUserProfile(user)
        });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'User not found' });
        res.status(500).json({ error: 'Не удалось изменить пароль пользователя.' });
    }
};

const updateRole = async(req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body || {};
        const runtimeValidated = Boolean(
            req.sharedRuntimeValidated && req.sharedRuntimeValidated.updateUserRoleRequestRuntimeSchema
        );

        // Keep the local enum check only as a fallback when the shared
        // runtime schema is not active yet.
        if (!runtimeValidated && (!role || !ALLOWED_ROLE_VALUES.includes(role))) {
            return res.status(400).json({
                error: `Role must be one of: ${ALLOWED_ROLE_VALUES.join(', ')}`
            });
        }

        await prisma.user.update({
            where: { id },
            data: { role }
        });

        const user = await prisma.user.findUnique({
            where: { id },
            select: USER_PUBLIC_WITH_DEPARTMENTS_SELECT
        });

        res.json(serializeUpdateUserRoleResponse(user));
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(500).json({ error: error.message });
    }
};

const deleteUser = async(req, res) => {
    try {
        const { id } = req.params;

        if (!canManageUsers(req.user.role)) {
            return res.status(403).json({ error: 'Only ADMIN can delete users' });
        }

        if (req.user.id === id) {
            return res.status(409).json({
                error: 'Нельзя удалить текущую учётную запись администратора.',
                blockers: { selfDelete: 1 }
            });
        }

        const existingUser = await prisma.user.findUnique({
            where: { id },
            select: { id: true }
        });

        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (req.query.mode === 'archive') {
            await prisma.$transaction(async(tx) => {
                await tx.department.updateMany({
                    where: { headUserId: id },
                    data: { headUserId: null }
                });
                await tx.userDepartment.deleteMany({ where: { userId: id } });
                await tx.supportTeamMember.deleteMany({ where: { userId: id } });
                await tx.taskAssignee.deleteMany({ where: { userId: id } });
                await tx.taskCloseApproval.deleteMany({ where: { userId: id } });
                await tx.user.update({
                    where: { id },
                    data: {
                        isActive: false,
                        department: null,
                        tokenVersion: { increment: 1 }
                    }
                });
            });

            return res.json({
                message: 'Сотрудник удалён из структуры компании. История заявок и переписки сохранена.',
                archived: true
            });
        }

        const deletionSnapshot = await buildUserDeletionSnapshot(id);
        const hardBlockers = deletionSnapshot.hardBlockers;
        const taskCleanup = deletionSnapshot.taskCleanup;

        if (hasUserDeletionCounts(hardBlockers)) {
            return res.status(409).json({
                error: formatUserDeletionError(hardBlockers),
                blockers: hardBlockers
            });
        }

        const hasTaskCleanupData = hasUserDeletionCounts(taskCleanup);

        if (hasTaskCleanupData) {
            await cleanupUserTaskDomainData(id, deletionSnapshot.authoredTaskIds);
            return res.json({
                message: 'Пользователь удалён вместе со связанными данными по задачам.'
            });
        }

        await prisma.user.delete({
            where: { id }
        });

        res.json({ message: 'Пользователь удалён.' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'User not found' });
        }

        if (error.code === 'P2003' || error.code === 'P2014') {
            return res.status(409).json({
                error: 'Нельзя удалить пользователя автоматически, пока с ним связаны критичные бизнес-данные.'
            });
        }

        console.error('Failed to delete user', error);
        res.status(500).json({ error: 'Не удалось удалить пользователя' });
    }
};

module.exports = {
    getAll,
    getById: getById,
    updateProfile,
    updateRole,
    updateAccessStatus,
    resetPassword,
    delete: deleteUser,
};
