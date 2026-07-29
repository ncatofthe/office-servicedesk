#!/usr/bin/env node

require('dotenv').config();
process.env.EMAIL_OUTBOUND_ENABLED = 'false';

const prisma = require('../src/prisma/prisma.js');
const { parseAndProcessRawMessage } = require('../src/services/email-intake.service.js');
const { sendTaskEmailReply } = require('../src/services/email-outbound.service.js');

const timestamp = Date.now();
const rawMessage = [
    `From: "Email Reply Smoke" <email-reply-smoke-${timestamp}@example.com>`,
    `Message-ID: <email-reply-smoke-${timestamp}@taskmanager.local>`,
    'Subject: Проверка ответа по email',
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Здравствуйте.',
    '',
    'Это входящее письмо для smoke-проверки email reply.'
].join('\r\n');

const main = async() => {
    const admin = await prisma.user.findUnique({
        where: { email: 'admin@taskmanager.com' },
        select: { id: true, role: true }
    });

    if (!admin) {
        throw new Error('Admin user not found. Run npm run prisma:seed first.');
    }

    const intakeResult = await parseAndProcessRawMessage(Buffer.from(rawMessage, 'utf8'), {
        mailbox: 'REPLY_SMOKE',
        uid: Math.floor(timestamp % 2147483647)
    });

    if (intakeResult.skipped || !intakeResult.taskId) {
        throw new Error('Email reply smoke could not create a test email task.');
    }

    const replyResult = await sendTaskEmailReply(
        intakeResult.taskId,
        'Здравствуйте. Ответ получен, заявка принята в работу.',
        admin
    );

    if (!replyResult.dryRun) {
        throw new Error('Email reply smoke attempted a real send.');
    }
    if (!replyResult.recipient || !replyResult.subject || !replyResult.commentId || !replyResult.outboxId) {
        throw new Error('Email reply smoke returned incomplete result.');
    }

    const outboxRecord = await prisma.emailOutboundMessage.findUnique({
        where: {
            id: replyResult.outboxId
        }
    });
    if (!outboxRecord || outboxRecord.status !== 'DRY_RUN') {
        throw new Error('Email reply smoke did not persist dry-run outbox record.');
    }

    console.log('Email reply smoke OK:', {
        taskId: replyResult.taskId,
        dryRun: replyResult.dryRun,
        recipient: replyResult.recipient,
        subject: replyResult.subject,
        commentId: replyResult.commentId,
        outboxId: replyResult.outboxId
    });
};

main()
    .catch((error) => {
        console.error('Email reply smoke failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
