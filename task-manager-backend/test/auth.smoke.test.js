const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'auth happy path requires .env.test with DATABASE_URL and JWT_SECRET',
        { skip: 'Missing test DATABASE_URL/JWT_SECRET' },
        () => {}
    );
} else {
    const app = require('../src/app.js');
    const prisma = require('../src/prisma/prisma.js');
    const request = require('supertest');
    const { loginUser } = require('../test-support/auth-test-utils.cjs');

    after(async() => {
        await prisma.$disconnect();
    });

    test('auth happy path: register -> login -> me', async(t) => {
        const email = `smoke-auth-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
        const password = 'password123';
        const name = 'Smoke Auth User';

        t.after(async() => {
            await prisma.user.deleteMany({
                where: { email }
            });
        });

        const registerResponse = await request(app)
            .post('/api/auth/register')
            .send({
                name,
                email,
                password
            })
            .expect(201);

        assert.equal(registerResponse.body.message, 'User created successfully');
        assert.equal(registerResponse.body.user.name, name);
        assert.equal(registerResponse.body.user.email, email);
        assert.equal(registerResponse.body.user.role, 'REQUESTER');
        assert.ok(registerResponse.body.user.id);

        const loginResponse = await loginUser(app, { email, password });

        assert.equal(loginResponse.body.message, 'Login successful');
        assert.equal(loginResponse.body.user.email, email);
        assert.equal(loginResponse.body.user.role, 'REQUESTER');
        assert.ok(typeof loginResponse.body.token === 'string' && loginResponse.body.token.length > 0);

        const meResponse = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${loginResponse.body.token}`)
            .expect(200);

        assert.equal(meResponse.body.user.id, registerResponse.body.user.id);
        assert.equal(meResponse.body.user.name, name);
        assert.equal(meResponse.body.user.email, email);
        assert.equal(meResponse.body.user.role, 'REQUESTER');
        assert.ok(typeof meResponse.body.user.createdAt === 'string');
        assert.ok(typeof meResponse.body.user.updatedAt === 'string');
    });

    test('public register rejects elevated role assignment', async(t) => {
        const email = `smoke-auth-reject-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

        t.after(async() => {
            await prisma.user.deleteMany({
                where: { email }
            });
        });

        const registerResponse = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Elevated Role Attempt',
                email,
                password: 'password123',
                role: 'ADMIN'
            })
            .expect(403);

        assert.equal(
            registerResponse.body.error,
            'Публичная регистрация создаёт только роль заявителя. Остальные роли администратор назначает отдельно.'
        );

        const createdUser = await prisma.user.findUnique({
            where: { email }
        });

        assert.equal(createdUser, null);
    });
}
