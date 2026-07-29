#!/usr/bin/env node
require('dotenv').config();

const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { getEmailIntakeConfig } = require('../src/services/email-intake.service.js');
const { getEmailOutboundConfig } = require('../src/services/email-outbound.service.js');

const toBoolean = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const maskValue = (value, visibleStart = 2, visibleEnd = 2) => {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }
    if (normalized.length <= visibleStart + visibleEnd) {
        return '*'.repeat(normalized.length);
    }
    return `${normalized.slice(0, visibleStart)}***${normalized.slice(-visibleEnd)}`;
};

const parseArgs = (argv) => ({
    connectImap: argv.includes('--connect-imap'),
    verifySmtp: argv.includes('--verify-smtp'),
    json: argv.includes('--json')
});

const buildCheck = (label, requiredSettings, config) => {
    const missing = requiredSettings
        .filter((setting) => !String(setting.value || '').trim())
        .map((setting) => setting.name);
    return {
        label,
        ready: missing.length === 0,
        missing,
        config
    };
};

const verifyImapConnection = async(config) => {
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.user,
            pass: config.password
        }
    });

    await client.connect();
    try {
        const lock = await client.getMailboxLock(config.mailbox);
        try {
            return {
                ok: true,
                mailbox: config.mailbox,
                exists: client.mailbox?.exists ?? null
            };
        } finally {
            lock.release();
        }
    } finally {
        await client.logout();
    }
};

const verifySmtpConnection = async(config) => {
    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.user,
            pass: config.password
        }
    });

    await transporter.verify();
    return { ok: true };
};

const printHumanReport = (report) => {
    console.log('Проверка Yandex email readiness');
    console.log('');
    console.log(`EMAIL_INTAKE_ENABLED: ${report.flags.emailIntakeEnabled}`);
    console.log(`EMAIL_OUTBOUND_ENABLED: ${report.flags.emailOutboundEnabled}`);
    console.log(`EMAIL_NOTIFICATIONS_ENABLED: ${report.flags.emailNotificationsEnabled}`);
    console.log('');

    for (const section of [report.imap, report.smtp]) {
        console.log(`${section.label}: ${section.ready ? 'готово' : 'неполная настройка'}`);
        console.log(`  host: ${section.config.host}`);
        console.log(`  port: ${section.config.port}`);
        console.log(`  secure: ${section.config.secure}`);
        console.log(`  user: ${section.config.userMasked || '(не задан)'}`);
        if (section.config.fromAddressMasked !== undefined) {
            console.log(`  from: ${section.config.fromAddressMasked || '(не задан)'}`);
        }
        if (section.config.mailbox !== undefined) {
            console.log(`  mailbox: ${section.config.mailbox}`);
        }
        if (section.missing.length > 0) {
            console.log(`  не хватает: ${section.missing.join(', ')}`);
        }
        if (section.connection) {
            console.log(`  connection: ${section.connection.ok ? 'ok' : 'failed'}`);
            if (section.connection.mailbox) {
                console.log(`  mailbox exists: ${section.connection.exists}`);
            }
            if (section.connection.error) {
                console.log(`  ошибка: ${section.connection.error}`);
            }
        }
        console.log('');
    }

    console.log('Безопасность: скрипт не печатает пароли и не отправляет реальные письма.');
    console.log('Опционально: --connect-imap проверяет IMAP-логин, --verify-smtp проверяет SMTP login/handshake без отправки письма.');
};

const main = async() => {
    const args = parseArgs(process.argv.slice(2));
    const imap = getEmailIntakeConfig();
    const smtp = getEmailOutboundConfig();

    const report = {
        flags: {
            emailIntakeEnabled: toBoolean(process.env.EMAIL_INTAKE_ENABLED),
            emailOutboundEnabled: toBoolean(process.env.EMAIL_OUTBOUND_ENABLED),
            emailNotificationsEnabled: toBoolean(process.env.EMAIL_NOTIFICATIONS_ENABLED)
        },
        imap: buildCheck('IMAP intake', [
            { name: 'EMAIL_IMAP_HOST', value: imap.host },
            { name: 'EMAIL_IMAP_PORT', value: imap.port },
            { name: 'EMAIL_IMAP_USER', value: imap.user },
            { name: 'EMAIL_IMAP_PASSWORD', value: imap.password }
        ], {
            host: imap.host,
            port: imap.port,
            secure: imap.secure,
            userMasked: maskValue(imap.user),
            mailbox: imap.mailbox,
            maxMessages: imap.maxMessages
        }),
        smtp: buildCheck('SMTP outbound', [
            { name: 'EMAIL_SMTP_HOST', value: smtp.host },
            { name: 'EMAIL_SMTP_PORT', value: smtp.port },
            { name: 'EMAIL_SMTP_USER', value: smtp.user },
            { name: 'EMAIL_SMTP_PASSWORD', value: smtp.password },
            { name: 'EMAIL_FROM_ADDRESS', value: smtp.fromAddress }
        ], {
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            userMasked: maskValue(smtp.user),
            fromAddressMasked: maskValue(smtp.fromAddress)
        })
    };

    if (args.connectImap && report.imap.ready) {
        try {
            report.imap.connection = await verifyImapConnection(imap);
        } catch (error) {
            report.imap.connection = { ok: false, error: error.message };
        }
    }

    if (args.verifySmtp && report.smtp.ready) {
        try {
            report.smtp.connection = await verifySmtpConnection(smtp);
        } catch (error) {
            report.smtp.connection = { ok: false, error: error.message };
        }
    }

    if (args.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printHumanReport(report);
    }

    if (!report.imap.ready || !report.smtp.ready) {
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error('[email-yandex-check] Ошибка проверки:', error.message);
    process.exitCode = 1;
});
