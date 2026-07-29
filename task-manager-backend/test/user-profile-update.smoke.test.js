const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'user profile update smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
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

    test('admin profile edits persist position, skills, and latest primary department cleanly', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const admin = await createTestUser(prisma, {
            email: `user-profile-admin-${runId}@example.com`,
            password,
            name: 'User Profile Admin',
            role: 'ADMIN'
        });
        const employee = await createTestUser(prisma, {
            email: `user-profile-employee-${runId}@example.com`,
            password,
            name: 'User Profile Employee',
            role: 'EMPLOYEE'
        });

        const firstDepartmentName = `Department Alpha ${runId}`;
        const secondDepartmentName = `Department Beta ${runId}`;

        t.after(async() => {
            await prisma.userDepartment.deleteMany({
                where: {
                    userId: employee.id
                }
            });
            await prisma.department.deleteMany({
                where: {
                    name: {
                        in: [firstDepartmentName, secondDepartmentName]
                    }
                }
            });
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [admin.id, employee.id]
                    }
                }
            });
        });

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;

        await request(app)
            .put(`/api/users/${employee.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                department: firstDepartmentName,
                position: 'QA Lead',
                skills: ['PostgreSQL', 'Regression']
            })
            .expect(200);

        let profileResponse = await request(app)
            .get(`/api/users/${employee.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        assert.equal(profileResponse.body.department, firstDepartmentName);
        assert.equal(profileResponse.body.primaryDepartment?.name, firstDepartmentName);
        assert.equal(profileResponse.body.position, 'QA Lead');
        assert.deepEqual(profileResponse.body.skills, ['PostgreSQL', 'Regression']);

        await request(app)
            .put(`/api/users/${employee.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                department: secondDepartmentName,
                position: 'Operations Manager',
                skills: ['Operations', 'Planning']
            })
            .expect(200);

        profileResponse = await request(app)
            .get(`/api/users/${employee.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        assert.equal(profileResponse.body.department, secondDepartmentName);
        assert.equal(profileResponse.body.primaryDepartment?.name, secondDepartmentName);
        assert.equal(profileResponse.body.position, 'Operations Manager');
        assert.deepEqual(profileResponse.body.skills, ['Operations', 'Planning']);
        assert.ok(
            profileResponse.body.departmentMemberships.some((membership) => (
                membership.department?.name === secondDepartmentName && membership.isPrimary
            ))
        );

        await request(app)
            .put(`/api/users/${employee.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                department: null
            })
            .expect(200);

        profileResponse = await request(app)
            .get(`/api/users/${employee.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        assert.equal(profileResponse.body.department, null);
        assert.equal(profileResponse.body.primaryDepartment, null);
        assert.equal(profileResponse.body.position, 'Operations Manager');
        assert.deepEqual(profileResponse.body.skills, ['Operations', 'Planning']);
    });
}
