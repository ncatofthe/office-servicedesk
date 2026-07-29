const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'departments admin smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('admin can create, rename, deactivate and safely delete departments', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const adminUser = await createTestUser(prisma, {
            email: `departments-admin-${runId}@example.com`,
            password,
            name: 'Departments Admin',
            role: 'ADMIN'
        });

        const managerUser = await createTestUser(prisma, {
            email: `departments-manager-${runId}@example.com`,
            password,
            name: 'Departments Manager',
            role: 'MANAGER'
        });

        let createdDepartmentId = null;
        let usedDepartmentId = null;
        let usedTaskId = null;

        t.after(async() => {
            if (usedTaskId) {
                await prisma.task.deleteMany({
                    where: { id: usedTaskId }
                });
            }
            if (usedDepartmentId) {
                await prisma.userDepartment.deleteMany({
                    where: { departmentId: usedDepartmentId }
                });
            }
            await prisma.department.deleteMany({
                where: {
                    id: {
                        in: [createdDepartmentId, usedDepartmentId].filter(Boolean)
                    }
                }
            });
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [adminUser.id, managerUser.id]
                    }
                }
            });
        });

        const adminToken = (await loginUser(app, {
            email: adminUser.email,
            password
        })).body.token;

        const createResponse = await request(app)
            .post('/api/departments')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: `Operations ${runId}` })
            .expect(201);

        createdDepartmentId = createResponse.body.id;

        assert.equal(createResponse.body.name, `Operations ${runId}`);
        assert.equal(createResponse.body.isActive, true);
        assert.equal(createResponse.body.canDelete, true);

        const manageListResponse = await request(app)
            .get('/api/departments/admin')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        const createdDepartmentFromList = manageListResponse.body.find((department) => department.id === createdDepartmentId);
        assert.ok(createdDepartmentFromList);
        assert.equal(createdDepartmentFromList.name, `Operations ${runId}`);

        const renameResponse = await request(app)
            .patch(`/api/departments/${createdDepartmentId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: `Operations Updated ${runId}` })
            .expect(200);

        assert.equal(renameResponse.body.name, `Operations Updated ${runId}`);
        assert.equal(renameResponse.body.isActive, true);

        const deactivateResponse = await request(app)
            .patch(`/api/departments/${createdDepartmentId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ isActive: false })
            .expect(200);

        assert.equal(deactivateResponse.body.isActive, false);

        const usedDepartment = await prisma.department.create({
            data: {
                name: `Used Department ${runId}`,
                headUserId: managerUser.id
            }
        });
        usedDepartmentId = usedDepartment.id;

        await prisma.userDepartment.create({
            data: {
                userId: managerUser.id,
                departmentId: usedDepartment.id,
                isPrimary: true
            }
        });

        const usedTask = await prisma.task.create({
            data: {
                title: `Department task ${runId}`,
                authorId: adminUser.id,
                departmentId: usedDepartment.id
            }
        });
        usedTaskId = usedTask.id;

        const blockedDeleteResponse = await request(app)
            .delete(`/api/departments/${usedDepartment.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(409);

        assert.match(blockedDeleteResponse.body.error, /Нельзя удалить отдел/);
        assert.equal(blockedDeleteResponse.body.blockers.memberships, 1);
        assert.equal(blockedDeleteResponse.body.blockers.tasks, 1);
        assert.equal(blockedDeleteResponse.body.blockers.headUser, 1);

        const deleteResponse = await request(app)
            .delete(`/api/departments/${createdDepartmentId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        assert.equal(deleteResponse.body.message, 'Отдел удалён.');

        const deletedDepartment = await prisma.department.findUnique({
            where: { id: createdDepartmentId }
        });
        assert.equal(deletedDepartment, null);
    });
}
