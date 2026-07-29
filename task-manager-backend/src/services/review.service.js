const prisma = require('../prisma/prisma.js');
const notificationService = require('./notification.service.js');
const ledgerService = require('./ledger.service.js');
const taskService = require('./task.service.js');
const { USER_NAME_ROLE_SELECT, USER_PUBLIC_SELECT } = require('../utils/user.select.js');
const { isAdminRole, isAgentRole } = require('../utils/roles.js');
const REVIEW_UPDATE_INCLUDE = {
    reviewer: {
        select: USER_NAME_ROLE_SELECT
    },
    task: {
        include: {
            author: {
                select: USER_PUBLIC_SELECT
            },
            assignees: {
                include: {
                    user: {
                        select: USER_NAME_ROLE_SELECT
                    }
                }
            },
            _count: {
                select: {
                    comments: true,
                    assignees: true
                }
            }
        }
    }
};

const getReviews = async(user) => {
    const where = { status: 'REVIEW' };

    // For non-admin/manager, only show tasks they have access to
    if (!isAdminRole(user.role) && !isAgentRole(user.role)) {
        where.OR = [
            { authorId: user.id },
            { assignees: { some: { userId: user.id } } }
        ];
    }

    const tasks = await prisma.task.findMany({
        where,
        include: {
            author: {
                select: {
                    id: true,
                    name: true,
                    role: true
                }
            },
            assignees: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            role: true
                        }
                    }
                }
            },
            reviews: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    return tasks.map(task => {
        const firstAssignee = task.assignees[0];
        const firstReview = task.reviews[0];
        return {
            id: task.id,
            reviewId: firstReview ? firstReview.id : null,
            title: task.title,
            employee: firstAssignee ? firstAssignee.user : task.author,
            role: firstAssignee ? firstAssignee.user.role : task.author.role,
            date: task.createdAt,
            status: firstReview ? firstReview.status : 'PENDING',
            amount: firstReview ? firstReview.amount : null,
            comment: firstReview ? firstReview.comment : null
        };
    });
};

const updateReview = async(id, data, reviewer) => {
    const { status, amount, comment } = data;
    const reviewerId = reviewer.id;
    const normalizedComment = typeof comment === 'string' ? comment.trim() : '';

    // Validate status
    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
        throw new Error('Invalid review status');
    }

    const hasAmount = amount !== undefined && amount !== null && amount !== '';
    if (status !== 'APPROVED' && hasAmount) {
        throw new Error('Amount is allowed only for APPROVED status');
    }
    if (status === 'REJECTED' && !normalizedComment) {
        throw new Error('Rejected review requires comment');
    }

    const normalizedAmount = hasAmount ? ledgerService.assertNonNegativeAmount(amount) : null;

    const review = await prisma.$transaction(async(tx) => {
        // First get current review state
        const currentReview = await tx.taskReview.findUnique({
            where: { id }
        });
        if (!currentReview) {
            throw new Error('Review not found');
        }

        if (!isAdminRole(reviewer.role) && !isAgentRole(reviewer.role)) {
            await taskService.getById(currentReview.taskId, reviewer);
        }

        // Block if already processed - prevent duplicate payments
        if (currentReview.status === 'APPROVED' || currentReview.status === 'REJECTED') {
            throw new Error('Review already processed, cannot update');
        }

        const updatedReview = await tx.taskReview.update({
            where: { id },
            data: {
                status,
                amount: status === 'APPROVED' ? normalizedAmount : null,
                comment: normalizedComment || null,
                reviewerId
            },
            include: REVIEW_UPDATE_INCLUDE
        });

        const task = updatedReview.task;

        if (status === 'APPROVED') {
            await tx.task.update({
                where: { id: task.id },
                data: { status: 'DONE' }
            });

            // Create transaction for employee account (first assignee or author)
            const firstAssignee = task.assignees[0];
            const assigneeId = firstAssignee ? firstAssignee.userId : task.authorId;
            if (normalizedAmount > 0) {
                await ledgerService.createTaskPayment(tx, {
                    recipientUserId: assigneeId,
                    taskId: task.id,
                    taskTitle: task.title,
                    amount: normalizedAmount,
                    reviewId: id
                });
            }
        } else if (status === 'REJECTED') {
            await tx.task.update({
                where: { id: task.id },
                data: { status: 'REWORK' }
            });
        }

        return tx.taskReview.findUnique({
            where: { id: updatedReview.id },
            include: REVIEW_UPDATE_INCLUDE
        });
    });

    const task = review.task;

    if (status === 'APPROVED') {
        // Notify author and assignees
        const notifyIds = [task.authorId].concat(task.assignees.map(function(a) { return a.userId; }));
        const approvalMessage = normalizedAmount > 0
            ? 'Task "' + task.title + '" approved with payment ' + normalizedAmount
            : 'Task "' + task.title + '" approved without payment';
        for (const userId of notifyIds) {
            await notificationService.createNotification(
                userId,
                'task_approved',
                approvalMessage,
                task.id
            );
        }
    } else if (status === 'REJECTED') {
        // Notify author and assignees
        const notifyIds = [task.authorId].concat(task.assignees.map(function(a) { return a.userId; }));
        const rejectionMessage = normalizedComment
            ? `Task "${task.title}" returned for rework: ${normalizedComment}`
            : `Task "${task.title}" returned for rework.`;
        for (const userId of notifyIds) {
            await notificationService.createNotification(
                userId,
                'task_rejected',
                rejectionMessage,
                task.id
            );
        }
    }

    return review;
};

module.exports = {
    getReviews,
    updateReview
};
