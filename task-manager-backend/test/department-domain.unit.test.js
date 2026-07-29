const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    serializeCurrentUser
} = require('../src/serializers/auth.serializer.js');
const {
    syncUserPrimaryDepartmentMembership
} = require('../src/utils/department-membership.js');

test('current user serialization exposes normalized department memberships from relations', () => {
    const serialized = serializeCurrentUser({
        id: 'user-1',
        name: 'Department User',
        email: 'department-user@example.com',
        role: 'MANAGER',
        department: 'Legacy Development',
        position: 'Team Lead',
        skills: ['coordination'],
        createdAt: new Date('2026-04-04T10:00:00.000Z'),
        updatedAt: new Date('2026-04-04T11:00:00.000Z'),
        departmentMemberships: [
            {
                id: 'membership-secondary',
                userId: 'user-1',
                departmentId: 'department-finance',
                isPrimary: false,
                department: {
                    id: 'department-finance',
                    name: 'Finance',
                    code: 'FIN',
                    headUserId: 'head-finance',
                    isActive: true
                }
            },
            {
                id: 'membership-primary',
                userId: 'user-1',
                departmentId: 'department-development',
                isPrimary: true,
                department: {
                    id: 'department-development',
                    name: 'Development',
                    code: 'DEV',
                    headUserId: 'head-development',
                    isActive: true
                }
            }
        ]
    });

    assert.equal(serialized.departmentMemberships.length, 2);
    assert.equal(serialized.departmentMemberships[0].department.name, 'Development');
    assert.equal(serialized.departmentMemberships[0].isPrimary, true);
    assert.equal(serialized.departmentMemberships[1].department.name, 'Finance');
    assert.equal(serialized.primaryDepartment.name, 'Development');
    assert.equal(serialized.department, 'Legacy Development');
});

test('current user serialization falls back to legacy department string when memberships are absent', () => {
    const serialized = serializeCurrentUser({
        id: 'user-legacy',
        name: 'Legacy User',
        email: 'legacy-user@example.com',
        role: 'EMPLOYEE',
        department: '  Support  ',
        createdAt: new Date('2026-04-04T10:00:00.000Z'),
        updatedAt: new Date('2026-04-04T11:00:00.000Z')
    });

    assert.equal(serialized.departmentMemberships.length, 1);
    assert.equal(serialized.departmentMemberships[0].department.name, 'Support');
    assert.equal(serialized.departmentMemberships[0].department.id, null);
    assert.equal(serialized.primaryDepartment.name, 'Support');
});

test('department sync normalizes names and keeps a single primary membership', async() => {
    const calls = [];
    const db = {
        department: {
            upsert: async(args) => {
                calls.push({ type: 'department.upsert', args });
                return {
                    id: 'department-development',
                    name: args.where.name,
                    code: null,
                    headUserId: null,
                    isActive: true
                };
            }
        },
        userDepartment: {
            upsert: async(args) => {
                calls.push({ type: 'userDepartment.upsert', args });
                return args;
            },
            updateMany: async(args) => {
                calls.push({ type: 'userDepartment.updateMany', args });
                return { count: 1 };
            }
        }
    };

    const department = await syncUserPrimaryDepartmentMembership(db, 'user-42', '  Development   Team  ');

    assert.equal(department.name, 'Development Team');
    assert.equal(calls[0].type, 'department.upsert');
    assert.equal(calls[0].args.where.name, 'Development Team');
    assert.deepEqual(calls[1].args.where.userId_departmentId, {
        userId: 'user-42',
        departmentId: 'department-development'
    });
    assert.deepEqual(calls[2].args.where, {
        userId: 'user-42',
        NOT: {
            departmentId: 'department-development'
        }
    });
});
