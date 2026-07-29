#!/usr/bin/env node

require('dotenv').config();

const prisma = require('../src/prisma/prisma.js');
const { parseAndProcessRawMessage } = require('../src/services/email-intake.service.js');

const now = new Date();
const uid = Math.floor(Date.now() / 1000);
const rawMessage = [
    'From: "Email Smoke User" <email-smoke@example.com>',
    `Message-ID: <email-smoke-${Date.now()}@taskmanager.local>`,
    'Subject: Проверка заявки из email',
    `Date: ${now.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Здравствуйте.',
    '',
    'Это smoke-письмо для проверки создания заявки из email.',
    'Нужно убедиться, что создаётся внешний пользователь и заявка.'
].join('\r\n');

const main = async() => {
    const result = await parseAndProcessRawMessage(Buffer.from(rawMessage, 'utf8'), {
        mailbox: 'SMOKE',
        uid
    });

    console.log(JSON.stringify(result, null, 2));

    if (result.skipped || !result.taskId || !result.userId) {
        throw new Error('Email intake smoke did not create a task and user link.');
    }
};

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
