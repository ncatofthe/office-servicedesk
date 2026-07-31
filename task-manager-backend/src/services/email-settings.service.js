const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const prisma = require('../prisma/prisma.js');

const SETTINGS_ID = 'default';
const bool = (value, fallback = false) => value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
const int = (value, fallback, min = 1) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

const envSettings = () => ({
    id: SETTINGS_ID,
    intakeEnabled: bool(process.env.EMAIL_INTAKE_ENABLED), imapHost: process.env.EMAIL_IMAP_HOST || 'imap.yandex.ru',
    imapPort: int(process.env.EMAIL_IMAP_PORT, 993), imapSecure: bool(process.env.EMAIL_IMAP_SECURE, true),
    imapUser: process.env.EMAIL_IMAP_USER || null, imapPassword: process.env.EMAIL_IMAP_PASSWORD || null,
    mailbox: process.env.EMAIL_INTAKE_MAILBOX || 'INBOX', intakeStartUid: int(process.env.EMAIL_INTAKE_START_UID, 1),
    intakeMaxMessages: int(process.env.EMAIL_INTAKE_MAX_MESSAGES, 30), intakePollIntervalMs: int(process.env.EMAIL_INTAKE_POLL_INTERVAL_MS, 300000, 60000),
    attachmentMaxBytes: int(process.env.EMAIL_ATTACHMENT_MAX_BYTES, 26214400), defaultFolderId: process.env.EMAIL_DEFAULT_FOLDER_ID || null,
    defaultEntityId: process.env.EMAIL_DEFAULT_ENTITY_ID || null, defaultTypeId: process.env.EMAIL_DEFAULT_TYPE_ID || null, defaultSubtypeId: process.env.EMAIL_DEFAULT_SUBTYPE_ID || null,
    outboundEnabled: bool(process.env.EMAIL_OUTBOUND_ENABLED), smtpHost: process.env.EMAIL_SMTP_HOST || 'smtp.yandex.ru',
    smtpPort: int(process.env.EMAIL_SMTP_PORT, 465), smtpSecure: bool(process.env.EMAIL_SMTP_SECURE, true),
    smtpUser: process.env.EMAIL_SMTP_USER || null, smtpPassword: process.env.EMAIL_SMTP_PASSWORD || null,
    fromAddress: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER || null, fromName: process.env.EMAIL_FROM_NAME || 'Office ServiceDesk',
    workerEnabled: bool(process.env.EMAIL_OUTBOX_WORKER_ENABLED), workerIntervalMs: int(process.env.EMAIL_OUTBOX_WORKER_INTERVAL_MS, 60000, 5000),
    workerBatchSize: int(process.env.EMAIL_OUTBOX_WORKER_BATCH_SIZE, 20), lockTtlMs: int(process.env.EMAIL_OUTBOX_LOCK_TTL_MS, 300000, 1000),
    maxAttempts: int(process.env.EMAIL_OUTBOX_MAX_ATTEMPTS, 5), retryDelayMinutes: int(process.env.EMAIL_OUTBOUND_RETRY_DELAY_MINUTES, 15),
    notificationsEnabled: bool(process.env.EMAIL_NOTIFICATIONS_ENABLED), notifyRequesterCreated: true, notifyRequesterComment: true,
    notifyRequesterStatus: true, notifyRequesterAssigned: false, portalBaseUrl: process.env.PORTAL_BASE_URL || null,
    createdSubjectTemplate: '[Заявка #{{ticketNumber}}] Заявка принята: {{title}}',
    createdBodyTemplate: 'Здравствуйте, {{requesterName}}!\n\nМы зарегистрировали вашу заявку #{{ticketNumber}} «{{title}}».\nТекущий статус: {{status}}.\n\n{{portalLink}}',
    commentSubjectTemplate: '[Заявка #{{ticketNumber}}] Новый ответ: {{title}}',
    commentBodyTemplate: 'Здравствуйте, {{requesterName}}!\n\nПо заявке #{{ticketNumber}} появился новый ответ.\n\n{{comment}}\n\n{{portalLink}}',
    statusSubjectTemplate: '[Заявка #{{ticketNumber}}] Статус изменён: {{status}}',
    statusBodyTemplate: 'Здравствуйте, {{requesterName}}!\n\nСтатус заявки #{{ticketNumber}} «{{title}}» изменён: {{oldStatus}} → {{status}}.\n\n{{portalLink}}',
    assignedSubjectTemplate: '[Заявка #{{ticketNumber}}] Назначен исполнитель',
    assignedBodyTemplate: 'Здравствуйте, {{requesterName}}!\n\nПо заявке #{{ticketNumber}} назначен исполнитель: {{assigneeName}}.\n\n{{portalLink}}'
});

