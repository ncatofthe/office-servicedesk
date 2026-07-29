const { after, test } = require('node:test');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'legacy review scope isolation test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('legacy review scope API is disabled before old approval logic can run', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const agentUser = await createTestUser(prisma, {
            email: `review-scope-disabled-agent-${runId}@example.com`,
            password,
            name: 'Review Scope Disabled Agent',
            role: 'AGENT'
        });

        t.after(async() => {
            await prisma.user.deleteMany({
                where: { id: agentUser.id }
            });
        });

        const agentToken = (await loginUser(app, {
            email: agentUser.email,
            password
        })).body.token;

        await request(app)
            .patch('/api/reviews/legacy-review-id')
            .set('Authorization', `Bearer ${agentToken}`)
            .send({ status: 'REJECTED', comment: 'Legacy disabled.' })
            .expect(404);
    });
}
