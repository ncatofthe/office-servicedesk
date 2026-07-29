const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'director role smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('legacy DIRECTOR alias is accepted by managed auth flow, normalizes to AGENT, and stays out of admin-only role management', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const adminUser = await createTestUser(prisma, {
            email: `director-admin-${runId}@example.com`,
            password,
            name: 'Director Admin',
            role: 'ADMIN'
        });

        t.after(async() => {
            await prisma.user.deleteMany({
                where: {
                    email: {
                        in: [
                            adminUser.email,
                            `director-user-${runId}@example.com`
                        ]
                    }
                }
            });
        });

        const adminToken = (await loginUser(app, {
            email: adminUser.email,
            password
        })).body.token;

        const registerResponse = await request(app)
            .post('/api/auth/register/admin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Director User',
                email: `director-user-${runId}@example.com`,
                password,
                role: 'DIRECTOR',
                department: 'Management'
            })
            .expect(201);

        assert.equal(registerResponse.body.user.role, 'AGENT');

        const directorToken = (await loginUser(app, {
            email: `director-user-${runId}@example.com`,
            password
        })).body.token;

        await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${directorToken}`)
            .expect(200);

        await request(app)
            .get('/api/reports')
            .set('Authorization', `Bearer ${directorToken}`)
            .expect(403);

        await request(app)
            .get('/api/reviews')
            .set('Authorization', `Bearer ${directorToken}`)
            .expect(404);

        await request(app)
            .get('/api/accounts')
            .set('Authorization', `Bearer ${directorToken}`)
            .expect(404);

        await request(app)
            .patch(`/api/users/${adminUser.id}/role`)
            .set('Authorization', `Bearer ${directorToken}`)
            .send({ role: 'REQUESTER' })
            .expect(403);

        await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
    });
}
