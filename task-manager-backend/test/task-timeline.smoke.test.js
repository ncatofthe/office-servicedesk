const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'task timeline smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('task timeline records key product events and hides internal events from requester', async(t) => {
        process.env.EMAIL_OUTBOUND_ENABLED = 'false';

        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const admin = await createTestUser(prisma, {
            email: `timeline-admin-${runId}@example.com`,
            password,
            name: 'Timeline Admin',
            role: 'ADMIN'
        });
        const agent = await createTestUser(prisma, {
            email: `timeline-agent-${runId}@example.com`,
            password,
            name: 'Timeline Agent',
            role: 'AGENT'
        });
        const requesterOwner = await createTestUser(prisma, {
            email: `timeline-requester-owner-${runId}@example.com`,
            password,
            name: 'Timeline Requester Owner',
            role: 'REQUESTER'
        });
        const requesterOther = await createTestUser(prisma, {
            email: `timeline-requester-other-${runId}@example.com`,
            password,
            name: 'Timeline Requester Other',
            role: 'REQUESTER'
        });
        const viewer = await createTestUser(prisma, {
            email: `timeline-viewer-${runId}@example.com`,
            password,
            name: 'Timeline Viewer',
            role: 'VIEWER'
        });

        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Timeline folder ${runId}`
            }
        });
        const team = await prisma.supportTeam.create({
            data: {
                name: `Timeline team ${runId}`,
                folderId: folder.id
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
                userId: agent.id,
                role: 'Исполнитель',
                isLead: true
            }
        });

        t.after(async() => {
            await prisma.emailInboundMessage.deleteMany({
                where: {
                    messageId: `timeline-email-${runId}@example.com`
                }
            });
            await prisma.cannedReply.deleteMany({
                where: {
                    title: {
                        contains: runId
                    }
                }
            });
            await prisma.task.deleteMany({
                where: {
                    title: {
                        contains: runId
                    }
                }
            });
            await prisma.supportTeamMember.deleteMany({
                where: { teamId: team.id }
            });
            await prisma.supportTeamFolder.deleteMany({
                where: { teamId: team.id }
            });
            await prisma.supportTeam.deleteMany({
                where: { id: team.id }
            });
            await prisma.ticketFolder.deleteMany({
                where: { id: folder.id }
            });
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [admin.id, agent.id, requesterOwner.id, requesterOther.id, viewer.id]
                    }
                }
            });
        });

        const loginAndGetToken = async(email) => {
            const response = await loginUser(app, { email, password });
            return response.body.token;
        };

        const tokens = {
            admin: await loginAndGetToken(admin.email),
            agent: await loginAndGetToken(agent.email),
            requesterOwner: await loginAndGetToken(requesterOwner.email),
            requesterOther: await loginAndGetToken(requesterOther.email),
            viewer: await loginAndGetToken(viewer.email)
        };

        const template = (await request(app)
            .post('/api/canned-replies')
            .set('Authorization', `Bearer ${tokens.agent}`)
            .send({
                title: `Timeline template ${runId}`,
                body: 'Здравствуйте!\n\nШаблонный ответ для timeline.',
                category: 'Timeline',
                visibility: 'SHARED'
            })
            .expect(201)).body;

        const task = (await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${tokens.requesterOwner}`)
            .send({
                title: `Timeline task ${runId}`,
                description: 'Task for timeline checks',
                folderId: folder.id
            })
            .expect(201)).body;

        await request(app)
            .patch(`/api/tasks/${task.id}/status`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .send({ status: 'IN_PROGRESS' })
            .expect(200);

        await request(app)
            .post(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.requesterOwner}`)
            .send({
                content: 'Публичный комментарий от заявителя.'
            })
            .expect(201);

        await request(app)
            .post(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .send({
                content: 'Внутренняя заметка для исполнителей.',
                visibility: 'INTERNAL'
            })
            .expect(201);

        await request(app)
            .post(`/api/tasks/${task.id}/assignees`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .send({ userId: agent.id })
            .expect(201);

        await request(app)
            .delete(`/api/tasks/${task.id}/assignees/${agent.id}`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .expect(200);

        await request(app)
            .post(`/api/tasks/${task.id}/reply-from-template`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .send({
                templateId: template.id,
                mode: 'COMMENT'
            })
            .expect(201);

        const agentTimeline = (await request(app)
            .get(`/api/tasks/${task.id}/timeline`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .expect(200)).body;

        const agentTypes = agentTimeline.map((event) => event.type);
        assert.ok(agentTypes.includes('TASK_CREATED'));
        assert.ok(agentTypes.includes('STATUS_CHANGED'));
        assert.ok(agentTypes.includes('COMMENT_ADDED'));
        assert.ok(agentTypes.includes('INTERNAL_NOTE_ADDED'));
        assert.ok(agentTypes.includes('ASSIGNEE_ADDED'));
        assert.ok(agentTypes.includes('ASSIGNEE_REMOVED'));
        assert.ok(agentTypes.includes('CANNED_REPLY_USED'));

        const statusEvent = agentTimeline.find((event) => event.type === 'STATUS_CHANGED');
        assert.equal(statusEvent.metadata.fromStatus, 'NEW');
        assert.equal(statusEvent.metadata.toStatus, 'IN_PROGRESS');

        const internalEvent = agentTimeline.find((event) => event.type === 'INTERNAL_NOTE_ADDED');
        assert.equal(internalEvent.metadata.visibility, 'INTERNAL');

        const requesterTimeline = (await request(app)
            .get(`/api/tasks/${task.id}/timeline`)
            .set('Authorization', `Bearer ${tokens.requesterOwner}`)
            .expect(200)).body;

        assert.ok(!requesterTimeline.some((event) => event.type === 'INTERNAL_NOTE_ADDED'));
        const requesterCannedEvent = requesterTimeline.find((event) => event.type === 'CANNED_REPLY_USED');
        assert.deepEqual(requesterCannedEvent.metadata, { mode: 'COMMENT' });

        const viewerTimeline = (await request(app)
            .get(`/api/tasks/${task.id}/timeline`)
            .set('Authorization', `Bearer ${tokens.viewer}`)
            .expect(200)).body;
        assert.ok(!viewerTimeline.some((event) => event.type === 'INTERNAL_NOTE_ADDED'));

        await request(app)
            .get(`/api/tasks/${task.id}/timeline`)
            .set('Authorization', `Bearer ${tokens.requesterOther}`)
            .expect(403);
    });
}
