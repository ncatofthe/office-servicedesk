const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'task department smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('task create accepts departmentId and returns department summary', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const manager = await createTestUser(prisma, {
            email: `task-department-manager-${runId}@example.com`,
            password,
            name: 'Task Department Manager',
            role: 'MANAGER'
        });
        const department = await prisma.department.create({
            data: {
                name: `Department Create ${runId}`,
                code: `CRT${runId.slice(-6)}`
            }
        });
        await prisma.userDepartment.create({
            data: {
                userId: manager.id,
                departmentId: department.id,
                isPrimary: true
            }
        });
        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Task department folder ${runId}`
            }
        });
        const team = await prisma.supportTeam.create({
            data: {
                name: `Task department team ${runId}`
            }
        });
        await prisma.supportTeamFolder.create({
            data: {
                teamId: team.id,
                folderId: folder.id
            }
        });
        await prisma.supportTeamMember.create({
            data: {
                teamId: team.id,
                userId: manager.id,
                role: 'Исполнитель'
            }
        });

        t.after(async() => {
            await prisma.task.deleteMany({
                where: { authorId: manager.id }
            });
            await prisma.supportTeamMember.deleteMany({ where: { teamId: team.id } });
            await prisma.supportTeamFolder.deleteMany({ where: { teamId: team.id } });
            await prisma.supportTeam.deleteMany({ where: { id: team.id } });
            await prisma.ticketFolder.deleteMany({ where: { id: folder.id } });
            await prisma.department.deleteMany({
                where: { id: department.id }
            });
            await prisma.user.deleteMany({
                where: { id: manager.id }
            });
        });

        const token = (await loginUser(app, {
            email: manager.email,
            password
        })).body.token;

        const response = await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: `Task with department ${runId}`,
                departmentId: department.id,
                folderId: folder.id
            })
            .expect(201);

        assert.equal(response.body.departmentId, department.id);
        assert.equal(response.body.department.id, department.id);
        assert.equal(response.body.department.name, department.name);

        const createdTask = await prisma.task.findUnique({
            where: { id: response.body.id }
        });
        assert.equal(createdTask.departmentId, department.id);
    });

    test('task create/read remains compatible without departmentId', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const manager = await createTestUser(prisma, {
            email: `task-nodepartment-manager-${runId}@example.com`,
            password,
            name: 'Task No Department Manager',
            role: 'MANAGER'
        });
        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Task nodepartment folder ${runId}`
            }
        });
        const team = await prisma.supportTeam.create({
            data: {
                name: `Task nodepartment team ${runId}`
            }
        });
        await prisma.supportTeamFolder.create({
            data: {
                teamId: team.id,
                folderId: folder.id
            }
        });
        await prisma.supportTeamMember.create({
            data: {
                teamId: team.id,
                userId: manager.id,
                role: 'Исполнитель'
            }
        });

        t.after(async() => {
            await prisma.task.deleteMany({
                where: { authorId: manager.id }
            });
            await prisma.supportTeamMember.deleteMany({ where: { teamId: team.id } });
            await prisma.supportTeamFolder.deleteMany({ where: { teamId: team.id } });
            await prisma.supportTeam.deleteMany({ where: { id: team.id } });
            await prisma.ticketFolder.deleteMany({ where: { id: folder.id } });
            await prisma.user.deleteMany({
                where: { id: manager.id }
            });
        });

        const token = (await loginUser(app, {
            email: manager.email,
            password
        })).body.token;

        const createResponse = await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: `Task without department ${runId}`,
                folderId: folder.id
            })
            .expect(201);

        assert.equal(createResponse.body.departmentId, null);
        assert.equal(createResponse.body.department, null);

        const readResponse = await request(app)
            .get(`/api/tasks/${createResponse.body.id}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        assert.equal(readResponse.body.departmentId, null);
        assert.equal(readResponse.body.department, null);
    });

    test('task update can assign and clear department', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const manager = await createTestUser(prisma, {
            email: `task-update-department-manager-${runId}@example.com`,
            password,
            name: 'Task Update Department Manager',
            role: 'MANAGER'
        });
        const department = await prisma.department.create({
            data: {
                name: `Department Update ${runId}`,
                code: `UPD${runId.slice(-6)}`
            }
        });
        await prisma.userDepartment.create({
            data: {
                userId: manager.id,
                departmentId: department.id,
                isPrimary: true
            }
        });
        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Task update department folder ${runId}`
            }
        });
        const team = await prisma.supportTeam.create({
            data: {
                name: `Task update department team ${runId}`
            }
        });
        await prisma.supportTeamFolder.create({
            data: {
                teamId: team.id,
                folderId: folder.id
            }
        });
        await prisma.supportTeamMember.create({
            data: {
                teamId: team.id,
                userId: manager.id,
                role: 'Исполнитель'
            }
        });
        const task = await prisma.task.create({
            data: {
                title: `Task update department ${runId}`,
                authorId: manager.id,
                folderId: folder.id
            }
        });

        t.after(async() => {
            await prisma.task.deleteMany({
                where: { id: task.id }
            });
            await prisma.supportTeamMember.deleteMany({ where: { teamId: team.id } });
            await prisma.supportTeamFolder.deleteMany({ where: { teamId: team.id } });
            await prisma.supportTeam.deleteMany({ where: { id: team.id } });
            await prisma.ticketFolder.deleteMany({ where: { id: folder.id } });
            await prisma.department.deleteMany({
                where: { id: department.id }
            });
            await prisma.user.deleteMany({
                where: { id: manager.id }
            });
        });

        const token = (await loginUser(app, {
            email: manager.email,
            password
        })).body.token;

        const assignResponse = await request(app)
            .put(`/api/tasks/${task.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                departmentId: department.id
            })
            .expect(200);

        assert.equal(assignResponse.body.departmentId, department.id);
        assert.equal(assignResponse.body.department.id, department.id);

        const clearResponse = await request(app)
            .put(`/api/tasks/${task.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                departmentId: null
            })
            .expect(200);

        assert.equal(clearResponse.body.departmentId, null);
        assert.equal(clearResponse.body.department, null);

        const updatedTask = await prisma.task.findUnique({
            where: { id: task.id }
        });
        assert.equal(updatedTask.departmentId, null);
    });
}
