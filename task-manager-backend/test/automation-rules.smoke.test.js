const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'automation rules smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
        { skip: 'Missing test DATABASE_URL/JWT_SECRET' },
        () => {}
    );
} else {
    const request = require('supertest');
    const app = require('../src/app.js');
    const prisma = require('../src/prisma/prisma.js');
    const emailIntakeService = require('../src/services/email-intake.service.js');
    const { createTestUser, loginUser } = require('../test-support/auth-test-utils.cjs');

    after(async() => {
        await prisma.$disconnect();
    });

    test('automation rules support admin CRUD, dry-run, sequential web execution and error logging', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const admin = await createTestUser(prisma, {
            email: `automation-admin-${runId}@example.com`,
            password,
            name: 'Automation Admin',
            role: 'ADMIN'
        });
        const requester = await createTestUser(prisma, {
            email: `automation-requester-${runId}@example.com`,
            password,
            name: 'Automation Requester',
            role: 'REQUESTER'
        });
        const assigneeOne = await createTestUser(prisma, {
            email: `automation-assignee-one-${runId}@example.com`,
            password,
            name: 'Automation Assignee One',
            role: 'AGENT'
        });
        const assigneeTwo = await createTestUser(prisma, {
            email: `automation-assignee-two-${runId}@example.com`,
            password,
            name: 'Automation Assignee Two',
            role: 'AGENT'
        });

        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Automation folder ${runId}`
            }
        });
        const entity = await prisma.ticketEntity.create({
            data: {
                name: `Automation entity ${runId}`,
                code: `AUTO_ENTITY_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`
            }
        });
        const type = await prisma.ticketType.create({
            data: {
                name: `Automation type ${runId}`,
                code: `AUTO_TYPE_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 42)}`,
                folderId: folder.id,
                entityId: entity.id
            }
        });
        const subtype = await prisma.ticketSubtype.create({
            data: {
                name: `Automation subtype ${runId}`,
                code: `AUTO_SUBTYPE_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 38)}`,
                typeId: type.id,
                folderId: folder.id
            }
        });
        const dryRunTask = await prisma.task.create({
            data: {
                title: `VPN setup ${runId}`,
                description: 'Task for dry-run testing',
                authorId: requester.id
            }
        });

        t.after(async() => {
            await prisma.automationRun.deleteMany({
                where: {
                    OR: [
                        { taskId: dryRunTask.id },
                        { ruleName: { contains: runId } }
                    ]
                }
            });
            await prisma.task.deleteMany({
                where: {
                    title: {
                        contains: runId
                    }
                }
            });
            await prisma.automationRule.deleteMany({
                where: {
                    name: {
                        contains: runId
                    }
                }
            });
            await prisma.ticketSubtype.deleteMany({ where: { id: subtype.id } });
            await prisma.ticketType.deleteMany({ where: { id: type.id } });
            await prisma.ticketEntity.deleteMany({ where: { id: entity.id } });
            await prisma.ticketFolder.deleteMany({ where: { id: folder.id } });
            await prisma.user.deleteMany({
                where: {
                    id: {
                        in: [admin.id, requester.id, assigneeOne.id, assigneeTwo.id]
                    }
                }
            });
        });

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;
        const requesterToken = (await loginUser(app, { email: requester.email, password })).body.token;

        const ruleOneResponse = await request(app)
            .post('/api/servicedesk/admin/automation-rules')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Rule 1 ${runId}`,
                description: 'Populate ServiceDesk refs for VPN requests',
                sortOrder: 10,
                triggerType: 'TASK_CREATED',
                conditions: {
                    channel: 'WEB',
                    titleContains: 'vpn'
                },
                actions: {
                    setFolderId: folder.id,
                    setEntityId: entity.id,
                    setTypeId: type.id,
                    setSubtypeId: subtype.id,
                    setPriority: 'HIGH'
                }
            })
            .expect(201);
        const ruleOne = ruleOneResponse.body;
        assert.equal(ruleOne.sortOrder, 10);
        assert.equal(ruleOne.conditions.channel, 'WEB');
        assert.equal(ruleOne.actions.setFolderId, folder.id);

        const ruleTwoResponse = await request(app)
            .post('/api/servicedesk/admin/automation-rules')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Rule 2 ${runId}`,
                sortOrder: 20,
                triggerType: 'TASK_CREATED',
                conditions: {
                    folderId: folder.id,
                    priority: 'HIGH'
                },
                actions: {
                    setAssigneeIds: [assigneeOne.id, assigneeTwo.id]
                }
            })
            .expect(201);
        const ruleTwo = ruleTwoResponse.body;

        const ruleThreeResponse = await request(app)
            .post('/api/servicedesk/admin/automation-rules')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Rule 3 ${runId}`,
                sortOrder: 30,
                triggerType: 'TASK_CREATED',
                conditions: {
                    titleContains: 'bad-subtype'
                },
                actions: {
                    setSubtypeId: subtype.id
                }
            })
            .expect(201);
        const ruleThree = ruleThreeResponse.body;

        const rulesList = await request(app)
            .get('/api/servicedesk/admin/automation-rules')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        const listedRuleIds = rulesList.body
            .filter((rule) => rule.name.includes(runId))
            .map((rule) => rule.id);
        assert.deepEqual(listedRuleIds, [ruleOne.id, ruleTwo.id, ruleThree.id]);

        const dryRunResponse = await request(app)
            .post(`/api/servicedesk/admin/automation-rules/${ruleOne.id}/test`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ taskId: dryRunTask.id })
            .expect(200);
        assert.equal(dryRunResponse.body.dryRun, true);
        assert.equal(dryRunResponse.body.matched, true);
        assert.equal(dryRunResponse.body.success, true);
        assert.equal(dryRunResponse.body.appliedActions.setFolderId, folder.id);
        assert.equal(dryRunResponse.body.resultingTask.typeId, type.id);
        assert.equal(dryRunResponse.body.resultingTask.subtypeId, subtype.id);

        const createdTaskResponse = await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${requesterToken}`)
            .send({
                title: `VPN access request ${runId}`,
                description: 'Please prepare access'
            })
            .expect(201);
        const createdTask = createdTaskResponse.body;
        assert.equal(createdTask.folderId, folder.id);
        assert.equal(createdTask.entityId, entity.id);
        assert.equal(createdTask.typeId, type.id);
        assert.equal(createdTask.subtypeId, subtype.id);
        assert.equal(createdTask.priority, 'HIGH');
        assert.deepEqual(
            createdTask.assignees.map((assignee) => assignee.userId).sort(),
            [assigneeOne.id, assigneeTwo.id].sort()
        );

        const automationRunsResponse = await request(app)
            .get(`/api/servicedesk/admin/automation-runs?taskId=${createdTask.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        assert.equal(automationRunsResponse.body.length, 2);
        assert.deepEqual(
            automationRunsResponse.body.map((run) => run.status),
            ['SUCCESS', 'SUCCESS']
        );
        assert.deepEqual(
            automationRunsResponse.body.map((run) => run.ruleId).sort(),
            [ruleOne.id, ruleTwo.id].sort()
        );

        const badTaskResponse = await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${requesterToken}`)
            .send({
                title: `bad-subtype request ${runId}`,
                description: 'This should log an automation error but still create the task'
            })
            .expect(201);
        const badTask = badTaskResponse.body;
        assert.equal(badTask.typeId, null);
        assert.equal(badTask.subtypeId, null);

        const badTaskRunsResponse = await request(app)
            .get(`/api/servicedesk/admin/automation-runs?taskId=${badTask.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        assert.equal(badTaskRunsResponse.body.length, 1);
        assert.equal(badTaskRunsResponse.body[0].status, 'ERROR');
        assert.match(badTaskRunsResponse.body[0].errorMessage, /тип заявки/i);

        const updatedRuleTwoResponse = await request(app)
            .put(`/api/servicedesk/admin/automation-rules/${ruleTwo.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                description: 'Updated assignee rule',
                sortOrder: 25,
                actions: {
                    setAssigneeIds: [assigneeOne.id]
                }
            })
            .expect(200);
        assert.equal(updatedRuleTwoResponse.body.description, 'Updated assignee rule');
        assert.equal(updatedRuleTwoResponse.body.sortOrder, 25);
        assert.deepEqual(updatedRuleTwoResponse.body.actions.setAssigneeIds, [assigneeOne.id]);

        const fetchedRuleTwoResponse = await request(app)
            .get(`/api/servicedesk/admin/automation-rules/${ruleTwo.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        assert.equal(fetchedRuleTwoResponse.body.sortOrder, 25);

        await request(app)
            .delete(`/api/servicedesk/admin/automation-rules/${ruleThree.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
    });

    test('email intake uses EMAIL_TICKET_CREATED automation rules', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const admin = await createTestUser(prisma, {
            email: `automation-email-admin-${runId}@example.com`,
            password,
            name: 'Automation Email Admin',
            role: 'ADMIN'
        });
        const assignee = await createTestUser(prisma, {
            email: `automation-email-assignee-${runId}@example.com`,
            password,
            name: 'Automation Email Assignee',
            role: 'AGENT'
        });

        t.after(async() => {
            await prisma.automationRun.deleteMany({
                where: {
                    ruleName: { contains: runId }
                }
            });
            await prisma.emailInboundMessage.deleteMany({
                where: {
                    messageId: `automation-email-${runId}@example.com`
                }
            });
            await prisma.task.deleteMany({
                where: {
                    title: {
                        contains: runId
                    }
                }
            });
            await prisma.automationRule.deleteMany({
                where: {
                    name: {
                        contains: runId
                    }
                }
            });
            await prisma.user.deleteMany({
                where: {
                    OR: [
                        { id: admin.id },
                        { id: assignee.id },
                        { email: `requester-${runId}@example.com` }
                    ]
                }
            });
        });

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;

        await request(app)
            .post('/api/servicedesk/admin/automation-rules')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Email rule ${runId}`,
                sortOrder: 5,
                triggerType: 'EMAIL_TICKET_CREATED',
                conditions: {
                    channel: 'EMAIL',
                    requesterEmailContains: `requester-${runId}@example.com`,
                    titleContains: 'printer'
                },
                actions: {
                    setPriority: 'URGENT',
                    setAssigneeIds: [assignee.id]
                }
            })
            .expect(201);

        const intakeResult = await emailIntakeService.processParsedEmailMessage({
            from: {
                value: [
                    {
                        address: `requester-${runId}@example.com`,
                        name: 'Email Requester'
                    }
                ]
            },
            subject: `Printer issue ${runId}`,
            text: 'Please fix the printer',
            attachments: [],
            messageId: `automation-email-${runId}@example.com`,
            date: new Date()
        }, {
            mailbox: `AUTOMATION-${runId}`,
            uid: 1
        });

        assert.equal(intakeResult.skipped, false);
        assert.ok(intakeResult.taskId);

        const createdTask = await prisma.task.findUnique({
            where: { id: intakeResult.taskId },
            include: {
                assignees: {
                    select: {
                        userId: true
                    }
                }
            }
        });
        assert.equal(createdTask.priority, 'URGENT');
        assert.deepEqual(createdTask.assignees.map((item) => item.userId), [assignee.id]);

        const runs = await prisma.automationRun.findMany({
            where: { taskId: intakeResult.taskId },
            orderBy: { createdAt: 'desc' }
        });
        assert.equal(runs.length, 1);
        assert.equal(runs[0].triggerType, 'EMAIL_TICKET_CREATED');
        assert.equal(runs[0].status, 'SUCCESS');
    });
}
