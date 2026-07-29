const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'user delete safety smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
        { skip: 'Missing test DATABASE_URL/JWT_SECRET' },
        () => {}
    );
} else {
    const request = require('supertest');
    const app = require('../src/app.js');
    const prisma = require('../src/prisma/prisma.js');
    const { createTestUser, loginUser } = require('../test-support/auth-test-utils.cjs');

    after(async() => {
        await prisma.$disconnect();
    });

    test('user deletion keeps hard blockers safe and cleanup-deletes task-domain demo users', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const adminUser = await createTestUser(prisma, {
            email: `delete-admin-${runId}@example.com`,
            password,
            name: 'Delete Admin',
            role: 'ADMIN'
        });

        const cleanUser = await createTestUser(prisma, {
            email: `delete-clean-${runId}@example.com`,
            password,
            name: 'Delete Clean User',
            role: 'EMPLOYEE'
        });

        const cleanupUser = await createTestUser(prisma, {
            email: `delete-cleanup-${runId}@example.com`,
            password,
            name: 'Delete Cleanup User',
            role: 'EMPLOYEE'
        });

        const taskAssignee = await createTestUser(prisma, {
            email: `delete-assignee-${runId}@example.com`,
            password,
            name: 'Delete Task Assignee',
            role: 'EMPLOYEE'
        });

        const financeBlockedUser = await createTestUser(prisma, {
            email: `delete-finance-blocked-${runId}@example.com`,
            password,
            name: 'Delete Finance Blocked User',
            role: 'EMPLOYEE'
        });

        const departmentBlockedUser = await createTestUser(prisma, {
            email: `delete-department-blocked-${runId}@example.com`,
            password,
            name: 'Delete Department Blocked User',
            role: 'MANAGER'
        });

        const cleanupTask = await prisma.task.create({
            data: {
                title: 'Cleanup delete task',
                description: 'Task-domain data should be removed together with the demo user.',
                authorId: cleanupUser.id
            }
        });

        await prisma.taskAssignee.create({
            data: {
                taskId: cleanupTask.id,
                userId: taskAssignee.id
            }
        });

        const cleanupComment = await prisma.taskComment.create({
            data: {
                taskId: cleanupTask.id,
                authorId: cleanupUser.id,
                content: 'Cleanup comment for deletion safety test.'
            }
        });

        const cleanupAttachment = await prisma.taskAttachment.create({
            data: {
                taskId: cleanupTask.id,
                uploadedById: cleanupUser.id,
                filename: 'cleanup-demo.txt',
                path: '/uploads/cleanup-demo.txt'
            }
        });

        const cleanupReview = await prisma.taskReview.create({
            data: {
                taskId: cleanupTask.id,
                reviewerId: cleanupUser.id,
                status: 'PENDING'
            }
        });

        const cleanupHistory = await prisma.taskHistory.create({
            data: {
                taskId: cleanupTask.id,
                userId: cleanupUser.id,
                field: 'status',
                oldValue: 'NEW',
                newValue: 'IN_PROGRESS'
            }
        });

        const cleanupNotification = await prisma.notification.create({
            data: {
                userId: adminUser.id,
                taskId: cleanupTask.id,
                type: 'task_cleanup_notice',
                title: 'Тестовое уведомление',
                message: 'Cleanup task notification'
            }
        });

        const financeAccount = await prisma.account.create({
            data: {
                userId: financeBlockedUser.id,
                type: 'PERSONAL',
                balance: 150
            }
        });

        const financeTransaction = await prisma.transaction.create({
            data: {
                accountId: financeAccount.id,
                amount: 150,
                type: 'INCOME',
                category: 'demo',
                description: 'Deletion blocker transaction'
            }
        });

        const headedDepartment = await prisma.department.create({
            data: {
                name: `Delete safety department ${runId}`,
                code: `DEL-${runId.slice(-6)}`,
                headUserId: departmentBlockedUser.id
            }
        });

        t.after(async() => {
            await prisma.notification.deleteMany({
                where: {
                    id: cleanupNotification.id
                }
            });
            await prisma.taskHistory.deleteMany({
                where: {
                    id: cleanupHistory.id
                }
            });
            await prisma.taskReview.deleteMany({
                where: {
                    id: cleanupReview.id
                }
            });
            await prisma.taskAttachment.deleteMany({
                where: {
                    id: cleanupAttachment.id
                }
            });
            await prisma.taskComment.deleteMany({
                where: {
                    id: cleanupComment.id
                }
            });
            await prisma.taskAssignee.deleteMany({
                where: {
                    taskId: cleanupTask.id
                }
            });
            await prisma.task.deleteMany({
                where: {
                    id: cleanupTask.id
                }
            });
            await prisma.transaction.deleteMany({
                where: {
                    id: financeTransaction.id
                }
            });
            await prisma.account.deleteMany({
                where: {
                    id: financeAccount.id
                }
            });
            await prisma.department.deleteMany({
                where: {
                    id: headedDepartment.id
                }
            });
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [
                            adminUser.id,
                            cleanUser.id,
                            cleanupUser.id,
                            taskAssignee.id,
                            financeBlockedUser.id,
                            departmentBlockedUser.id
                        ]
                    }
                }
            });
        });

        const adminToken = (await loginUser(app, {
            email: adminUser.email,
            password
        })).body.token;

        const cleanDeleteResponse = await request(app)
            .delete(`/api/users/${cleanUser.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        assert.equal(cleanDeleteResponse.body.message, 'Пользователь удалён.');
        assert.equal(
            await prisma.user.findUnique({
                where: { id: cleanUser.id }
            }),
            null
        );

        const cleanupDeleteResponse = await request(app)
            .delete(`/api/users/${cleanupUser.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        assert.equal(
            cleanupDeleteResponse.body.message,
            'Пользователь удалён вместе со связанными данными по задачам.'
        );
        assert.equal(
            await prisma.user.findUnique({
                where: { id: cleanupUser.id }
            }),
            null
        );
        assert.equal(
            await prisma.task.findUnique({
                where: { id: cleanupTask.id }
            }),
            null
        );
        assert.equal(
            await prisma.taskComment.findUnique({
                where: { id: cleanupComment.id }
            }),
            null
        );
        assert.equal(
            await prisma.taskAttachment.findUnique({
                where: { id: cleanupAttachment.id }
            }),
            null
        );
        assert.equal(
            await prisma.taskReview.findUnique({
                where: { id: cleanupReview.id }
            }),
            null
        );
        assert.equal(
            await prisma.taskHistory.findUnique({
                where: { id: cleanupHistory.id }
            }),
            null
        );
        assert.equal(
            await prisma.notification.findUnique({
                where: { id: cleanupNotification.id }
            }),
            null
        );

        const financeBlockedDeleteResponse = await request(app)
            .delete(`/api/users/${financeBlockedUser.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(409);

        assert.match(financeBlockedDeleteResponse.body.error, /критичные бизнес-данные/);
        assert.match(financeBlockedDeleteResponse.body.error, /финансовый счёт/);
        assert.equal(financeBlockedDeleteResponse.body.blockers.account, 1);

        const departmentBlockedDeleteResponse = await request(app)
            .delete(`/api/users/${departmentBlockedUser.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(409);

        assert.match(departmentBlockedDeleteResponse.body.error, /руководимые отделы/);
        assert.equal(departmentBlockedDeleteResponse.body.blockers.headedDepartments, 1);

        const selfDeleteResponse = await request(app)
            .delete(`/api/users/${adminUser.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(409);

        assert.equal(selfDeleteResponse.body.error, 'Нельзя удалить текущую учётную запись администратора.');
        assert.equal(selfDeleteResponse.body.blockers.selfDelete, 1);
    });
}
