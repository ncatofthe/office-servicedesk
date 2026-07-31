const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'task folder permissions smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('folder/team permissions gate queue visibility, update and assignee actions for agents', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const admin = await createTestUser(prisma, {
            email: `folder-perm-admin-${runId}@example.com`,
            password,
            name: 'Folder Admin',
            role: 'ADMIN'
        });
        const teamAgent = await createTestUser(prisma, {
            email: `folder-perm-team-agent-${runId}@example.com`,
            password,
            name: 'Folder Team Agent',
            role: 'AGENT'
        });
        const assignedAgent = await createTestUser(prisma, {
            email: `folder-perm-assigned-agent-${runId}@example.com`,
            password,
            name: 'Folder Assigned Agent',
            role: 'AGENT'
        });
        const strangerAgent = await createTestUser(prisma, {
            email: `folder-perm-stranger-agent-${runId}@example.com`,
            password,
            name: 'Folder Stranger Agent',
            role: 'AGENT'
        });
        const requester = await createTestUser(prisma, {
            email: `folder-perm-requester-${runId}@example.com`,
            password,
            name: 'Folder Requester',
            role: 'REQUESTER'
        });

        const visibleFolder = await prisma.ticketFolder.create({
            data: {
                name: `Visible folder ${runId}`
            }
        });
        const hiddenFolder = await prisma.ticketFolder.create({
            data: {
                name: `Hidden folder ${runId}`
            }
        });
        const team = await prisma.supportTeam.create({
            data: {
                name: `Visible team ${runId}`,
                folderId: visibleFolder.id
            }
        });
        await prisma.supportTeamFolder.create({
            data: {
                teamId: team.id,
                folderId: visibleFolder.id
            }
        });
        await prisma.supportTeamMember.create({
            data: {
                teamId: team.id,
                userId: teamAgent.id,
                role: 'Исполнитель',
                isLead: true
            }
        });

        const visibleTask = await prisma.task.create({
            data: {
                title: `Visible task ${runId}`,
                description: 'Task in visible folder',
                folderId: visibleFolder.id,
                authorId: requester.id
            }
        });
        const assignedOutsideTask = await prisma.task.create({
            data: {
                title: `Assigned outside task ${runId}`,
                description: 'Task outside folder access but assigned to specific agent',
                folderId: hiddenFolder.id,
                authorId: requester.id
            }
        });
        const unroutedTask = await prisma.task.create({
            data: {
                title: `Unrouted task ${runId}`,
                description: 'Web-created task without folder must remain visible to agents.',
                folderId: null,
                authorId: requester.id
            }
        });

        await prisma.taskAssignee.create({
            data: {
                taskId: assignedOutsideTask.id,
                userId: assignedAgent.id
            }
        });

        t.after(async() => {
            await prisma.notification.deleteMany({
                where: {
                    taskId: { in: [visibleTask.id, assignedOutsideTask.id, unroutedTask.id] }
                }
            });
            await prisma.taskHistory.deleteMany({
                where: {
                    taskId: { in: [visibleTask.id, assignedOutsideTask.id, unroutedTask.id] }
                }
            });
            await prisma.taskAssignee.deleteMany({
                where: {
                    taskId: { in: [visibleTask.id, assignedOutsideTask.id, unroutedTask.id] }
                }
            });
            await prisma.task.deleteMany({
                where: {
                    id: { in: [visibleTask.id, assignedOutsideTask.id, unroutedTask.id] }
                }
            });
            await prisma.supportTeamMember.deleteMany({ where: { teamId: team.id } });
            await prisma.supportTeamFolder.deleteMany({ where: { teamId: team.id } });
            await prisma.supportTeam.deleteMany({ where: { id: team.id } });
            await prisma.ticketFolder.deleteMany({
                where: { id: { in: [visibleFolder.id, hiddenFolder.id] } }
            });
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [admin.id, teamAgent.id, assignedAgent.id, strangerAgent.id, requester.id]
                    }
                }
            });
        });

        const tokens = {
            admin: (await loginUser(app, { email: admin.email, password })).body.token,
            teamAgent: (await loginUser(app, { email: teamAgent.email, password })).body.token,
            assignedAgent: (await loginUser(app, { email: assignedAgent.email, password })).body.token,
            strangerAgent: (await loginUser(app, { email: strangerAgent.email, password })).body.token
        };

        const teamAgentList = await request(app)
            .get('/api/tasks')
            .set('Authorization', `Bearer ${tokens.teamAgent}`)
            .expect(200);
        const teamAgentVisibleIds = teamAgentList.body.tasks.map((task) => task.id);
        assert.ok(teamAgentVisibleIds.includes(visibleTask.id));
        assert.ok(teamAgentVisibleIds.includes(unroutedTask.id));
        assert.ok(!teamAgentVisibleIds.includes(assignedOutsideTask.id));

        const assignedAgentList = await request(app)
            .get('/api/tasks')
            .set('Authorization', `Bearer ${tokens.assignedAgent}`)
            .expect(200);
        const assignedVisibleIds = assignedAgentList.body.tasks.map((task) => task.id);
        assert.ok(assignedVisibleIds.includes(unroutedTask.id));
        assert.ok(!assignedVisibleIds.includes(visibleTask.id));
        assert.ok(assignedVisibleIds.includes(assignedOutsideTask.id));

        const strangerAgentList = await request(app)
            .get('/api/tasks')
            .set('Authorization', `Bearer ${tokens.strangerAgent}`)
            .expect(200);
        const strangerVisibleIds = strangerAgentList.body.tasks.map((task) => task.id);
        assert.ok(strangerVisibleIds.includes(unroutedTask.id));

        await request(app)
            .patch(`/api/tasks/${visibleTask.id}/status`)
            .set('Authorization', `Bearer ${tokens.strangerAgent}`)
            .send({ status: 'IN_PROGRESS' })
            .expect(403);

        await request(app)
            .post(`/api/tasks/${visibleTask.id}/assignees`)
            .set('Authorization', `Bearer ${tokens.teamAgent}`)
            .send({ userId: teamAgent.id })
            .expect(201);

        await request(app)
            .post(`/api/tasks/${visibleTask.id}/assignees`)
            .set('Authorization', `Bearer ${tokens.strangerAgent}`)
            .send({ userId: strangerAgent.id })
            .expect(403);

        const teamAgentStatus = await request(app)
            .patch(`/api/tasks/${visibleTask.id}/status`)
            .set('Authorization', `Bearer ${tokens.teamAgent}`)
            .send({ status: 'IN_PROGRESS' })
            .expect(200);
        assert.equal(teamAgentStatus.body.status, 'IN_PROGRESS');

        await request(app)
            .put(`/api/tasks/${assignedOutsideTask.id}`)
            .set('Authorization', `Bearer ${tokens.assignedAgent}`)
            .send({ description: 'Updated by assigned agent outside folder scope' })
            .expect(403);

        await request(app)
            .post(`/api/tasks/${assignedOutsideTask.id}/assignees`)
            .set('Authorization', `Bearer ${tokens.assignedAgent}`)
            .send({ userId: teamAgent.id })
            .expect(403);

        const strangerClaimUnrouted = await request(app)
            .post(`/api/tasks/${unroutedTask.id}/assignees`)
            .set('Authorization', `Bearer ${tokens.strangerAgent}`)
            .send({ userId: strangerAgent.id })
            .expect(201);
        assert.equal(strangerClaimUnrouted.body.userId, strangerAgent.id);

        const assignedAgentStatus = await request(app)
            .patch(`/api/tasks/${assignedOutsideTask.id}/status`)
            .set('Authorization', `Bearer ${tokens.assignedAgent}`)
            .send({ status: 'IN_PROGRESS' })
            .expect(200);
        assert.equal(assignedAgentStatus.body.status, 'IN_PROGRESS');

        const adminAssign = await request(app)
            .post(`/api/tasks/${assignedOutsideTask.id}/assignees`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .send({ userId: teamAgent.id })
            .expect(201);
        assert.equal(adminAssign.body.userId, teamAgent.id);
    });
}
