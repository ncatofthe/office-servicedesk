const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'sla foundation smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('SLA policies match tasks, first response ignores requester comments, email reply counts, and close/reopen updates SLA state', async(t) => {
        process.env.EMAIL_OUTBOUND_ENABLED = 'false';

        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const admin = await createTestUser(prisma, {
            email: `sla-admin-${runId}@example.com`,
            password,
            name: 'SLA Admin',
            role: 'ADMIN'
        });
        const requester = await createTestUser(prisma, {
            email: `sla-requester-${runId}@example.com`,
            password,
            name: 'SLA Requester',
            role: 'REQUESTER'
        });

        t.after(async() => {
            await prisma.emailInboundMessage.deleteMany({
                where: {
                    messageId: `sla-message-${runId}@example.com`
                }
            });
            await prisma.task.deleteMany({
                where: {
                    title: {
                        contains: runId
                    }
                }
            });
            await prisma.slaPolicy.deleteMany({
                where: {
                    name: {
                        contains: runId
                    }
                }
            });
            await prisma.ticketSubtype.deleteMany({
                where: {
                    code: `SLA_SUBTYPE_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`
                }
            });
            await prisma.ticketType.deleteMany({
                where: {
                    code: `SLA_TYPE_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 43)}`
                }
            });
            await prisma.ticketEntity.deleteMany({
                where: {
                    code: `SLA_ENTITY_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 41)}`
                }
            });
            await prisma.ticketFolder.deleteMany({
                where: {
                    name: `SLA folder ${runId}`
                }
            });
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [admin.id, requester.id]
                    }
                }
            });
        });

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;
        const requesterToken = (await loginUser(app, { email: requester.email, password })).body.token;

        const folder = (await request(app)
            .post('/api/servicedesk/admin/folders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `SLA folder ${runId}`,
                description: 'Папка для SLA smoke'
            })
            .expect(201)).body;

        const entity = (await request(app)
            .post('/api/servicedesk/admin/entities')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `SLA entity ${runId}`,
                code: `SLA_ENTITY_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 41)}`
            })
            .expect(201)).body;

        const type = (await request(app)
            .post('/api/servicedesk/admin/types')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `SLA type ${runId}`,
                code: `SLA_TYPE_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 43)}`,
                folderId: folder.id,
                entityId: entity.id
            })
            .expect(201)).body;

        const subtype = (await request(app)
            .post('/api/servicedesk/admin/subtypes')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `SLA subtype ${runId}`,
                code: `SLA_SUBTYPE_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`,
                typeId: type.id,
                folderId: folder.id
            })
            .expect(201)).body;

        const policy = (await request(app)
            .post('/api/servicedesk/admin/sla-policies')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `SLA policy ${runId}`,
                description: 'High priority SLA policy',
                sortOrder: 10,
                folderId: folder.id,
                typeId: type.id,
                subtypeId: subtype.id,
                priority: 'HIGH',
                firstResponseMinutes: 30,
                resolutionMinutes: 120
            })
            .expect(201)).body;

        const deleteFolderBlocked = await request(app)
            .delete(`/api/servicedesk/admin/folders/${folder.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(409);
        assert.equal(deleteFolderBlocked.body.blockers.slaPolicies, 1);

        const createdTask = (await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${requesterToken}`)
            .send({
                title: `SLA task ${runId}`,
                description: 'Task for SLA flow',
                priority: 'HIGH',
                folderId: folder.id,
                entityId: entity.id,
                typeId: type.id,
                subtypeId: subtype.id
            })
            .expect(201)).body;

        assert.equal(createdTask.sla.policy.id, policy.id);
        assert.equal(createdTask.sla.firstResponseStatus, 'PENDING');
        assert.equal(createdTask.sla.resolutionStatus, 'PENDING');
        assert.ok(createdTask.sla.firstResponseDueAt);
        assert.ok(createdTask.sla.resolutionDueAt);

        const testPolicyResponse = await request(app)
            .post(`/api/servicedesk/admin/sla-policies/${policy.id}/test`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ taskId: createdTask.id })
            .expect(200);
        assert.equal(testPolicyResponse.body.matched, true);
        assert.equal(testPolicyResponse.body.policy.id, policy.id);
        assert.equal(testPolicyResponse.body.resultingStatuses.firstResponseStatus, 'PENDING');

        await request(app)
            .post(`/api/comments/${createdTask.id}`)
            .set('Authorization', `Bearer ${requesterToken}`)
            .send({ content: 'Комментарий от заявителя не должен считаться first response.' })
            .expect(201);

        const afterRequesterComment = (await request(app)
            .get(`/api/tasks/${createdTask.id}`)
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(200)).body;
        assert.equal(afterRequesterComment.sla.firstResponseAt, null);
        assert.equal(afterRequesterComment.sla.firstResponseStatus, 'PENDING');

        await prisma.emailInboundMessage.create({
            data: {
                messageId: `sla-message-${runId}@example.com`,
                fromEmail: requester.email,
                fromName: requester.name,
                subject: `SLA thread ${runId}`,
                taskId: createdTask.id
            }
        });

        const replyResult = (await request(app)
            .post(`/api/tasks/${createdTask.id}/email-reply`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ message: 'Первый ответ по заявке через email.' })
            .expect(200)).body;
        assert.equal(replyResult.dryRun, true);

        const afterReply = (await request(app)
            .get(`/api/tasks/${createdTask.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)).body;
        assert.ok(afterReply.sla.firstResponseAt);
        assert.equal(afterReply.sla.firstResponseStatus, 'MET');

        await request(app)
            .post(`/api/tasks/${createdTask.id}/assignees`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: admin.id })
            .expect(201);

        const closedTask = (await request(app)
            .patch(`/api/tasks/${createdTask.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'DONE' })
            .expect(200)).body;
        assert.ok(closedTask.sla.resolvedAt);
        assert.equal(closedTask.sla.resolutionStatus, 'MET');

        const reopenedTask = (await request(app)
            .patch(`/api/tasks/${createdTask.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'NEW' })
            .expect(200)).body;
        assert.equal(reopenedTask.sla.resolvedAt, null);
        assert.equal(reopenedTask.sla.resolutionStatus, 'PENDING');
    });
}
