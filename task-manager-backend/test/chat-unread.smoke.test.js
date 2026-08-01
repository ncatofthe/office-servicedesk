const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'chat unread smoke test requires .env.test',
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

    test('direct chat exposes one aggregated unread count and clears it after reading', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const sender = await createTestUser(prisma, {
            email: `chat-sender-${runId}@example.com`,
            password,
            name: 'Chat Sender',
            role: 'AGENT'
        });
        const recipient = await createTestUser(prisma, {
            email: `chat-recipient-${runId}@example.com`,
            password,
            name: 'Chat Recipient',
            role: 'REQUESTER'
        });
        let chatId = null;

        t.after(async() => {
            if (chatId) {
                await prisma.chatThread.deleteMany({ where: { id: chatId } });
            }
            await prisma.user.deleteMany({ where: { id: { in: [sender.id, recipient.id] } } });
        });

        const senderToken = (await loginUser(app, { email: sender.email, password })).body.token;
        const recipientToken = (await loginUser(app, { email: recipient.email, password })).body.token;

        const createdChat = await request(app)
            .post('/api/chats/direct')
            .set('Authorization', `Bearer ${senderToken}`)
            .send({ userId: recipient.id })
            .expect(201);

        chatId = createdChat.body.id;
        assert.equal(createdChat.body.kind, 'DIRECT');
        assert.equal(createdChat.body.unreadCount, 0);

        await request(app)
            .post(`/api/chats/${chatId}/messages`)
            .set('Authorization', `Bearer ${senderToken}`)
            .send({ content: `Unread message ${runId}` })
            .expect(201);

        const unreadBefore = await request(app)
            .get('/api/chats/unread-count')
            .set('Authorization', `Bearer ${recipientToken}`)
            .expect(200);
        assert.equal(unreadBefore.body.count, 1);

        const recipientChats = await request(app)
            .get('/api/chats')
            .set('Authorization', `Bearer ${recipientToken}`)
            .expect(200);
        const recipientChat = recipientChats.body.find((chat) => chat.id === chatId);
        assert.ok(recipientChat);
        assert.equal(recipientChat.unreadCount, 1);

        await request(app)
            .post(`/api/chats/${chatId}/read`)
            .set('Authorization', `Bearer ${recipientToken}`)
            .expect(200);

        const unreadAfter = await request(app)
            .get('/api/chats/unread-count')
            .set('Authorization', `Bearer ${recipientToken}`)
            .expect(200);
        assert.equal(unreadAfter.body.count, 0);
    });
}
