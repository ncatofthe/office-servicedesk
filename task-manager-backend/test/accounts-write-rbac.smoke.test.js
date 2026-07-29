const { after, test } = require('node:test');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'legacy finance write isolation test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('legacy finance write endpoints are not mounted in ServiceDesk runtime', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const adminUser = await createTestUser(prisma, {
            email: `finance-write-disabled-admin-${runId}@example.com`,
            password,
            name: 'Finance Write Disabled Admin',
            role: 'ADMIN'
        });

        t.after(async() => {
            await prisma.user.deleteMany({
                where: { id: adminUser.id }
            });
        });

        const adminToken = (await loginUser(app, {
            email: adminUser.email,
            password
        })).body.token;

        await request(app)
            .post('/api/accounts')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ type: 'PERSONAL', balance: 100 })
            .expect(404);

        await request(app)
            .patch('/api/accounts/legacy-account-id')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ balance: 150 })
            .expect(404);

        await request(app)
            .delete('/api/accounts/legacy-account-id')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(404);

        await request(app)
            .post('/api/transactions')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ amount: 100, type: 'INCOME', accountId: 'legacy-account-id' })
            .expect(404);
    });
}
