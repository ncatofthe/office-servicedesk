const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'file access RBAC smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('attachment access follows task visibility: owner requester is allowed, unrelated requester is denied', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const requesterOwner = await createTestUser(prisma, {
            email: `file-rbac-requester-owner-${runId}@example.com`,
            password,
            name: 'File RBAC Requester Owner',
            role: 'REQUESTER'
        });
        const requesterOther = await createTestUser(prisma, {
            email: `file-rbac-requester-other-${runId}@example.com`,
            password,
            name: 'File RBAC Requester Other',
            role: 'REQUESTER'
        });

        const createdTask = await prisma.task.create({
            data: {
                title: `File RBAC task ${runId}`,
                description: 'Attachment access should inherit task visibility.',
                authorId: requesterOwner.id
            }
        });

        const attachment = await prisma.taskAttachment.create({
            data: {
                filename: 'rbac-file.txt',
                path: `/uploads/rbac-file-${runId}.txt`,
                taskId: createdTask.id,
                uploadedById: requesterOwner.id
            }
        });

        t.after(async() => {
            await prisma.task.deleteMany({
                where: { id: createdTask.id }
            });

            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [requesterOwner.id, requesterOther.id]
                    }
                }
            });
        });

        const requesterOwnerToken = (await loginUser(app, {
            email: requesterOwner.email,
            password
        })).body.token;
        const requesterOtherToken = (await loginUser(app, {
            email: requesterOther.email,
            password
        })).body.token;

        const allowedListResponse = await request(app)
            .get(`/api/files/${createdTask.id}`)
            .set('Authorization', `Bearer ${requesterOwnerToken}`)
            .expect(200);

        assert.ok(Array.isArray(allowedListResponse.body));
        assert.equal(allowedListResponse.body.length, 1);
        assert.equal(allowedListResponse.body[0].id, attachment.id);

        await request(app)
            .get(`/api/files/${createdTask.id}`)
            .set('Authorization', `Bearer ${requesterOtherToken}`)
            .expect(403);

        await request(app)
            .get(`/api/files/${attachment.id}/download`)
            .set('Authorization', `Bearer ${requesterOtherToken}`)
            .expect(403);
    });
}
