const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'task read RBAC smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('task read RBAC follows folder/team permissions: agent sees team folders or assigned tasks, requester sees only own tickets', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const adminUser = await createTestUser(prisma, {
            email: `task-read-admin-${runId}@example.com`,
            password,
            name: 'Task Read Admin',
            role: 'ADMIN'
        });
        const agentUser = await createTestUser(prisma, {
            email: `task-read-agent-${runId}@example.com`,
            password,
            name: 'Task Read Agent',
            role: 'AGENT'
        });
        const requesterOwner = await createTestUser(prisma, {
            email: `task-read-requester-owner-${runId}@example.com`,
            password,
            name: 'Task Read Requester Owner',
            role: 'REQUESTER'
        });
        const requesterOther = await createTestUser(prisma, {
            email: `task-read-requester-other-${runId}@example.com`,
            password,
            name: 'Task Read Requester Other',
            role: 'REQUESTER'
        });
        const viewerUser = await createTestUser(prisma, {
            email: `task-read-viewer-${runId}@example.com`,
            password,
            name: 'Task Read Viewer',
            role: 'VIEWER'
        });

        const sharedFolder = await prisma.ticketFolder.create({
            data: {
                name: `RBAC shared folder ${runId}`,
                description: 'Папка для проверки доступа AGENT через команду'
            }
        });
        const privateFolder = await prisma.ticketFolder.create({
            data: {
                name: `RBAC private folder ${runId}`,
                description: 'Папка без доступа у агента'
            }
        });
        const agentTeam = await prisma.supportTeam.create({
            data: {
                name: `RBAC team ${runId}`,
                folderId: sharedFolder.id
            }
        });
        await prisma.supportTeamFolder.create({
            data: {
                teamId: agentTeam.id,
                folderId: sharedFolder.id
            }
        });
        await prisma.supportTeamMember.create({
            data: {
                teamId: agentTeam.id,
                userId: agentUser.id,
                role: 'Исполнитель',
                isLead: true
            }
        });

        const ownerTask = await prisma.task.create({
            data: {
                title: `Requester own task ${runId}`,
                description: 'Owner should always see this task.',
                authorId: requesterOwner.id,
                folderId: sharedFolder.id
            }
        });
        const assignedTask = await prisma.task.create({
            data: {
                title: `Requester assigned task ${runId}`,
                description: 'Agent should see this task because of assignee scope outside team folder.',
                authorId: adminUser.id,
                folderId: privateFolder.id
            }
        });
        const foreignTask = await prisma.task.create({
            data: {
                title: `Requester foreign task ${runId}`,
                description: 'Requester should not see another requester task.',
                authorId: requesterOther.id,
                folderId: privateFolder.id
            }
        });

        await prisma.taskAssignee.create({
            data: {
                taskId: assignedTask.id,
                userId: agentUser.id
            }
        });

        t.after(async() => {
            await prisma.supportTeamMember.deleteMany({
                where: { teamId: agentTeam.id }
            });
            await prisma.supportTeamFolder.deleteMany({
                where: { teamId: agentTeam.id }
            });
            await prisma.supportTeam.deleteMany({
                where: { id: agentTeam.id }
            });
            await prisma.taskAssignee.deleteMany({
                where: {
                    taskId: { in: [ownerTask.id, assignedTask.id, foreignTask.id] }
                }
            });
            await prisma.task.deleteMany({
                where: {
                    id: { in: [ownerTask.id, assignedTask.id, foreignTask.id] }
                }
            });
            await prisma.ticketFolder.deleteMany({
                where: { id: { in: [sharedFolder.id, privateFolder.id] } }
            });
            await prisma.user.deleteMany({
                where: {
                    id: { in: [adminUser.id, agentUser.id, requesterOwner.id, requesterOther.id, viewerUser.id] }
                }
            });
        });

        const loginAndGetToken = async(email) => {
            const response = await loginUser(app, { email, password });
            return response.body.token;
        };

        const tokens = {
            admin: await loginAndGetToken(adminUser.email),
            agent: await loginAndGetToken(agentUser.email),
            requesterOwner: await loginAndGetToken(requesterOwner.email),
            requesterOther: await loginAndGetToken(requesterOther.email),
            viewer: await loginAndGetToken(viewerUser.email)
        };

        const agentListResponse = await request(app)
            .get('/api/tasks')
            .set('Authorization', `Bearer ${tokens.agent}`)
            .expect(200);
        const agentVisibleTaskIds = agentListResponse.body.tasks.map((task) => task.id);
        assert.ok(agentVisibleTaskIds.includes(ownerTask.id));
        assert.ok(agentVisibleTaskIds.includes(assignedTask.id));
        assert.ok(!agentVisibleTaskIds.includes(foreignTask.id));

        const requesterOwnerListResponse = await request(app)
            .get('/api/tasks')
            .set('Authorization', `Bearer ${tokens.requesterOwner}`)
            .expect(200);
        const requesterOwnerVisibleTaskIds = requesterOwnerListResponse.body.tasks.map((task) => task.id);
        assert.ok(requesterOwnerVisibleTaskIds.includes(ownerTask.id));
        assert.ok(!requesterOwnerVisibleTaskIds.includes(assignedTask.id));
        assert.ok(!requesterOwnerVisibleTaskIds.includes(foreignTask.id));

        await request(app)
            .get(`/api/tasks/${foreignTask.id}`)
            .set('Authorization', `Bearer ${tokens.requesterOwner}`)
            .expect(403);

        const requesterOtherListResponse = await request(app)
            .get('/api/tasks')
            .set('Authorization', `Bearer ${tokens.requesterOther}`)
            .expect(200);
        const requesterOtherVisibleTaskIds = requesterOtherListResponse.body.tasks.map((task) => task.id);
        assert.ok(requesterOtherVisibleTaskIds.includes(foreignTask.id));
        assert.ok(!requesterOtherVisibleTaskIds.includes(ownerTask.id));
        assert.ok(!requesterOtherVisibleTaskIds.includes(assignedTask.id));

        const adminResponse = await request(app)
            .get(`/api/tasks/${foreignTask.id}`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .expect(200);
        assert.equal(adminResponse.body.id, foreignTask.id);

        const viewerListResponse = await request(app)
            .get('/api/tasks')
            .set('Authorization', `Bearer ${tokens.viewer}`)
            .expect(200);
        const viewerVisibleTaskIds = viewerListResponse.body.tasks.map((task) => task.id);
        assert.ok(viewerVisibleTaskIds.includes(ownerTask.id));
        assert.ok(viewerVisibleTaskIds.includes(assignedTask.id));
        assert.ok(viewerVisibleTaskIds.includes(foreignTask.id));
    });
}
