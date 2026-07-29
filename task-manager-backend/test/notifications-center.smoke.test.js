const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'notifications center smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
        { skip: 'Missing test DATABASE_URL/JWT_SECRET' },
        () => {}
    );
} else {
    process.env.EMAIL_NOTIFICATIONS_ENABLED = 'true';
    process.env.EMAIL_OUTBOUND_ENABLED = 'false';
    process.env.PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'http://localhost:5173';

    const request = require('supertest');
    const app = require('../src/app.js');
    const prisma = require('../src/prisma/prisma.js');
    const notificationService = require('../src/services/notification.service.js');
    const { createTestUser, loginUser } = require('../test-support/auth-test-utils.cjs');

    after(async() => {
        await prisma.$disconnect();
    });

    test('notification center supports task-created, comments, dedupe and read-all', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';

        const requester = await createTestUser(prisma, {
            email: `notify-requester-${runId}@example.com`,
            password,
            name: 'Notify Requester',
            role: 'REQUESTER'
        });
        const folderAgent = await createTestUser(prisma, {
            email: `notify-agent-${runId}@example.com`,
            password,
            name: 'Notify Agent',
            role: 'AGENT'
        });
        const secondAgent = await createTestUser(prisma, {
            email: `notify-agent-2-${runId}@example.com`,
            password,
            name: 'Notify Agent Two',
            role: 'AGENT'
        });

        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Notifications folder ${runId}`
            }
        });
        const team = await prisma.supportTeam.create({
            data: {
                name: `Notifications team ${runId}`,
                folderId: folder.id
            }
        });
        await prisma.supportTeamMember.createMany({
            data: [
                { teamId: team.id, userId: folderAgent.id, role: 'Исполнитель', isLead: true },
                { teamId: team.id, userId: secondAgent.id, role: 'Исполнитель', isLead: false }
            ],
            skipDuplicates: true
        });

        t.after(async() => {
            await prisma.notification.deleteMany({
                where: {
                    userId: { in: [requester.id, folderAgent.id, secondAgent.id] }
                }
            });
            await prisma.emailOutboundMessage.deleteMany({
                where: {
                    OR: [
                        { recipientEmail: { in: [requester.email, folderAgent.email, secondAgent.email] } },
                        { createdById: { in: [requester.id, folderAgent.id, secondAgent.id] } }
                    ]
                }
            });
            await prisma.task.deleteMany({
                where: {
                    authorId: requester.id,
                    title: { contains: `Notifications task ${runId}` }
                }
            });
            await prisma.supportTeamMember.deleteMany({ where: { teamId: team.id } });
            await prisma.supportTeam.deleteMany({ where: { id: team.id } });
            await prisma.ticketFolder.deleteMany({ where: { id: folder.id } });
            await prisma.user.deleteMany({
                where: {
                    id: { in: [requester.id, folderAgent.id, secondAgent.id] }
                }
            });
        });

        const requesterToken = (await loginUser(app, { email: requester.email, password })).body.token;
        const agentToken = (await loginUser(app, { email: folderAgent.email, password })).body.token;

        const createdTaskResponse = await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${requesterToken}`)
            .send({
                title: `Notifications task ${runId}`,
                description: 'Task for notifications smoke test',
                folderId: folder.id
            })
            .expect(201);

        const taskId = createdTaskResponse.body.id;

        const agentUnreadAfterCreate = await request(app)
            .get('/api/notifications/unread-count')
            .set('Authorization', `Bearer ${agentToken}`)
            .expect(200);
        assert.equal(agentUnreadAfterCreate.body.unreadCount, 1);

        const agentNotifications = await request(app)
            .get('/api/notifications?limit=10')
            .set('Authorization', `Bearer ${agentToken}`)
            .expect(200);
        assert.equal(agentNotifications.body.items.length, 1);
        assert.equal(agentNotifications.body.items[0].taskId, taskId);
        assert.match(agentNotifications.body.items[0].title, /Новая заявка/);

        const markSingleReadResult = await request(app)
            .patch(`/api/notifications/${agentNotifications.body.items[0].id}/read`)
            .set('Authorization', `Bearer ${agentToken}`)
            .expect(200);
        assert.equal(markSingleReadResult.body.isRead, true);

        const initialAgentNotificationCount = await prisma.notification.count({
            where: {
                userId: folderAgent.id,
                taskId
            }
        });
        await notificationService.notifyTaskCreated(taskId, requester, { channel: 'WEB' });
        const afterDedupeCount = await prisma.notification.count({
            where: {
                userId: folderAgent.id,
                taskId
            }
        });
        assert.equal(afterDedupeCount, initialAgentNotificationCount);

        const initialOutboxCount = await prisma.emailOutboundMessage.count({
            where: {
                taskId,
                recipientEmail: folderAgent.email
            }
        });
        assert.equal(initialOutboxCount, 1);

        await notificationService.createNotification({
            userId: folderAgent.id,
            type: 'manual_rc_check',
            title: 'Проверка unread',
            message: 'Проверка отметки всех уведомлений прочитанными',
            eventKey: `manual-rc-check:${runId}`
        });

        const readAllResult = await request(app)
            .patch('/api/notifications/read-all')
            .set('Authorization', `Bearer ${agentToken}`)
            .expect(200);
        assert.equal(readAllResult.body.updatedCount, 1);

        const agentUnreadAfterReadAll = await request(app)
            .get('/api/notifications/unread-count')
            .set('Authorization', `Bearer ${agentToken}`)
            .expect(200);
        assert.equal(agentUnreadAfterReadAll.body.unreadCount, 0);

        await request(app)
            .post(`/api/comments/${taskId}`)
            .set('Authorization', `Bearer ${agentToken}`)
            .send({
                content: 'Публичный ответ исполнителя',
                visibility: 'PUBLIC'
            })
            .expect(201);

        const requesterNotifications = await request(app)
            .get('/api/notifications?unreadOnly=true&limit=10')
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(200);
        assert.equal(requesterNotifications.body.items.length, 1);
        assert.match(requesterNotifications.body.items[0].title, /Новый ответ по заявке/);

        const requesterOutboxCount = await prisma.emailOutboundMessage.count({
            where: {
                taskId,
                recipientEmail: requester.email
            }
        });
        assert.equal(requesterOutboxCount, 1);

        const requesterUnreadBeforeInternal = await request(app)
            .get('/api/notifications/unread-count')
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(200);

        await request(app)
            .post(`/api/comments/${taskId}`)
            .set('Authorization', `Bearer ${agentToken}`)
            .send({
                content: 'Внутренняя заметка исполнителя',
                visibility: 'INTERNAL'
            })
            .expect(201);

        const requesterUnreadAfterInternal = await request(app)
            .get('/api/notifications/unread-count')
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(200);
        assert.equal(requesterUnreadAfterInternal.body.unreadCount, requesterUnreadBeforeInternal.body.unreadCount);

        const secondAgentNotifications = await prisma.notification.findMany({
            where: {
                userId: secondAgent.id,
                taskId
            },
            orderBy: { createdAt: 'desc' }
        });
        assert.ok(secondAgentNotifications.some((item) => item.title === 'Новая внутренняя заметка'));
    });
}
