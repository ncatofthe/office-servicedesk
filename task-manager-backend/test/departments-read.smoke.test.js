const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'departments read smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('departments list returns only active departments for authenticated users', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const user = await createTestUser(prisma, {
            email: `departments-read-${runId}@example.com`,
            password,
            name: 'Departments Read User',
            role: 'REQUESTER'
        });

        const activeDepartment = await prisma.department.create({
            data: {
                name: `Departments Active ${runId}`,
                code: `ACT${runId.slice(-6)}`,
                isActive: true
            }
        });
        const inactiveDepartment = await prisma.department.create({
            data: {
                name: `Departments Inactive ${runId}`,
                code: `INA${runId.slice(-6)}`,
                isActive: false
            }
        });

        t.after(async() => {
            await prisma.department.deleteMany({
                where: {
                    id: { in: [activeDepartment.id, inactiveDepartment.id] }
                }
            });
            await prisma.user.deleteMany({
                where: { id: user.id }
            });
        });

        const token = (await loginUser(app, {
            email: user.email,
            password
        })).body.token;

        const response = await request(app)
            .get('/api/departments')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        const activeIds = response.body.map((department) => department.id);

        assert.ok(activeIds.includes(activeDepartment.id));
        assert.ok(!activeIds.includes(inactiveDepartment.id));

        const returnedActiveDepartment = response.body.find((department) => department.id === activeDepartment.id);
        assert.deepEqual(Object.keys(returnedActiveDepartment).sort(), ['code', 'id', 'isActive', 'name']);
        assert.equal(returnedActiveDepartment.name, activeDepartment.name);
        assert.equal(returnedActiveDepartment.code, activeDepartment.code);
        assert.equal(returnedActiveDepartment.isActive, true);
    });
}
