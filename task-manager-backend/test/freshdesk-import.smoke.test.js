const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'freshdesk import smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
        { skip: 'Missing test DATABASE_URL/JWT_SECRET' },
        () => {}
    );
} else {
    const request = require('supertest');
    const app = require('../src/app.js');
    const prisma = require('../src/prisma/prisma.js');
    const {
        importFreshdeskFile,
        importFreshdeskRecords,
        acquireFreshdeskImportLock,
        releaseFreshdeskImportLock
    } = require('../src/services/freshdesk-import.service.js');
    const { createTestUser, loginUser } = require('../test-support/auth-test-utils.cjs');

    after(async() => {
        await prisma.$disconnect();
    });

    test('freshdesk import supports dry-run and idempotent rerun', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const filePath = path.join(os.tmpdir(), `freshdesk-import-${runId}.json`);
        const requesterEmail = `freshdesk-requester-${runId}@example.com`;
        const agentEmail = `freshdesk-agent-${runId}@example.com`;
        const externalId = `fd-${runId}`;
        const externalNumber = `FD-${runId}`;

        fs.writeFileSync(filePath, JSON.stringify([
            {
                id: externalId,
                number: externalNumber,
                title: `Freshdesk ticket ${runId}`,
                description: 'Imported from Freshdesk',
                status: 3,
                source: 1,
                created_at: '2024-01-02T03:04:05.000Z',
                updated_at: '2024-01-03T03:04:05.000Z',
                priority: 'high',
                requester: {
                    email: requesterEmail,
                    name: 'Freshdesk Requester'
                },
                agent: {
                    email: agentEmail,
                    name: 'Freshdesk Agent'
                },
                comments: [
                    {
                        id: `public-${runId}`,
                        body: 'Публичный импортированный комментарий',
                        created_at: '2024-01-02T04:04:05.000Z'
                    },
                    {
                        id: `internal-${runId}`,
                        body: 'Приватная заметка из Freshdesk',
                        private: true
                    }
                ],
                attachments: [
                    {
                        fileName: 'invoice.pdf',
                        url: 'https://example.com/invoice.pdf'
                    }
                ]
            }
        ], null, 2));

        t.after(async() => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            await prisma.freshdeskImportRun.deleteMany({
                where: {
                    fileName: path.basename(filePath)
                }
            });
            await prisma.taskExternalReference.deleteMany({
                where: {
                    OR: [
                        { externalId },
                        { externalId: { startsWith: `${externalId}:comment:` } }
                    ]
                }
            });
            await prisma.task.deleteMany({
                where: {
                    title: `Freshdesk ticket ${runId}`
                }
            });
            await prisma.user.deleteMany({
                where: {
                    email: { in: [requesterEmail, agentEmail] }
                }
            });
        });

        const dryRunResult = await importFreshdeskFile({
            filePath,
            dryRun: true
        });
        assert.equal(dryRunResult.run.status, 'DRY_RUN');
        assert.equal(dryRunResult.summary.created, 1);

        const refsAfterDryRun = await prisma.taskExternalReference.count({
            where: {
                externalId
            }
        });
        assert.equal(refsAfterDryRun, 0);

        const importResult = await importFreshdeskFile({
            filePath,
            dryRun: false
        });
        assert.equal(importResult.summary.created, 1);
        assert.equal(importResult.summary.errors, 0);

        const taskRef = await prisma.taskExternalReference.findUnique({
            where: {
                system_entityType_externalId: {
                    system: 'FRESHDESK',
                    entityType: 'TASK',
                    externalId
                }
            },
            include: {
                task: {
                    include: {
                        comments: true,
                        assignees: true
                    }
                }
            }
        });

        assert.ok(taskRef);
        assert.equal(taskRef.externalNumber, externalNumber);
        assert.equal(taskRef.task.priority, 'HIGH');
        assert.equal(taskRef.task.status, 'IN_PROGRESS');
        assert.equal(taskRef.task.sourceChannel, 'EMAIL');
        assert.equal(taskRef.task.createdAt.toISOString(), '2024-01-02T03:04:05.000Z');
        assert.ok(taskRef.task.comments.some((comment) => comment.createdAt.toISOString() === '2024-01-02T04:04:05.000Z'));
        assert.equal(taskRef.task.comments.length, 2);
        assert.ok(taskRef.task.comments.some((comment) => comment.visibility === 'PUBLIC'));
        assert.ok(taskRef.task.comments.some((comment) => comment.visibility === 'INTERNAL'));
        assert.equal(taskRef.task.assignees.length, 1);

        const rerunResult = await importFreshdeskFile({
            filePath,
            dryRun: false
        });
        assert.equal(rerunResult.summary.skipped, 1);

        const commentReferenceCount = await prisma.taskExternalReference.count({
            where: {
                externalId: {
                    startsWith: `${externalId}:comment:`
                }
            }
        });
        assert.equal(commentReferenceCount, 2);
    });

    test('freshdesk import admin API supports payload dry-run, real import, rerun and run history', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const externalId = `fd-api-${runId}`;
        const externalNumber = `FD-API-${runId}`;
        const requesterEmail = `freshdesk-api-requester-${runId}@example.com`;
        const agentEmail = `freshdesk-api-agent-${runId}@example.com`;

        const admin = await createTestUser(prisma, {
            email: `freshdesk-api-admin-${runId}@example.com`,
            password,
            name: 'Freshdesk API Admin',
            role: 'ADMIN'
        });
        const rbacAgent = await createTestUser(prisma, {
            email: `freshdesk-rbac-agent-${runId}@example.com`,
            password,
            name: 'Freshdesk RBAC Agent',
            role: 'AGENT'
        });

        const payload = {
            fileName: `freshdesk-api-${runId}.json`,
            tickets: [
                {
                    id: externalId,
                    externalNumber,
                    subject: `Freshdesk API ticket ${runId}`,
                    description: 'Импорт через admin API',
                    status: 'processing',
                    priority: 'urgent',
                    requester: {
                        email: requesterEmail,
                        name: 'Freshdesk API Requester'
                    },
                    agent: {
                        email: agentEmail,
                        name: 'Freshdesk API Agent'
                    },
                    comments: [
                        {
                            id: `api-public-${runId}`,
                            body: 'Публичный комментарий из API импорта',
                            private: false
                        },
                        {
                            id: `api-internal-${runId}`,
                            body: 'Внутренняя заметка из API импорта',
                            private: true
                        }
                    ],
                    attachments: [
                        {
                            fileName: 'freshdesk-api-log.txt',
                            url: 'https://example.com/freshdesk-api-log.txt'
                        }
                    ]
                }
            ]
        };

        t.after(async() => {
            await prisma.freshdeskImportRun.deleteMany({
                where: {
                    fileName: payload.fileName
                }
            });
            await prisma.taskExternalReference.deleteMany({
                where: {
                    OR: [
                        { externalId },
                        { externalId: { startsWith: `${externalId}:comment:` } }
                    ]
                }
            });
            await prisma.task.deleteMany({
                where: {
                    title: `Freshdesk API ticket ${runId}`
                }
            });
            await prisma.user.deleteMany({
                where: {
                    email: { in: [admin.email, rbacAgent.email, requesterEmail, agentEmail] }
                }
            });
        });

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;
        const agentToken = (await loginUser(app, { email: rbacAgent.email, password })).body.token;

        const dryRunResponse = await request(app)
            .post('/api/servicedesk/admin/freshdesk-import/dry-run')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload)
            .expect(200);
        assert.equal(dryRunResponse.body.run.status, 'DRY_RUN');
        assert.equal(dryRunResponse.body.summary.created, 1);

        const importResponse = await request(app)
            .post('/api/servicedesk/admin/freshdesk-import')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload)
            .expect(201);
        assert.equal(importResponse.body.run.status, 'SUCCESS');
        assert.equal(importResponse.body.summary.created, 1);

        const rerunResponse = await request(app)
            .post('/api/servicedesk/admin/freshdesk-import')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload)
            .expect(201);
        assert.equal(rerunResponse.body.summary.skipped, 1);

        const taskRef = await prisma.taskExternalReference.findUnique({
            where: {
                system_entityType_externalId: {
                    system: 'FRESHDESK',
                    entityType: 'TASK',
                    externalId
                }
            },
            include: {
                task: {
                    include: {
                        comments: true,
                        assignees: true
                    }
                }
            }
        });

        assert.ok(taskRef);
        assert.equal(taskRef.externalNumber, externalNumber);
        assert.equal(taskRef.task.status, 'IN_PROGRESS');
        assert.equal(taskRef.task.priority, 'URGENT');
        assert.equal(taskRef.task.sourceChannel, 'WEB');
        assert.ok(taskRef.metadata.attachments.length === 1);
        assert.ok(taskRef.task.comments.some((comment) => comment.visibility === 'PUBLIC'));
        assert.ok(taskRef.task.comments.some((comment) => comment.visibility === 'INTERNAL'));
        assert.equal(taskRef.task.assignees.length, 1);

        const runsResponse = await request(app)
            .get('/api/servicedesk/admin/freshdesk-import/runs?limit=5')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        assert.ok(runsResponse.body.some((run) => run.id === importResponse.body.run.id));

        await request(app)
            .get(`/api/servicedesk/admin/freshdesk-import/runs/${importResponse.body.run.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        const invalidResponse = await request(app)
            .post('/api/servicedesk/admin/freshdesk-import/dry-run')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ nope: true })
            .expect(400);
        assert.match(JSON.stringify(invalidResponse.body), /tickets/);

        await request(app)
            .get('/api/servicedesk/admin/freshdesk-import/source-health')
            .set('Authorization', `Bearer ${agentToken}`)
            .expect(403);
        const health = await request(app)
            .get('/api/servicedesk/admin/freshdesk-import/source-health')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        assert.equal(Object.prototype.hasOwnProperty.call(health.body, 'apiKey'), false);
    });

    test('real Freshdesk import lock rejects a concurrent process', async() => {
        const owner = await acquireFreshdeskImportLock(prisma);
        try {
            await assert.rejects(() => acquireFreshdeskImportLock(prisma), (error) => error.code === 'FRESHDESK_IMPORT_CONFLICT');
        } finally {
            await releaseFreshdeskImportLock(owner, prisma);
        }
    });

    test('attachment import keeps successful files, reports partial failures and deduplicates rerun', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const externalId = `fd-attachments-${runId}`;
        const email = `fd-attachments-${runId}@example.com`;
        const storedName = `freshdesk-test-${runId}.txt`;
        const absolutePath = path.join(__dirname, '..', 'uploads', storedName);
        const records = [{
            id: externalId,
            subject: `Attachment import ${runId}`,
            status: 4,
            requester: { email, name: 'Attachment User' },
            attachments: [
                { id: `ok-${runId}`, fileName: 'ok.txt', url: 'https://files.example.com/ok' },
                { id: `fail-${runId}`, fileName: 'fail.txt', url: 'https://files.example.com/fail' }
            ]
        }];
        const downloadAttachment = async(attachment) => {
            if (attachment.fileName === 'fail.txt') throw new Error('simulated attachment failure');
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            fs.writeFileSync(absolutePath, 'ok');
            return { filename: 'ok.txt', storedName, absolutePath, path: `/uploads/${storedName}`, sizeBytes: 2 };
        };
        t.after(async() => {
            fs.rmSync(absolutePath, { force: true });
            await prisma.freshdeskImportRun.deleteMany({ where: { fileName: `attachment-test-${runId}` } });
            await prisma.taskExternalReference.deleteMany({ where: { externalId: { startsWith: externalId } } });
            await prisma.task.deleteMany({ where: { title: `Attachment import ${runId}` } });
            await prisma.user.deleteMany({ where: { email } });
        });
        const first = await importFreshdeskRecords({ records, fileName: `attachment-test-${runId}`, downloadAttachments: true, downloadAttachment });
        assert.equal(first.run.status, 'PARTIAL');
        assert.equal(first.summary.attachmentsImported, 1);
        assert.equal(first.summary.attachmentsFailed, 1);
        const rerun = await importFreshdeskRecords({ records, fileName: `attachment-test-${runId}`, downloadAttachments: true, downloadAttachment });
        assert.equal(rerun.summary.attachmentsImported, 0);
        assert.equal(rerun.summary.attachmentsSkipped, 1);
        assert.equal(await prisma.taskAttachment.count({ where: { task: { title: `Attachment import ${runId}` } } }), 1);
    });
}
