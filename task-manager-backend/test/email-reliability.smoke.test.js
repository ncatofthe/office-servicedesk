const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'email reliability smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
        { skip: 'Missing test DATABASE_URL/JWT_SECRET' },
        () => {}
    );
} else {
    const request = require('supertest');
    const app = require('../src/app.js');
    const prisma = require('../src/prisma/prisma.js');
    const nodemailer = require('nodemailer');
    const { createTestUser, loginUser } = require('../test-support/auth-test-utils.cjs');
    const { parseAndProcessRawMessage } = require('../src/services/email-intake.service.js');
    const {
        getEmailOutboundConfig,
        retryPendingOutboundMessages,
        retryOutboundMessageById
    } = require('../src/services/email-outbound.service.js');

    after(async() => {
        await prisma.$disconnect();
    });

    test('email reliability: outbox, threading, dedupe, retry dry-run and permissions', async(t) => {
        process.env.EMAIL_OUTBOUND_ENABLED = 'false';
        delete process.env.EMAIL_OUTBOX_WORKER_ENABLED;
        assert.equal(getEmailOutboundConfig().workerEnabled, false);

        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const admin = await createTestUser(prisma, {
            email: `email-rel-admin-${runId}@example.com`,
            password,
            name: 'Email Reliability Admin',
            role: 'ADMIN'
        });
        const agent = await createTestUser(prisma, {
            email: `email-rel-agent-${runId}@example.com`,
            password,
            name: 'Email Reliability Agent',
            role: 'AGENT'
        });
        const agentOther = await createTestUser(prisma, {
            email: `email-rel-agent-other-${runId}@example.com`,
            password,
            name: 'Email Reliability Agent Other',
            role: 'AGENT'
        });
        const requester = await createTestUser(prisma, {
            email: `email-rel-requester-${runId}@example.com`,
            password,
            name: 'Email Reliability Requester',
            role: 'REQUESTER'
        });
        const requesterOther = await createTestUser(prisma, {
            email: `email-rel-requester-other-${runId}@example.com`,
            password,
            name: 'Email Reliability Requester Other',
            role: 'REQUESTER'
        });
        const viewer = await createTestUser(prisma, {
            email: `email-rel-viewer-${runId}@example.com`,
            password,
            name: 'Email Reliability Viewer',
            role: 'VIEWER'
        });

        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Email reliability folder ${runId}`
            }
        });
        const team = await prisma.supportTeam.create({
            data: {
                name: `Email reliability team ${runId}`,
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

        const task = await prisma.task.create({
            data: {
                title: `Email reliability task ${runId}`,
                description: 'Task for outbound/inbound reliability checks',
                authorId: requester.id,
                folderId: folder.id
            }
        });

        const inbound = await prisma.emailInboundMessage.create({
            data: {
                messageId: `email-reliability-${runId}@example.com`,
                mailbox: `EMAIL_RELIABILITY_${runId}`,
                uid: 10001,
                fromEmail: requester.email,
                fromName: requester.name,
                subject: `Email reliability subject ${runId}`,
                taskId: task.id
            }
        });

        t.after(async() => {
            await prisma.emailInboundMessage.deleteMany({
                where: {
                    OR: [
                        { id: inbound.id },
                        { messageId: `email-reliability-${runId}@example.com` },
                        { mailbox: `EMAIL_DEDUPE_${runId}` },
                        { fromEmail: `email-dedupe-${runId}@example.com` }
                    ]
                }
            });
            await prisma.emailOutboundMessage.deleteMany({
                where: {
                    OR: [
                        { taskId: task.id },
                        { subject: { contains: runId } }
                    ]
                }
            });
            await prisma.taskComment.deleteMany({
                where: { taskId: task.id }
            });
            await prisma.task.deleteMany({
                where: {
                    OR: [
                        { id: task.id },
                        { title: { contains: `Email dedupe ${runId}` } }
                    ]
                }
            });
            await prisma.cannedReply.deleteMany({
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
                    OR: [
                        {
                            id: {
                                in: [admin.id, agent.id, agentOther.id, requester.id, requesterOther.id, viewer.id]
                            }
                        },
                        {
                            email: `email-dedupe-${runId}@example.com`
                        }
                    ]
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
            agentOther: await loginAndGetToken(agentOther.email),
            requester: await loginAndGetToken(requester.email),
            requesterOther: await loginAndGetToken(requesterOther.email),
            viewer: await loginAndGetToken(viewer.email)
        };

        await request(app)
            .post(`/api/tasks/${task.id}/email-reply`)
            .set('Authorization', `Bearer ${tokens.agentOther}`)
            .send({
                message: `Forbidden email reply ${runId}`
            })
            .expect(403);

        const emailReply = (await request(app)
            .post(`/api/tasks/${task.id}/email-reply`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .send({
                message: `Dry-run email reply ${runId}`
            })
            .expect(200)).body;

        assert.equal(emailReply.dryRun, true);
        assert.ok(emailReply.commentId);
        assert.ok(emailReply.outboxId);
        assert.equal(emailReply.outboxStatus, 'DRY_RUN');

        const outboxAfterReply = await prisma.emailOutboundMessage.findUnique({
            where: { id: emailReply.outboxId }
        });
        assert.ok(outboxAfterReply);
        assert.equal(outboxAfterReply.status, 'DRY_RUN');
        assert.equal(outboxAfterReply.commentId, emailReply.commentId);

        const taskDetailAfterReply = (await request(app)
            .get(`/api/tasks/${task.id}`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .expect(200)).body;
        assert.ok(taskDetailAfterReply.comments.some((comment) =>
            comment.id === emailReply.commentId
            && comment.visibility === 'PUBLIC'
            && comment.content.includes('Dry-run email reply')
        ));

        const template = (await request(app)
            .post('/api/canned-replies')
            .set('Authorization', `Bearer ${tokens.agent}`)
            .send({
                title: `Email template ${runId}`,
                body: `Template email body ${runId}`,
                visibility: 'SHARED'
            })
            .expect(201)).body;

        const templateApply = (await request(app)
            .post(`/api/tasks/${task.id}/reply-from-template`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .send({
                templateId: template.id,
                mode: 'EMAIL_REPLY'
            })
            .expect(201)).body;

        assert.equal(templateApply.mode, 'EMAIL_REPLY');
        assert.equal(templateApply.dryRun, true);
        assert.ok(templateApply.outboxId);

        const outboxAfterTemplate = await prisma.emailOutboundMessage.findUnique({
            where: { id: templateApply.outboxId }
        });
        assert.ok(outboxAfterTemplate);
        assert.equal(outboxAfterTemplate.status, 'DRY_RUN');
        assert.equal(outboxAfterTemplate.bodyText, `Template email body ${runId}`);

        await prisma.emailOutboundMessage.update({
            where: { id: templateApply.outboxId },
            data: {
                status: 'RETRY_PENDING',
                dryRun: false,
                nextRetryAt: new Date(Date.now() - 60 * 1000)
            }
        });

        const retryResult = await retryPendingOutboundMessages({
            config: {
                enabled: false
            },
            limit: 10
        });
        assert.ok(retryResult.processed >= 1);

        const retriedRecord = await prisma.emailOutboundMessage.findUnique({
            where: { id: templateApply.outboxId }
        });
        assert.equal(retriedRecord.status, 'DRY_RUN');
        assert.equal(retriedRecord.dryRun, true);
        assert.ok(retriedRecord.attempts >= 1);

        const dryRunAttemptsBefore = outboxAfterReply.attempts;
        const dryRunRetryResult = await retryOutboundMessageById(emailReply.outboxId, {
            config: {
                enabled: true,
                host: 'smtp.test.local',
                port: 465,
                secure: true,
                user: 'smtp-user',
                password: 'smtp-password',
                fromAddress: 'noreply@example.com'
            }
        });
        assert.equal(dryRunRetryResult.skipped, true);
        assert.equal(dryRunRetryResult.reason, 'DRY_RUN');

        const dryRunAfterRetry = await prisma.emailOutboundMessage.findUnique({
            where: { id: emailReply.outboxId }
        });
        assert.equal(dryRunAfterRetry.attempts, dryRunAttemptsBefore);

        const sentRecord = await prisma.emailOutboundMessage.create({
            data: {
                taskId: task.id,
                recipientEmail: requester.email,
                fromEmail: 'noreply@example.com',
                subject: `SENT skip ${runId}`,
                bodyText: `Body for SENT ${runId}`,
                textPreview: `Body for SENT ${runId}`.slice(0, 20),
                status: 'SENT',
                dryRun: false,
                attempts: 2
            }
        });
        const sentRetryResult = await retryOutboundMessageById(sentRecord.id, {
            config: {
                enabled: true,
                host: 'smtp.test.local',
                port: 465,
                secure: true,
                user: 'smtp-user',
                password: 'smtp-password',
                fromAddress: 'noreply@example.com'
            }
        });
        assert.equal(sentRetryResult.skipped, true);
        assert.equal(sentRetryResult.reason, 'SENT');
        const sentAfterRetry = await prisma.emailOutboundMessage.findUnique({
            where: { id: sentRecord.id }
        });
        assert.equal(sentAfterRetry.attempts, 2);

        const lockedRecord = await prisma.emailOutboundMessage.create({
            data: {
                taskId: task.id,
                recipientEmail: requester.email,
                fromEmail: 'noreply@example.com',
                subject: `Locked retry ${runId}`,
                bodyText: `Locked body ${runId}`,
                textPreview: `Locked body ${runId}`.slice(0, 20),
                status: 'RETRY_PENDING',
                dryRun: false,
                attempts: 0,
                lockedAt: new Date(),
                lockedBy: 'external-worker',
                nextRetryAt: new Date(Date.now() - 60 * 1000)
            }
        });

        const lockedBatchResult = await retryPendingOutboundMessages({
            config: {
                enabled: false,
                lockTtlMs: 5 * 60 * 1000,
                workerBatchSize: 20
            },
            limit: 20
        });
        assert.ok(lockedBatchResult.scanned >= 0);
        const lockedAfterBatch = await prisma.emailOutboundMessage.findUnique({
            where: { id: lockedRecord.id }
        });
        assert.equal(lockedAfterBatch.status, 'RETRY_PENDING');
        assert.equal(lockedAfterBatch.attempts, 0);

        const lockedManualRetry = await retryOutboundMessageById(lockedRecord.id, {
            source: 'manual-test',
            workerId: 'manual-test-worker',
            config: {
                enabled: false,
                lockTtlMs: 5 * 60 * 1000
            }
        });
        assert.equal(lockedManualRetry.skipped, true);
        assert.equal(lockedManualRetry.reason, 'LOCKED_OR_NOT_DUE');

        await prisma.emailOutboundMessage.update({
            where: { id: lockedRecord.id },
            data: {
                lockedAt: new Date(Date.now() - 10 * 60 * 1000),
                lockedBy: 'stale-worker'
            }
        });

        const staleLockRetry = await retryOutboundMessageById(lockedRecord.id, {
            source: 'manual-test',
            workerId: 'manual-test-worker',
            config: {
                enabled: false,
                lockTtlMs: 1000
            }
        });
        assert.equal(staleLockRetry.skipped, false);

        const lockedAfterRetry = await prisma.emailOutboundMessage.findUnique({
            where: { id: lockedRecord.id }
        });
        assert.equal(lockedAfterRetry.status, 'DRY_RUN');
        assert.equal(lockedAfterRetry.lockedAt, null);
        assert.equal(lockedAfterRetry.lockedBy, null);

        const concurrentRetryRecord = await prisma.emailOutboundMessage.create({
            data: {
                taskId: task.id,
                recipientEmail: requester.email,
                fromEmail: 'noreply@example.com',
                subject: `Concurrent retry ${runId}`,
                bodyText: `Concurrent body ${runId}`,
                textPreview: `Concurrent preview ${runId}`,
                status: 'RETRY_PENDING',
                dryRun: false,
                attempts: 0,
                nextRetryAt: new Date(Date.now() - 60 * 1000)
            }
        });

        const originalCreateTransportForConcurrent = nodemailer.createTransport;
        const concurrentTracker = { sendCalls: 0 };
        nodemailer.createTransport = () => ({
            sendMail: async() => {
                concurrentTracker.sendCalls += 1;
                await new Promise((resolve) => setTimeout(resolve, 30));
                return {
                    messageId: `<concurrent-${runId}@example.com>`
                };
            }
        });

        try {
            const [firstRetry, secondRetry] = await Promise.all([
                retryOutboundMessageById(concurrentRetryRecord.id, {
                    source: 'parallel-a',
                    workerId: 'parallel-a',
                    config: {
                        enabled: true,
                        host: 'smtp.test.local',
                        port: 465,
                        secure: true,
                        user: 'smtp-user',
                        password: 'smtp-password',
                        fromAddress: 'noreply@example.com',
                        lockTtlMs: 5 * 60 * 1000
                    }
                }),
                retryOutboundMessageById(concurrentRetryRecord.id, {
                    source: 'parallel-b',
                    workerId: 'parallel-b',
                    config: {
                        enabled: true,
                        host: 'smtp.test.local',
                        port: 465,
                        secure: true,
                        user: 'smtp-user',
                        password: 'smtp-password',
                        fromAddress: 'noreply@example.com',
                        lockTtlMs: 5 * 60 * 1000
                    }
                })
            ]);

            assert.equal(concurrentTracker.sendCalls, 1);
            const notSkippedCount = [firstRetry, secondRetry].filter((item) => item.skipped === false).length;
            const skippedCount = [firstRetry, secondRetry].filter((item) => item.skipped === true).length;
            assert.equal(notSkippedCount, 1);
            assert.equal(skippedCount, 1);
        } finally {
            nodemailer.createTransport = originalCreateTransportForConcurrent;
        }

        const concurrentAfterRetry = await prisma.emailOutboundMessage.findUnique({
            where: { id: concurrentRetryRecord.id }
        });
        assert.equal(concurrentAfterRetry.status, 'SENT');
        assert.equal(concurrentAfterRetry.attempts, 1);

        const retryBodyRecord = await prisma.emailOutboundMessage.create({
            data: {
                taskId: task.id,
                recipientEmail: requester.email,
                fromEmail: 'noreply@example.com',
                subject: `Retry bodyText ${runId}`,
                bodyText: `FULL_BODY_${runId}_LINE_1\nFULL_BODY_${runId}_LINE_2`,
                textPreview: `PREVIEW_${runId}`,
                status: 'RETRY_PENDING',
                dryRun: false,
                attempts: 0,
                nextRetryAt: new Date(Date.now() - 60 * 1000)
            }
        });

        const originalCreateTransport = nodemailer.createTransport;
        const captured = { sendMailPayload: null };
        nodemailer.createTransport = () => ({
            sendMail: async(payload) => {
                captured.sendMailPayload = payload;
                return {
                    messageId: `<mocked-${runId}@example.com>`
                };
            }
        });

        try {
            const retryBodyResult = await retryOutboundMessageById(retryBodyRecord.id, {
                config: {
                    enabled: true,
                    host: 'smtp.test.local',
                    port: 465,
                    secure: true,
                    user: 'smtp-user',
                    password: 'smtp-password',
                    fromAddress: 'noreply@example.com'
                }
            });
            assert.equal(retryBodyResult.skipped, false);
            assert.ok(captured.sendMailPayload);
            assert.equal(
                captured.sendMailPayload.text,
                `FULL_BODY_${runId}_LINE_1\nFULL_BODY_${runId}_LINE_2`
            );
            assert.notEqual(captured.sendMailPayload.text, `PREVIEW_${runId}`);
        } finally {
            nodemailer.createTransport = originalCreateTransport;
        }

        const retryBodyAfter = await prisma.emailOutboundMessage.findUnique({
            where: { id: retryBodyRecord.id }
        });
        assert.equal(retryBodyAfter.status, 'SENT');

        const legacyPreviewRecord = await prisma.emailOutboundMessage.create({
            data: {
                taskId: task.id,
                recipientEmail: requester.email,
                fromEmail: 'noreply@example.com',
                subject: `Legacy preview fallback ${runId}`,
                bodyText: null,
                textPreview: `LEGACY_PREVIEW_${runId}`,
                status: 'RETRY_PENDING',
                dryRun: false,
                attempts: 0,
                nextRetryAt: new Date(Date.now() - 60 * 1000)
            }
        });

        const originalCreateTransportForLegacy = nodemailer.createTransport;
        const legacyCaptured = { text: null };
        nodemailer.createTransport = () => ({
            sendMail: async(payload) => {
                legacyCaptured.text = payload.text;
                return {
                    messageId: `<legacy-${runId}@example.com>`
                };
            }
        });

        try {
            const legacyRetryResult = await retryOutboundMessageById(legacyPreviewRecord.id, {
                source: 'legacy-fallback-test',
                workerId: 'legacy-fallback-test',
                config: {
                    enabled: true,
                    host: 'smtp.test.local',
                    port: 465,
                    secure: true,
                    user: 'smtp-user',
                    password: 'smtp-password',
                    fromAddress: 'noreply@example.com'
                }
            });
            assert.equal(legacyRetryResult.skipped, false);
            assert.equal(legacyCaptured.text, `LEGACY_PREVIEW_${runId}`);
        } finally {
            nodemailer.createTransport = originalCreateTransportForLegacy;
        }

        const bulkOutboxData = Array.from({ length: 120 }).map((_, index) => ({
            id: `email-outbox-limit-${runId}-${index}`,
            taskId: task.id,
            recipientEmail: requester.email,
            fromEmail: 'noreply@example.com',
            subject: `Outbox limit ${runId} #${index}`,
            bodyText: `Outbox limit body ${index}`,
            textPreview: `Outbox limit body ${index}`.slice(0, 20),
            status: 'DRY_RUN',
            dryRun: true
        }));
        await prisma.emailOutboundMessage.createMany({
            data: bulkOutboxData
        });

        const dedupeRawMessage = [
            `From: "Email Dedupe User" <email-dedupe-${runId}@example.com>`,
            `Message-ID: <email-dedupe-${runId}@example.com>`,
            `Subject: Email dedupe ${runId}`,
            `Date: ${new Date().toUTCString()}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=utf-8',
            '',
            'Проверка dedupe по messageId/mailbox/uid.'
        ].join('\r\n');

        const dedupeContext = {
            mailbox: `EMAIL_DEDUPE_${runId}`,
            uid: 20001
        };
        const dedupeFirst = await parseAndProcessRawMessage(Buffer.from(dedupeRawMessage, 'utf8'), dedupeContext);
        const dedupeSecond = await parseAndProcessRawMessage(Buffer.from(dedupeRawMessage, 'utf8'), dedupeContext);
        assert.equal(dedupeFirst.skipped, false);
        assert.equal(dedupeSecond.skipped, true);

        const dedupeMessagesCount = await prisma.emailInboundMessage.count({
            where: {
                messageId: dedupeFirst.messageId
            }
        });
        assert.equal(dedupeMessagesCount, 1);

        const agentThread = (await request(app)
            .get(`/api/tasks/${task.id}/email-thread`)
            .set('Authorization', `Bearer ${tokens.agent}`)
            .expect(200)).body;
        assert.equal(agentThread.taskId, task.id);
        assert.ok(Array.isArray(agentThread.messages));
        assert.ok(agentThread.messages.some((item) => item.direction === 'INBOUND'));
        assert.ok(agentThread.messages.some((item) => item.direction === 'OUTBOUND' && item.status === 'DRY_RUN'));

        const requesterThread = (await request(app)
            .get(`/api/tasks/${task.id}/email-thread`)
            .set('Authorization', `Bearer ${tokens.requester}`)
            .expect(200)).body;
        assert.ok(
            requesterThread.messages
                .filter((item) => item.direction === 'OUTBOUND')
                .every((item) => item.errorMessage === null && item.status === null)
        );

        await request(app)
            .get(`/api/tasks/${task.id}/email-thread`)
            .set('Authorization', `Bearer ${tokens.agentOther}`)
            .expect(403);

        await request(app)
            .get(`/api/tasks/${task.id}/email-thread`)
            .set('Authorization', `Bearer ${tokens.requesterOther}`)
            .expect(403);

        const adminOutbox = (await request(app)
            .get(`/api/servicedesk/admin/email-outbox?taskId=${task.id}`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .expect(200)).body;
        assert.ok(adminOutbox.length >= 2);

        const adminOutboxClampedMax = (await request(app)
            .get(`/api/servicedesk/admin/email-outbox?taskId=${task.id}&limit=999`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .expect(200)).body;
        assert.equal(adminOutboxClampedMax.length, 100);

        const adminOutboxDefaultForInvalidLimit = (await request(app)
            .get(`/api/servicedesk/admin/email-outbox?taskId=${task.id}&limit=-5`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .expect(200)).body;
        assert.equal(adminOutboxDefaultForInvalidLimit.length, 50);

        const adminEmailHealth = (await request(app)
            .get('/api/servicedesk/admin/email-health')
            .set('Authorization', `Bearer ${tokens.admin}`)
            .expect(200)).body;
        assert.equal(typeof adminEmailHealth.outboundEnabled, 'boolean');
        assert.equal(typeof adminEmailHealth.workerEnabled, 'boolean');
        assert.equal(typeof adminEmailHealth.workerIntervalMs, 'number');
        assert.equal(typeof adminEmailHealth.workerBatchSize, 'number');
        assert.equal(typeof adminEmailHealth.lockTtlMs, 'number');
        assert.equal(typeof adminEmailHealth.maxAttempts, 'number');
        assert.ok(adminEmailHealth.outbox);
        assert.ok(adminEmailHealth.smtp);
        assert.ok(!Object.prototype.hasOwnProperty.call(adminEmailHealth.smtp, 'password'));
        assert.ok(!Object.prototype.hasOwnProperty.call(adminEmailHealth.smtp, 'smtpPassword'));

        await request(app)
            .get('/api/servicedesk/admin/email-health')
            .set('Authorization', `Bearer ${tokens.agent}`)
            .expect(403);

        await request(app)
            .get('/api/servicedesk/admin/email-health')
            .set('Authorization', `Bearer ${tokens.requester}`)
            .expect(403);

        await request(app)
            .get('/api/servicedesk/admin/email-health')
            .set('Authorization', `Bearer ${tokens.viewer}`)
            .expect(403);
    });
}
