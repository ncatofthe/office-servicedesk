const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'servicedesk admin configuration smoke test requires .env.test',
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

    test('admin configuration is RBAC-safe and rejects broken folder/team/assignee mappings', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const users = [];
        const folderIds = [];
        const teamIds = [];
        const typeIds = [];

        const admin = await createTestUser(prisma, {
            email: `config-admin-${runId}@example.com`,
            password,
            name: 'Configuration Admin',
            role: 'ADMIN'
        });
        const requester = await createTestUser(prisma, {
            email: `config-requester-${runId}@example.com`,
            password,
            name: 'Configuration Requester',
            role: 'REQUESTER'
        });
        const activeAgent = await createTestUser(prisma, {
            email: `config-agent-${runId}@example.com`,
            password,
            name: 'Configuration Agent',
            role: 'AGENT'
        });
        const inactiveAgent = await createTestUser(prisma, {
            email: `config-inactive-${runId}@example.com`,
            password,
            name: 'Inactive Configuration Agent',
            role: 'AGENT'
        });
        users.push(admin.id, requester.id, activeAgent.id, inactiveAgent.id);
        await prisma.user.update({ where: { id: inactiveAgent.id }, data: { isActive: false } });

        t.after(async() => {
            await prisma.automationRun.deleteMany({
                where: { ruleId: { startsWith: `config-rule-${runId}` } }
            });
            await prisma.automationRule.deleteMany({
                where: { name: { contains: runId } }
            });
            await prisma.slaPolicy.deleteMany({
                where: { name: { contains: runId } }
            });
            await prisma.task.deleteMany({
                where: { title: { contains: runId } }
            });
            await prisma.supportTeamMember.deleteMany({ where: { teamId: { in: teamIds } } });
            await prisma.supportTeamFolder.deleteMany({ where: { teamId: { in: teamIds } } });
            await prisma.supportTeam.deleteMany({ where: { id: { in: teamIds } } });
            await prisma.ticketSubtype.deleteMany({ where: { typeId: { in: typeIds } } });
            await prisma.ticketType.deleteMany({ where: { id: { in: typeIds } } });
            await prisma.ticketFolder.deleteMany({ where: { id: { in: folderIds } } });
            await prisma.user.deleteMany({ where: { id: { in: users } } });
        });

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;
        const requesterToken = (await loginUser(app, { email: requester.email, password })).body.token;

        const createFolder = async(name) => {
            const folder = (await request(app)
                .post('/api/servicedesk/admin/folders')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: `${name} ${runId}` })
                .expect(201)).body;
            folderIds.push(folder.id);
            return folder;
        };

        const folderA = await createFolder('Configuration folder A');
        const folderB = await createFolder('Configuration folder B');

        const type = (await request(app)
            .post('/api/servicedesk/admin/types')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Configuration type ${runId}`,
                code: `CONFIG_TYPE_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 45)}`,
                folderId: folderA.id
            })
            .expect(201)).body;
        typeIds.push(type.id);

        await request(app)
            .post('/api/servicedesk/admin/subtypes')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Broken subtype ${runId}`,
                typeId: type.id,
                folderId: folderB.id
            })
            .expect(400);

        await request(app)
            .post('/api/servicedesk/admin/sla-policies')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Broken SLA ${runId}`,
                folderId: folderB.id,
                typeId: type.id,
                resolutionMinutes: 60
            })
            .expect(400);

        const team = await prisma.supportTeam.create({
            data: {
                name: `Configuration team ${runId}`,
                folderId: null
            }
        });
        teamIds.push(team.id);
        await prisma.supportTeamFolder.create({
            data: { teamId: team.id, folderId: folderB.id }
        });

        const blockedFolderDelete = await request(app)
            .delete(`/api/servicedesk/admin/folders/${folderB.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(409);
        assert.equal(blockedFolderDelete.body.blockers.teamAccesses, 1);

        await request(app)
            .post(`/api/servicedesk/admin/teams/${team.id}/members`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: requester.id })
            .expect(400);

        await request(app)
            .post(`/api/servicedesk/admin/teams/${team.id}/members`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: inactiveAgent.id })
            .expect(400);

        await request(app)
            .post(`/api/servicedesk/admin/teams/${team.id}/members`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: activeAgent.id, role: 'Исполнитель' })
            .expect(201);

        await request(app)
            .post('/api/servicedesk/admin/automation-rules')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Configuration automation ${runId}`,
                triggerType: 'TASK_CREATED',
                actions: { setAssigneeIds: [inactiveAgent.id] }
            })
            .expect(400);

        await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                title: `Configuration inactive assignee ${runId}`,
                description: 'Must be rejected before persistence.',
                assigneeIds: [inactiveAgent.id]
            })
            .expect(400);

        await request(app)
            .get('/api/servicedesk/admin/teams')
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(403);

        const publicFolders = (await request(app)
            .get('/api/servicedesk/folders')
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(200)).body;
        const publicFolder = publicFolders.find((item) => item.id === folderB.id);
        assert.ok(publicFolder);
        assert.equal(Object.prototype.hasOwnProperty.call(publicFolder, 'counts'), false);

        const publicTeams = (await request(app)
            .get('/api/servicedesk/teams')
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(200)).body;
        const publicTeam = publicTeams.find((item) => item.id === team.id);
        assert.ok(publicTeam);
        assert.equal(Object.prototype.hasOwnProperty.call(publicTeam, 'members'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(publicTeam, 'counts'), false);

        const managedTeams = (await request(app)
            .get('/api/servicedesk/admin/teams')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)).body;
        const managedTeam = managedTeams.find((item) => item.id === team.id);
        assert.equal(managedTeam.members.length, 1);
        assert.equal(managedTeam.members[0].user.email, activeAgent.email);
        assert.equal(managedTeam.counts.folders, 1);
    });
}