let cached = envSettings();
const key = () => crypto.createHash('sha256').update(process.env.EMAIL_SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'officesd-local-key').digest();
const encrypt = (value) => {
    if (!value) return null;
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
};
const decrypt = (value) => {
    if (!value) return null;
    const [version, iv, tag, data] = String(value).split(':');
    if (version !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
};

const hydrate = (row) => row ? { ...row, imapPassword: decrypt(row.imapPasswordEncrypted), smtpPassword: decrypt(row.smtpPasswordEncrypted) } : envSettings();
const loadEmailSettings = async(db = prisma) => {
    const row = await db.emailSettings.findUnique({ where: { id: SETTINGS_ID } });
    cached = hydrate(row);
    return cached;
};
const getRuntimeEmailSettings = () => cached;
const publicSettings = (settings = cached) => {
    const { imapPassword, smtpPassword, imapPasswordEncrypted, smtpPasswordEncrypted, ...safe } = settings;
    return { ...safe, imapPasswordConfigured: Boolean(imapPassword), smtpPasswordConfigured: Boolean(smtpPassword) };
};

const editable = ['intakeEnabled','imapHost','imapPort','imapSecure','imapUser','mailbox','intakeStartUid','intakeMaxMessages','intakePollIntervalMs','attachmentMaxBytes','defaultFolderId','defaultEntityId','defaultTypeId','defaultSubtypeId','outboundEnabled','smtpHost','smtpPort','smtpSecure','smtpUser','fromAddress','fromName','workerEnabled','workerIntervalMs','workerBatchSize','lockTtlMs','maxAttempts','retryDelayMinutes','notificationsEnabled','notifyRequesterCreated','notifyRequesterComment','notifyRequesterStatus','notifyRequesterAssigned','portalBaseUrl','createdSubjectTemplate','createdBodyTemplate','commentSubjectTemplate','commentBodyTemplate','statusSubjectTemplate','statusBodyTemplate','assignedSubjectTemplate','assignedBodyTemplate'];
const updateEmailSettings = async(payload, db = prisma) => {
    const current = cached || envSettings(); const persisted = await db.emailSettings.findUnique({ where: { id: SETTINGS_ID } });
    const data = persisted ? {} : Object.fromEntries(editable.map((name) => [name, current[name]]));
    for (const name of editable) if (Object.prototype.hasOwnProperty.call(payload, name)) data[name] = payload[name] === '' && name.endsWith('Id') ? null : payload[name];
    data.imapPasswordEncrypted = payload.clearImapPassword ? null : encrypt(payload.imapPassword || current.imapPassword);
    data.smtpPasswordEncrypted = payload.clearSmtpPassword ? null : encrypt(payload.smtpPassword || current.smtpPassword);
    const row = await db.emailSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
    cached = hydrate(row); return publicSettings(cached);
};

const testEmailConnection = async(target = 'BOTH') => {
    const result = {};
    if (target === 'IMAP' || target === 'BOTH') {
        const client = new ImapFlow({ host: cached.imapHost, port: cached.imapPort, secure: cached.imapSecure, auth: { user: cached.imapUser, pass: cached.imapPassword }, logger: false });
        try { await client.connect(); result.imap = { ok: true, message: 'IMAP-соединение установлено.' }; } catch (error) { result.imap = { ok: false, message: String(error.message).slice(0, 300) }; } finally { if (client.usable) await client.logout().catch(() => {}); }
    }
    if (target === 'SMTP' || target === 'BOTH') {
        try { await nodemailer.createTransport({ host: cached.smtpHost, port: cached.smtpPort, secure: cached.smtpSecure, auth: { user: cached.smtpUser, pass: cached.smtpPassword } }).verify(); result.smtp = { ok: true, message: 'SMTP-соединение установлено.' }; }
        catch (error) { result.smtp = { ok: false, message: String(error.message).slice(0, 300) }; }
    }
    return result;
};

module.exports = { loadEmailSettings, getRuntimeEmailSettings, publicSettings, updateEmailSettings, testEmailConnection, encrypt, decrypt };
