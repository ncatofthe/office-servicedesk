const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'task list pagination smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('task list paginates, clamps limits and searches across daily inbox fields', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const admin = await createTestUser(prisma, {
            email: `pagination-admin-${runId}@example.com`,
            password,
            name: `Pagination Admin ${runId}`,
            role: 'ADMIN'
        });
        const requester = await createTestUser(prisma, {
            email: `pagination-requester-${runId}@example.com`,
            password,
            name: `Pagination Requester ${runId}`,
            role: 'REQUESTER'
        });

        const tasks = await Promise.all(Array.from({ length: 31 }, (_, index) => prisma.task.create({
            data: {
                title: `Pagination ticket ${runId} ${index + 1}`,
                description: index === 17 ? `Unique daily inbox description ${runId}` : 'Pagination regression ticket',
                authorId: requester.id
            }
        })));
        const externalReference = await prisma.taskExternalReference.create({
            data: {
                system: 'FRESHDESK',
                entityType: 'TASK',
                externalId: `fd-id-${runId}`,
                externalNumber: `FD-${runId}`,
                taskId: tasks[0].id
            }
        });
        await prisma.task.update({ where: { id: tasks[0].id }, data: { sourceChannel: 'EMAIL' } });
        const inboundMessage = await prisma.emailInboundMessage.create({
            data: {
                messageId: `pagination-${runId}@example.com`,
                mailbox: 'INBOX',
                uid: Number(String(Date.now()).slice(-8)),
                fromEmail: requester.email,
                subject: tasks[1].title,
                taskId: tasks[1].id,
                createdUserId: requester.id
            }
        });

        t.after(async() => {
            await prisma.emailInboundMessage.deleteMany({ where: { id: inboundMessage.id } });
            await prisma.taskExternalReference.deleteMany({ where: { id: externalReference.id } });
            await prisma.task.deleteMany({ where: { id: { in: tasks.map((task) => task.id) } } });
            await prisma.user.deleteMany({ where: { id: { in: [admin.id, requester.id] } } });
        });

        const token = (await loginUser(app, { email: admin.email, password })).body.token;
        const auth = { Authorization: `Bearer ${token}` };

        const firstPage = await request(app)
            .get('/api/tasks')
            .query({ search: runId, limit: 25, offset: 0, sortBy: 'number', sortOrder: 'asc' })
            .set(auth)
            .expect(200);
        assert.equal(firstPage.body.tasks.length, 25);
        assert.equal(firstPage.body.total, 31);
        assert.equal(firstPage.body.limit, 25);
        assert.equal(firstPage.body.offset, 0);

        const secondPage = await request(app)
            .get('/api/tasks')
            .query({ search: runId, limit: 25, offset: 25, sortBy: 'number', sortOrder: 'asc' })
            .set(auth)
            .expect(200);
        assert.equal(secondPage.body.tasks.length, 6);
        assert.equal(secondPage.body.total, 31);

        const clamped = await request(app)
            .get('/api/tasks')
            .query({ search: runId, limit: 999, offset: -10 })
            .set(auth)
            .expect(200);
        assert.equal(clamped.body.limit, 100);
        assert.equal(clamped.body.offset, 0);

        const descriptionSearch = await request(app)
            .get('/api/tasks')
            .query({ search: `Unique daily inbox description ${runId}` })
            .set(auth)
            .expect(200);
        assert.equal(descriptionSearch.body.total, 1);
        assert.equal(descriptionSearch.body.tasks[0].id, tasks[17].id);

        const numberSearch = await request(app)
            .get('/api/tasks')
            .query({ search: `#${tasks[5].ticketNumber}` })
            .set(auth)
            .expect(200);
        assert.equal(numberSearch.body.total, 1);
        assert.equal(numberSearch.body.tasks[0].id, tasks[5].id);

        const externalSearch = await request(app)
            .get('/api/tasks')
            .query({ search: `FD-${runId}` })
            .set(auth)
            .expect(200);
        assert.equal(externalSearch.body.total, 1);
        assert.equal(externalSearch.body.tasks[0].externalNumber, `FD-${runId}`);

        const emailChannel = await request(app)
            .get('/api/tasks')
            .query({ search: runId, channel: 'EMAIL' })
            .set(auth)
            .expect(200);
        assert.equal(emailChannel.body.total, 2);
        assert.ok(emailChannel.body.tasks.every((task) => task.channel === 'EMAIL'));
        assert.ok(emailChannel.body.tasks.some((task) => task.id === tasks[0].id));
        assert.ok(emailChannel.body.tasks.some((task) => task.id === tasks[1].id));
    });
}
