const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'employee task status smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('assigned agent can move NEW -> IN_PROGRESS -> DONE, another agent with folder access can continue work, requester cannot change status', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const authorAgent = await createTestUser(prisma, {
            email: `task-status-author-${runId}@example.com`,
            password,
            name: 'Task Status Author Agent',
            role: 'AGENT'
        });
        const assignedEmployee = await createTestUser(prisma, {
            email: `task-status-assigned-${runId}@example.com`,
            password,
            name: 'Assigned Agent',
            role: 'AGENT'
        });
        const queueAgent = await createTestUser(prisma, {
            email: `task-status-other-${runId}@example.com`,
            password,
            name: 'Queue Agent',
            role: 'AGENT'
        });
        const requester = await createTestUser(prisma, {
            email: `task-status-requester-${runId}@example.com`,
            password,
            name: 'Queue Requester',
            role: 'REQUESTER'
        });
        const queueFolder = await prisma.ticketFolder.create({
            data: {
                name: `Task status folder ${runId}`,
                description: 'Папка для проверки очереди AGENT'
            }
        });
        const queueTeam = await prisma.supportTeam.create({
            data: {
                name: `Task status team ${runId}`,
                folderId: queueFolder.id
            }
        });
        await prisma.supportTeamFolder.create({
            data: {
                teamId: queueTeam.id,
                folderId: queueFolder.id
            }
        });
        await prisma.supportTeamMember.createMany({
            data: [
                { teamId: queueTeam.id, userId: authorAgent.id, role: 'Автор' },
                { teamId: queueTeam.id, userId: queueAgent.id, role: 'Исполнитель' }
            ],
            skipDuplicates: true
        });

        const authorLogin = await loginUser(app, { email: authorAgent.email, password });
        const assignedEmployeeLogin = await loginUser(app, { email: assignedEmployee.email, password });
        const queueAgentLogin = await loginUser(app, { email: queueAgent.email, password });
        const requesterLogin = await loginUser(app, { email: requester.email, password });

        const createdTask = await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${authorLogin.body.token}`)
            .send({
                title: `Employee status task ${runId}`,
                folderId: queueFolder.id
            })
            .expect(201);

        await request(app)
            .post(`/api/tasks/${createdTask.body.id}/assignees`)
            .set('Authorization', `Bearer ${authorLogin.body.token}`)
            .send({ userId: assignedEmployee.id })
            .expect(201);

        t.after(async() => {
            await prisma.supportTeamMember.deleteMany({ where: { teamId: queueTeam.id } });
            await prisma.supportTeamFolder.deleteMany({ where: { teamId: queueTeam.id } });
            await prisma.supportTeam.deleteMany({ where: { id: queueTeam.id } });
            await prisma.notification.deleteMany({ where: { taskId: createdTask.body.id } });
            await prisma.taskHistory.deleteMany({ where: { taskId: createdTask.body.id } });
            await prisma.taskReview.deleteMany({ where: { taskId: createdTask.body.id } });
            await prisma.taskAssignee.deleteMany({ where: { taskId: createdTask.body.id } });
            await prisma.task.deleteMany({ where: { id: createdTask.body.id } });
            await prisma.ticketFolder.deleteMany({ where: { id: queueFolder.id } });
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [authorAgent.id, assignedEmployee.id, queueAgent.id, requester.id]
                    }
                }
            });
        });

        await request(app)
            .patch(`/api/tasks/${createdTask.body.id}/status`)
            .set('Authorization', `Bearer ${requesterLogin.body.token}`)
            .send({ status: 'IN_PROGRESS' })
            .expect(403);

        const inProgressResponse = await request(app)
            .patch(`/api/tasks/${createdTask.body.id}/status`)
            .set('Authorization', `Bearer ${assignedEmployeeLogin.body.token}`)
            .send({ status: 'IN_PROGRESS' })
            .expect(200);

        assert.equal(inProgressResponse.body.status, 'IN_PROGRESS');

        const queueAgentResponse = await request(app)
            .patch(`/api/tasks/${createdTask.body.id}/status`)
            .set('Authorization', `Bearer ${queueAgentLogin.body.token}`)
            .send({ status: 'DONE' })
            .expect(200);

        assert.equal(queueAgentResponse.body.status, 'DONE');

        const persistedTask = await prisma.task.findUnique({
            where: { id: createdTask.body.id }
        });
        assert.equal(persistedTask.status, 'DONE');
    });
}
