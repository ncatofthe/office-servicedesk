const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'comment visibility smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('internal notes respect visibility rules and still count as first response for SLA', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const adminUser = await createTestUser(prisma, {
            email: `comment-vis-admin-${runId}@example.com`,
            password,
            name: 'Comment Visibility Admin',
            role: 'ADMIN'
        });
        const agentUser = await createTestUser(prisma, {
            email: `comment-vis-agent-${runId}@example.com`,
            password,
            name: 'Comment Visibility Agent',
            role: 'AGENT'
        });
        const requesterOwner = await createTestUser(prisma, {
            email: `comment-vis-requester-owner-${runId}@example.com`,
            password,
            name: 'Comment Visibility Requester Owner',
            role: 'REQUESTER'
        });
        const requesterOther = await createTestUser(prisma, {
            email: `comment-vis-requester-other-${runId}@example.com`,
            password,
            name: 'Comment Visibility Requester Other',
            role: 'REQUESTER'
        });
        const viewerUser = await createTestUser(prisma, {
            email: `comment-vis-viewer-${runId}@example.com`,
            password,
            name: 'Comment Visibility Viewer',
            role: 'VIEWER'
        });

        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Comment visibility folder ${runId}`,
                description: 'Папка для проверки private comments'
            }
        });
        const team = await prisma.supportTeam.create({
            data: {
                name: `Comment visibility team ${runId}`,
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
                userId: agentUser.id,
                role: 'Исполнитель',
                isLead: true
            }
        });

        const task = await prisma.task.create({
            data: {
                title: `Comment visibility task ${runId}`,
                description: 'Task for internal note visibility checks',
                authorId: requesterOwner.id,
                folderId: folder.id,
                firstResponseDueAt: new Date(Date.now() + 30 * 60 * 1000),
                resolutionDueAt: new Date(Date.now() + 120 * 60 * 1000),
                slaFirstResponseStatus: 'PENDING',
                slaResolutionStatus: 'PENDING'
            }
        });

        t.after(async() => {
            await prisma.taskComment.deleteMany({
                where: { taskId: task.id }
            });
            await prisma.task.deleteMany({
                where: { id: task.id }
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

        const internalComment = await request(app)
            .post(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .send({
                content: 'Внутренняя заметка для исполнителей.',
                visibility: 'INTERNAL'
            })
            .expect(201);
        assert.equal(internalComment.body.visibility, 'INTERNAL');

        const publicCommentByAgent = await request(app)
            .post(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .send({
                content: 'Публичный комментарий от исполнителя.',
                visibility: 'PUBLIC'
            })
            .expect(201);
        assert.equal(publicCommentByAgent.body.visibility, 'PUBLIC');

        const publicCommentByRequester = await request(app)
            .post(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.requesterOwner}`)
            .send({
                content: 'Публичный комментарий от заявителя.'
            })
            .expect(201);
        assert.equal(publicCommentByRequester.body.visibility, 'PUBLIC');

        await request(app)
            .post(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.requesterOwner}`)
            .send({
                content: 'Попытка создать internal note от заявителя.',
                visibility: 'INTERNAL'
            })
            .expect(403);

        await request(app)
            .post(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.viewer}`)
            .send({
                content: 'Viewer не должен создавать комментарии.'
            })
            .expect(403);

        const adminComments = await request(app)
            .get(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .expect(200);
        assert.equal(adminComments.body.length, 3);
        assert.ok(adminComments.body.some((comment) => comment.visibility === 'INTERNAL'));

        const agentComments = await request(app)
            .get(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .expect(200);
        assert.equal(agentComments.body.length, 3);
        assert.ok(agentComments.body.some((comment) => comment.visibility === 'INTERNAL'));

        const requesterComments = await request(app)
            .get(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.requesterOwner}`)
            .expect(200);
        assert.equal(requesterComments.body.length, 2);
        assert.ok(requesterComments.body.every((comment) => comment.visibility === 'PUBLIC'));

        const viewerComments = await request(app)
            .get(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.viewer}`)
            .expect(200);
        assert.equal(viewerComments.body.length, 2);
        assert.ok(viewerComments.body.every((comment) => comment.visibility === 'PUBLIC'));

        const requesterTaskDetail = await request(app)
            .get(`/api/tasks/${task.id}`)
            .set('Authorization', `Bearer ${tokens.requesterOwner}`)
            .expect(200);
        assert.equal(requesterTaskDetail.body.comments.length, 2);
        assert.ok(requesterTaskDetail.body.comments.every((comment) => comment.visibility === 'PUBLIC'));

        const adminTaskDetail = await request(app)
            .get(`/api/tasks/${task.id}`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .expect(200);
        assert.equal(adminTaskDetail.body.comments.length, 3);
        assert.ok(adminTaskDetail.body.comments.some((comment) => comment.visibility === 'INTERNAL'));
        assert.ok(adminTaskDetail.body.sla.firstResponseAt);
        assert.equal(adminTaskDetail.body.sla.firstResponseStatus, 'MET');

        await request(app)
            .get(`/api/tasks/${task.id}`)
            .set('Authorization', `Bearer ${tokens.requesterOther}`)
            .expect(403);
    });
}
