const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'reports access smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('reports access is limited to ADMIN and VIEWER; legacy finance/review endpoints stay disabled', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const admin = await createTestUser(prisma, {
            email: `reports-admin-${runId}@example.com`,
            password,
            name: 'Reports Admin',
            role: 'ADMIN'
        });
        const viewer = await createTestUser(prisma, {
            email: `reports-viewer-${runId}@example.com`,
            password,
            name: 'Reports Viewer',
            role: 'VIEWER'
        });
        const agent = await createTestUser(prisma, {
            email: `reports-agent-${runId}@example.com`,
            password,
            name: 'Reports Agent',
            role: 'AGENT'
        });
        const requester = await createTestUser(prisma, {
            email: `reports-requester-${runId}@example.com`,
            password,
            name: 'Reports Requester',
            role: 'REQUESTER'
        });

        t.after(async() => {
            await prisma.user.deleteMany({
                where: {
                    id: { in: [admin.id, viewer.id, agent.id, requester.id] }
                }
            });
        });

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;
        const viewerToken = (await loginUser(app, { email: viewer.email, password })).body.token;
        const agentToken = (await loginUser(app, { email: agent.email, password })).body.token;
        const requesterToken = (await loginUser(app, { email: requester.email, password })).body.token;

        const adminReports = await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        assert.ok(Array.isArray(adminReports.body.statusCounts));
        assert.ok(Array.isArray(adminReports.body.workloadByFolder));
        assert.equal(Object.prototype.hasOwnProperty.call(adminReports.body, 'costsByRole'), false);

        const viewerReports = await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${viewerToken}`)
            .expect(200);
        assert.ok(Array.isArray(viewerReports.body.statusCounts));

        await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${agentToken}`)
            .expect(403);

        await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(403);

        await request(app)
            .get('/api/accounts')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(404);

        await request(app)
            .get('/api/transactions')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(404);

        await request(app)
            .get('/api/reviews')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(404);
    });
}
