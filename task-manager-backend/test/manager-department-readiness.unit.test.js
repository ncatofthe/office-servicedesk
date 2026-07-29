const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDepartmentLookup,
    evaluateManagerDepartmentReadiness,
    backfillManagerDepartmentReadiness
} = require('../src/utils/manager-department-readiness.js');

test('manager readiness audit detects missing memberships and offers safe legacy backfill', () => {
    const departmentLookup = buildDepartmentLookup([
        {
            id: 'department-finance',
            name: 'Finance',
            code: 'FIN',
            isActive: true
        }
    ]);

    const report = evaluateManagerDepartmentReadiness({
        id: 'manager-1',
        name: 'Manager One',
        email: 'manager-1@example.com',
        role: 'MANAGER',
        department: '  finance  ',
        departmentMemberships: [],
        headedDepartments: []
    }, departmentLookup);

    assert.equal(report.status, 'auto_fixable');
    assert.ok(report.issues.includes('missing_memberships'));
    assert.equal(report.autoFix.type, 'set_primary_membership');
    assert.equal(report.autoFix.departmentId, 'department-finance');
    assert.equal(report.autoFix.source, 'legacy_department');
    assert.equal(report.autoFix.createsMembership, true);
});

test('manager readiness backfill applies unambiguous legacy membership mapping', async() => {
    const calls = [];
    const db = {
        user: {
            findMany: async() => ([
                {
                    id: 'manager-2',
                    name: 'Manager Two',
                    email: 'manager-2@example.com',
                    role: 'MANAGER',
                    department: 'Operations',
                    departmentMemberships: [],
                    headedDepartments: []
                }
            ])
        },
        department: {
            findMany: async() => ([
                {
                    id: 'department-operations',
                    name: 'Operations',
                    code: 'OPS',
                    isActive: true
                }
            ])
        },
        userDepartment: {
            upsert: async(args) => {
                calls.push({ type: 'userDepartment.upsert', args });
                return args;
            },
            updateMany: async(args) => {
                calls.push({ type: 'userDepartment.updateMany', args });
                return args;
            }
        }
    };

    const result = await backfillManagerDepartmentReadiness(db, { apply: true });

    assert.equal(result.apply, true);
    assert.equal(result.autoFixableManagers, 1);
    assert.equal(result.plannedActions.length, 1);
    assert.equal(result.plannedActions[0].applied, true);
    assert.equal(result.plannedActions[0].departmentId, 'department-operations');
    assert.equal(result.plannedActions[0].source, 'legacy_department');
    assert.equal(calls[0].type, 'userDepartment.upsert');
    assert.deepEqual(calls[0].args.where.userId_departmentId, {
        userId: 'manager-2',
        departmentId: 'department-operations'
    });
    assert.equal(calls[1].type, 'userDepartment.updateMany');
});

test('manager readiness backfill preserves already valid memberships', async() => {
    const calls = [];
    const db = {
        user: {
            findMany: async() => ([
                {
                    id: 'manager-3',
                    name: 'Manager Three',
                    email: 'manager-3@example.com',
                    role: 'MANAGER',
                    department: 'Engineering',
                    departmentMemberships: [
                        {
                            departmentId: 'department-engineering',
                            isPrimary: true,
                            department: {
                                id: 'department-engineering',
                                name: 'Engineering',
                                code: 'ENG',
                                isActive: true
                            }
                        }
                    ],
                    headedDepartments: []
                }
            ])
        },
        department: {
            findMany: async() => ([
                {
                    id: 'department-engineering',
                    name: 'Engineering',
                    code: 'ENG',
                    isActive: true
                }
            ])
        },
        userDepartment: {
            upsert: async(args) => {
                calls.push({ type: 'userDepartment.upsert', args });
                return args;
            },
            updateMany: async(args) => {
                calls.push({ type: 'userDepartment.updateMany', args });
                return args;
            }
        }
    };

    const result = await backfillManagerDepartmentReadiness(db, { apply: true });

    assert.equal(result.autoFixableManagers, 0);
    assert.equal(result.plannedActions.length, 0);
    assert.equal(result.manualReviewManagers.length, 0);
    assert.deepEqual(calls, []);
});
