const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'canned replies smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('canned replies respect PRIVATE/SHARED visibility, CRUD rights, and reply-from-template flows', async(t) => {
        process.env.EMAIL_OUTBOUND_ENABLED = 'false';

        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const admin = await createTestUser(prisma, {
            email: `canned-admin-${runId}@example.com`,
            password,
            name: 'Canned Admin',
            role: 'ADMIN'
        });
        const authorAgent = await createTestUser(prisma, {
            email: `canned-agent-author-${runId}@example.com`,
            password,
            name: 'Canned Agent Author',
            role: 'AGENT'
        });
        const otherAgent = await createTestUser(prisma, {
            email: `canned-agent-other-${runId}@example.com`,
            password,
            name: 'Canned Agent Other',
            role: 'AGENT'
        });
        const requester = await createTestUser(prisma, {
            email: `canned-requester-${runId}@example.com`,
            password,
            name: 'Canned Requester',
            role: 'REQUESTER'
        });
        const viewer = await createTestUser(prisma, {
            email: `canned-viewer-${runId}@example.com`,
            password,
            name: 'Canned Viewer',
            role: 'VIEWER'
        });

        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Canned folder ${runId}`
            }
        });
        const team = await prisma.supportTeam.create({
            data: {
                name: `Canned team ${runId}`
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
                userId: authorAgent.id,
                role: 'Исполнитель',
                isLead: true
            }
        });

        const task = await prisma.task.create({
            data: {
                title: `Canned task ${runId}`,
                description: 'Task for canned reply flows',
                authorId: requester.id,
                folderId: folder.id,
                firstResponseDueAt: new Date(Date.now() + 30 * 60 * 1000),
                resolutionDueAt: new Date(Date.now() + 120 * 60 * 1000),
                slaFirstResponseStatus: 'PENDING',
                slaResolutionStatus: 'PENDING'
            }
        });

        t.after(async() => {
            await prisma.emailInboundMessage.deleteMany({
                where: {
                    taskId: task.id
                }
            });
            await prisma.taskComment.deleteMany({
                where: {
                    taskId: task.id
                }
            });
            await prisma.task.deleteMany({
                where: {
                    id: task.id
                }
            });
            await prisma.cannedReply.deleteMany({
                where: {
                    OR: [
                        { title: { contains: runId } },
                        { authorId: { in: [admin.id, authorAgent.id, otherAgent.id] } }
                    ]
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
                        in: [admin.id, authorAgent.id, otherAgent.id, requester.id, viewer.id]
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
            authorAgent: await loginAndGetToken(authorAgent.email),
            otherAgent: await loginAndGetToken(otherAgent.email),
            requester: await loginAndGetToken(requester.email),
            viewer: await loginAndGetToken(viewer.email)
        };

        const ownPrivate = (await request(app)
            .post('/api/canned-replies')
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .send({
                title: `Private template ${runId}`,
                body: 'Добрый день.\n\nЭто приватный шаблон.',
                category: 'Private',
                visibility: 'PRIVATE'
            })
            .expect(201)).body;
        assert.equal(ownPrivate.visibility, 'PRIVATE');

        const shared = (await request(app)
            .post('/api/canned-replies')
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .send({
                title: `Shared template ${runId}`,
                body: 'Здравствуйте!\n\nЗаявка принята в работу.',
                category: 'Onboarding',
                visibility: 'SHARED'
            })
            .expect(201)).body;
        assert.equal(shared.visibility, 'SHARED');

        const adminPrivate = (await request(app)
            .post('/api/canned-replies')
            .set('Authorization', `Bearer ${tokens.admin}`)
            .send({
                title: `Admin private ${runId}`,
                body: 'Только для администратора.',
                category: 'Admin',
                visibility: 'PRIVATE'
            })
            .expect(201)).body;

        await request(app)
            .get('/api/canned-replies')
            .set('Authorization', `Bearer ${tokens.requester}`)
            .expect(403);

        await request(app)
            .get('/api/canned-replies')
            .set('Authorization', `Bearer ${tokens.viewer}`)
            .expect(403);

        const authorList = (await request(app)
            .get(`/api/canned-replies?search=${encodeURIComponent(runId)}&authorId=${authorAgent.id}&isActive=true`)
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .expect(200)).body;
        assert.equal(authorList.length, 2);
        assert.ok(authorList.some((item) => item.id === ownPrivate.id));
        assert.ok(authorList.some((item) => item.id === shared.id));

        const sharedFiltered = (await request(app)
            .get(`/api/canned-replies?category=Onboarding&visibility=SHARED&search=${encodeURIComponent('принята')}`)
            .set('Authorization', `Bearer ${tokens.otherAgent}`)
            .expect(200)).body;
        assert.equal(sharedFiltered.length, 1);
        assert.equal(sharedFiltered[0].id, shared.id);

        await request(app)
            .get(`/api/canned-replies/${adminPrivate.id}`)
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .expect(404);

        const ownPrivateGet = (await request(app)
            .get(`/api/canned-replies/${ownPrivate.id}`)
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .expect(200)).body;
        assert.equal(ownPrivateGet.id, ownPrivate.id);

        await request(app)
            .put(`/api/canned-replies/${ownPrivate.id}`)
            .set('Authorization', `Bearer ${tokens.otherAgent}`)
            .send({
                title: 'Чужой private edit'
            })
            .expect(403);

        const adminUpdated = (await request(app)
            .put(`/api/canned-replies/${ownPrivate.id}`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .send({
                title: `Private template updated ${runId}`,
                isActive: false
            })
            .expect(200)).body;
        assert.equal(adminUpdated.title, `Private template updated ${runId}`);
        assert.equal(adminUpdated.isActive, false);

        const authorUpdatedShared = (await request(app)
            .put(`/api/canned-replies/${shared.id}`)
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .send({
                category: 'General'
            })
            .expect(200)).body;
        assert.equal(authorUpdatedShared.category, 'General');

        await prisma.emailInboundMessage.create({
            data: {
                messageId: `canned-reply-${runId}@example.com`,
                fromEmail: requester.email,
                fromName: requester.name,
                subject: `Thread ${runId}`,
                taskId: task.id
            }
        });

        const commentApply = (await request(app)
            .post(`/api/tasks/${task.id}/reply-from-template`)
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .send({
                templateId: shared.id,
                mode: 'COMMENT'
            })
            .expect(201)).body;
        assert.equal(commentApply.mode, 'COMMENT');
        assert.equal(commentApply.templateId, shared.id);
        assert.equal(commentApply.bodyUsed, 'Здравствуйте!\n\nЗаявка принята в работу.');
        assert.ok(commentApply.commentId);

        const afterCommentTask = (await request(app)
            .get(`/api/tasks/${task.id}`)
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .expect(200)).body;
        assert.ok(afterCommentTask.comments.some((comment) =>
            comment.id === commentApply.commentId
            && comment.content === 'Здравствуйте!\n\nЗаявка принята в работу.'
            && comment.visibility === 'PUBLIC'
        ));
        assert.ok(afterCommentTask.sla.firstResponseAt);

        await request(app)
            .post(`/api/tasks/${task.id}/reply-from-template`)
            .set('Authorization', `Bearer ${tokens.otherAgent}`)
            .send({
                templateId: shared.id,
                mode: 'COMMENT'
            })
            .expect(403);

        const emailApply = (await request(app)
            .post(`/api/tasks/${task.id}/reply-from-template`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .send({
                templateId: shared.id,
                mode: 'EMAIL_REPLY',
                bodyOverride: 'Индивидуальный email-ответ по шаблону.'
            })
            .expect(201)).body;
        assert.equal(emailApply.mode, 'EMAIL_REPLY');
        assert.equal(emailApply.dryRun, true);
        assert.equal(emailApply.recipient, requester.email);
        assert.match(emailApply.subject, /^Re:/i);
        assert.equal(emailApply.bodyUsed, 'Индивидуальный email-ответ по шаблону.');

        const commentsAfterEmail = (await request(app)
            .get(`/api/comments/${task.id}`)
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .expect(200)).body;
        assert.ok(commentsAfterEmail.some((comment) =>
            comment.id === emailApply.commentId
            && comment.visibility === 'PUBLIC'
            && comment.content.includes('Индивидуальный email-ответ по шаблону.')
        ));

        await request(app)
            .delete(`/api/canned-replies/${shared.id}`)
            .set('Authorization', `Bearer ${tokens.otherAgent}`)
            .expect(403);

        await request(app)
            .delete(`/api/canned-replies/${ownPrivate.id}`)
            .set('Authorization', `Bearer ${tokens.authorAgent}`)
            .expect(200);
    });
}
