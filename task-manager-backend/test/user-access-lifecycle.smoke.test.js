const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'user access lifecycle smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('admin can disable access and logout/password changes revoke existing sessions', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const nextPassword = 'new-password-123';
        const admin = await createTestUser(prisma, {
            email: `access-admin-${runId}@example.com`,
            password,
            name: 'Access Admin',
            role: 'ADMIN'
        });
        const requester = await createTestUser(prisma, {
            email: `access-requester-${runId}@example.com`,
            password,
            name: 'Access Requester',
            role: 'REQUESTER'
        });

        t.after(async() => {
            await prisma.user.deleteMany({ where: { id: { in: [admin.id, requester.id] } } });
        });

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;
        const requesterToken = (await loginUser(app, { email: requester.email, password })).body.token;

        const disabled = await request(app)
            .patch(`/api/users/${requester.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ isActive: false })
            .expect(200);
        assert.equal(disabled.body.user.isActive, false);

        await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(401);
        await request(app)
            .post('/api/auth/login')
            .send({ email: requester.email, password })
            .expect(401);

        await request(app)
            .patch(`/api/users/${requester.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ isActive: true })
            .expect(200);

        const reenabledToken = (await loginUser(app, { email: requester.email, password })).body.token;
        await request(app)
            .put(`/api/users/${requester.id}`)
            .set('Authorization', `Bearer ${reenabledToken}`)
            .send({ password: nextPassword })
            .expect(200);
        await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${reenabledToken}`)
            .expect(401);

        const changedPasswordToken = (await loginUser(app, {
            email: requester.email,
            password: nextPassword
        })).body.token;
        await request(app)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${changedPasswordToken}`)
            .expect(200);
        await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${changedPasswordToken}`)
            .expect(401);
    });

    test('production registration mode is visible and admin can still create managed users', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const previousValue = process.env.PUBLIC_REGISTRATION_ENABLED;
        process.env.PUBLIC_REGISTRATION_ENABLED = 'false';

        const admin = await createTestUser(prisma, {
            email: `managed-admin-${runId}@example.com`,
            password,
            name: 'Managed Admin',
            role: 'ADMIN'
        });

        t.after(async() => {
            if (previousValue === undefined) {
                delete process.env.PUBLIC_REGISTRATION_ENABLED;
            } else {
                process.env.PUBLIC_REGISTRATION_ENABLED = previousValue;
            }
            await prisma.user.deleteMany({
                where: {
                    email: {
                        in: [admin.email, `managed-agent-${runId}@example.com`]
                    }
                }
            });
        });

        const config = await request(app)
            .get('/api/auth/config')
            .expect(200);
        assert.equal(config.body.publicRegistrationEnabled, false);

        await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Blocked Requester',
                email: `blocked-requester-${runId}@example.com`,
                password
            })
            .expect(403);

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;
        const created = await request(app)
            .post('/api/auth/register/admin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Managed Agent',
                email: `managed-agent-${runId}@example.com`,
                password,
                role: 'AGENT'
            })
            .expect(201);

        assert.equal(created.body.user.role, 'AGENT');
        assert.equal(created.body.user.isActive, true);
    });

    test('only admin can reset imported user password and old credentials and token are revoked', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const oldPassword = 'password123';
        const newPassword = 'freshdesk-user-2026';
        const admin = await createTestUser(prisma, { email: `reset-admin-${runId}@example.com`, password: oldPassword, name: 'Admin', role: 'ADMIN' });
        const agent = await createTestUser(prisma, { email: `reset-agent-${runId}@example.com`, password: oldPassword, name: 'Agent', role: 'AGENT' });
        const requester = await createTestUser(prisma, { email: `reset-user-${runId}@example.com`, password: oldPassword, name: 'Imported', role: 'REQUESTER' });
        t.after(() => prisma.user.deleteMany({ where: { id: { in: [admin.id, agent.id, requester.id] } } }));
        const adminToken = (await loginUser(app, { email: admin.email, password: oldPassword })).body.token;
        const agentToken = (await loginUser(app, { email: agent.email, password: oldPassword })).body.token;
        const requesterToken = (await loginUser(app, { email: requester.email, password: oldPassword })).body.token;
        await request(app).patch(`/api/users/${requester.id}/password`).set('Authorization', `Bearer ${agentToken}`).send({ password: newPassword }).expect(403);
        await request(app).patch(`/api/users/${requester.id}/password`).set('Authorization', `Bearer ${requesterToken}`).send({ password: newPassword }).expect(403);
        const reset = await request(app).patch(`/api/users/${requester.id}/password`).set('Authorization', `Bearer ${adminToken}`).send({ password: newPassword }).expect(200);
        assert.equal(JSON.stringify(reset.body).includes('password'), false);
        await request(app).get('/api/auth/me').set('Authorization', `Bearer ${requesterToken}`).expect(401);
        await request(app).post('/api/auth/login').send({ email: requester.email, password: oldPassword }).expect(401);
        await request(app).post('/api/auth/login').send({ email: requester.email, password: newPassword }).expect(200);
    });
}
