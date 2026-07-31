const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const prisma = require('../prisma/prisma.js');
const productSettingsService = require('./product-settings.service.js');
const taskService = require('./task.service.js');
const { uploadsDir } = require('../middlewares/upload.middleware.js');
const { buildStoredAttachmentPath } = require('../utils/attachment.utils.js');

let intakeTimer = null;
let intakeRunning = false;
const EMAIL_ATTACHMENT_FILE_PREFIX = 'email-';
const ORPHAN_FILE_MIN_AGE_MS = 60 * 60 * 1000;

const toBoolean = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const parseIntegerEnv = (name, fallback, min = 0) => {
    const parsed = Number.parseInt(process.env[name] || `${fallback}`, 10);
    return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
};

const getEmailIntakeConfig = () => ({
    enabled: toBoolean(process.env.EMAIL_INTAKE_ENABLED),
    host: process.env.EMAIL_IMAP_HOST || 'imap.yandex.ru',
    port: parseIntegerEnv('EMAIL_IMAP_PORT', 993, 1),
    secure: process.env.EMAIL_IMAP_SECURE === undefined ? true : toBoolean(process.env.EMAIL_IMAP_SECURE),
    user: process.env.EMAIL_IMAP_USER,
    password: process.env.EMAIL_IMAP_PASSWORD,
    mailbox: process.env.EMAIL_INTAKE_MAILBOX || 'INBOX',
    startUid: parseIntegerEnv('EMAIL_INTAKE_START_UID', 1, 1),
    maxMessages: parseIntegerEnv('EMAIL_INTAKE_MAX_MESSAGES', 30, 1),
    pollIntervalMs: parseIntegerEnv('EMAIL_INTAKE_POLL_INTERVAL_MS', 300000, 60000),
    attachmentMaxBytes: parseIntegerEnv('EMAIL_ATTACHMENT_MAX_BYTES', 25 * 1024 * 1024, 1),
    defaultFolderId: process.env.EMAIL_DEFAULT_FOLDER_ID || undefined,
    defaultEntityId: process.env.EMAIL_DEFAULT_ENTITY_ID || undefined,
    defaultTypeId: process.env.EMAIL_DEFAULT_TYPE_ID || undefined,
    defaultSubtypeId: process.env.EMAIL_DEFAULT_SUBTYPE_ID || undefined
});

const requireImapConfig = (config) => {
    if (!config.user || !config.password) {
        throw new Error('EMAIL_IMAP_USER and EMAIL_IMAP_PASSWORD are required for email intake.');
    }
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const getFirstAddress = (addressObject) => {
    const first = addressObject && Array.isArray(addressObject.value) ? addressObject.value[0] : null;
    if (!first || !first.address) {
        return null;
    }

    return {
        email: normalizeEmail(first.address),
        name: first.name || null
    };
};

const stripHtml = (html) => String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeText = (text) => String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

const buildMessageId = (parsed, context = {}) => {
    if (parsed.messageId) {
        return parsed.messageId;
    }

    const hash = crypto
        .createHash('sha256')
        .update(JSON.stringify({
            mailbox: context.mailbox,
            uid: context.uid,
            from: parsed.from && parsed.from.text,
            subject: parsed.subject,
            date: parsed.date
        }))
        .digest('hex')
        .slice(0, 32);

    return `generated-${hash}@local-email-intake`;
};

const safeFileExtension = (fileName) => {
    const ext = path.extname(fileName || '').toLowerCase();
    return /^[a-z0-9.]{1,16}$/.test(ext) ? ext : '';
};

const safeOriginalFileName = (fileName) => {
    const baseName = path.basename(fileName || 'email-attachment.bin');
    return baseName.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'email-attachment.bin';
};

const createExternalUserForEmail = async(sender, hashedPassword, db = prisma) => {
    return db.user.upsert({
        where: { email: sender.email },
        update: {},
        create: {
            name: sender.name || sender.email,
            email: sender.email,
            password: hashedPassword,
            role: 'REQUESTER',
            position: 'Email requester',
            department: 'External'
        }
    });
};

const deletePreparedAttachmentFiles = (prepared = []) => {
    for (const attachment of prepared) {
        if (!attachment.absolutePath) continue;
        try {
            fs.unlinkSync(attachment.absolutePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('[email-intake] Failed to clean up attachment file', {
                    filename: attachment.storedName,
                    error: error.message
                });
            }
        }
    }
};

const prepareParsedAttachments = (attachments = [], config = getEmailIntakeConfig()) => {
    const prepared = [];
    const skipped = [];

    try {
        for (const attachment of attachments) {
            if (!attachment || !attachment.content || attachment.content.length === 0) {
                continue;
            }

            if (attachment.content.length > config.attachmentMaxBytes) {
                skipped.push({
                    skipped: true,
                    reason: 'too_large',
                    filename: attachment.filename || 'attachment',
                    sizeBytes: attachment.content.length
                });
                continue;
            }

            const originalName = safeOriginalFileName(attachment.filename);
            const storedName = `${EMAIL_ATTACHMENT_FILE_PREFIX}${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeFileExtension(originalName)}`;
            const absolutePath = path.join(uploadsDir, storedName);

            fs.writeFileSync(absolutePath, attachment.content, { flag: 'wx' });
            prepared.push({
                filename: originalName,
                storedName,
                absolutePath,
                storedPath: buildStoredAttachmentPath(storedName),
                sizeBytes: attachment.content.length
            });
        }
    } catch (error) {
        deletePreparedAttachmentFiles(prepared);
        throw error;
    }

    return { prepared, skipped };
};

const persistPreparedAttachments = async(taskId, userId, prepared, db) => {
    const saved = [];
    for (const attachment of prepared) {
        const record = await db.taskAttachment.create({
            data: {
                filename: attachment.filename,
                path: attachment.storedPath,
                taskId,
                uploadedById: userId
            }
        });

        saved.push({
            id: record.id,
            filename: record.filename,
            sizeBytes: attachment.sizeBytes
        });
    }

    return saved;
};

const findProcessedInboundMessage = async(messageId, mailbox, uid, db = prisma) => {
    const byMessageId = await db.emailInboundMessage.findUnique({ where: { messageId } });
    if (byMessageId) {
        return { inbound: byMessageId, reason: 'already_processed' };
    }

    if (!mailbox || !uid) return null;
    const byUid = await db.emailInboundMessage.findUnique({
        where: { mailbox_uid: { mailbox, uid } }
    });
    return byUid ? { inbound: byUid, reason: 'already_processed_uid' } : null;
};

const cleanupOrphanedEmailAttachmentFiles = async(options = {}) => {
    const olderThanMs = Number.isFinite(options.olderThanMs)
        ? Math.max(options.olderThanMs, 0)
        : ORPHAN_FILE_MIN_AGE_MS;
    const cutoff = Date.now() - olderThanMs;
    const candidateNames = Array.isArray(options.candidateNames)
        ? new Set(options.candidateNames.map((name) => path.basename(name)))
        : null;
    const referenced = await prisma.taskAttachment.findMany({
        where: { path: { startsWith: `/uploads/${EMAIL_ATTACHMENT_FILE_PREFIX}` } },
        select: { path: true }
    });
    const referencedNames = new Set(referenced.map((item) => path.basename(item.path)));
    const removed = [];

    for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.startsWith(EMAIL_ATTACHMENT_FILE_PREFIX)) continue;
        if (candidateNames && !candidateNames.has(entry.name)) continue;
        if (referencedNames.has(entry.name)) continue;

        const absolutePath = path.join(uploadsDir, entry.name);
        const stat = fs.statSync(absolutePath);
        if (stat.mtimeMs > cutoff) continue;

        fs.unlinkSync(absolutePath);
        removed.push(entry.name);
    }

    return removed;
};

const buildTaskDescription = (parsed, sender, bodyText) => {
    const lines = [
        'Заявка создана автоматически из входящего email.',
        '',
        `От: ${sender.name ? `${sender.name} <${sender.email}>` : sender.email}`,
        parsed.date ? `Дата письма: ${parsed.date.toISOString()}` : null,
        parsed.messageId ? `Message-ID: ${parsed.messageId}` : null,
        '',
        'Текст письма:',
        bodyText || '(пустое письмо)'
    ].filter((line) => line !== null);

    return lines.join('\n');
};

const processParsedEmailMessage = async(parsed, context = {}) => {
    const config = getEmailIntakeConfig();
    const sender = getFirstAddress(parsed.from);
    if (!sender || !sender.email) {
        throw new Error('Email message has no sender address.');
    }

    const messageId = buildMessageId(parsed, context);
    const mailbox = context.mailbox || config.mailbox;
    const uid = context.uid || null;
    const existing = await findProcessedInboundMessage(messageId, mailbox, uid);
    if (existing) {
        return {
            skipped: true,
            reason: existing.reason,
            messageId,
            taskId: existing.inbound.taskId
        };
    }

    const bodyText = normalizeText(parsed.text) || stripHtml(parsed.html);
    const title = normalizeText(parsed.subject).slice(0, 255) || 'Заявка по email без темы';
    const generatedPassword = crypto.randomBytes(24).toString('hex');
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);
    const attachmentBatch = prepareParsedAttachments(parsed.attachments || [], config);
    const inboundId = crypto.randomUUID();
    let transactionResult;

    try {
        transactionResult = await prisma.$transaction(async(tx) => {
            const inbound = await tx.emailInboundMessage.create({
                data: {
                    id: inboundId,
                    messageId,
                    mailbox,
                    uid,
                    fromEmail: sender.email,
                    fromName: sender.name,
                    subject: title,
                    receivedAt: parsed.date || null,
                    textPreview: bodyText.slice(0, 1000) || null
                }
            });
            const user = await createExternalUserForEmail(sender, hashedPassword, tx);
            const task = await taskService.create({
                title,
                description: buildTaskDescription(parsed, sender, bodyText),
                priority: 'MEDIUM',
                sourceChannel: 'EMAIL',
                folderId: config.defaultFolderId,
                entityId: config.defaultEntityId,
                typeId: config.defaultTypeId,
                subtypeId: config.defaultSubtypeId
            }, user, {
                db: tx,
                skipPostCreateEffects: true
            });
            const savedAttachments = await persistPreparedAttachments(
                task.id,
                user.id,
                attachmentBatch.prepared,
                tx
            );

            await tx.emailInboundMessage.update({
                where: { id: inbound.id },
                data: {
                    taskId: task.id,
                    createdUserId: user.id
                }
            });

            return {
                inboundId: inbound.id,
                taskId: task.id,
                userId: user.id,
                attachments: [...savedAttachments, ...attachmentBatch.skipped]
            };
        }, { maxWait: 10000, timeout: 15000 });
    } catch (error) {
        const committedOrDuplicate = await findProcessedInboundMessage(messageId, mailbox, uid);
        if (committedOrDuplicate?.inbound?.id === inboundId) {
            transactionResult = {
                inboundId,
                taskId: committedOrDuplicate.inbound.taskId,
                userId: committedOrDuplicate.inbound.createdUserId,
                attachments: attachmentBatch.skipped,
                recoveredAfterAmbiguousCommit: true
            };
        } else {
            deletePreparedAttachmentFiles(attachmentBatch.prepared);
        }

        if (!transactionResult && committedOrDuplicate) {
            return {
                skipped: true,
                reason: committedOrDuplicate.reason,
                messageId,
                taskId: committedOrDuplicate.inbound.taskId
            };
        }
        if (!transactionResult) throw error;
    }

    await taskService.runPostCreateEffects(transactionResult.taskId, {
        id: transactionResult.userId,
        email: sender.email,
        role: 'REQUESTER'
    }, {
        automationTriggerType: 'EMAIL_TICKET_CREATED',
        automationChannel: 'EMAIL',
        automationRequesterEmail: sender.email,
        assigneeIds: []
    });

    return {
        skipped: false,
        messageId,
        inboundId: transactionResult.inboundId,
        taskId: transactionResult.taskId,
        userId: transactionResult.userId,
        fromEmail: sender.email,
        attachments: transactionResult.attachments,
        recoveredAfterAmbiguousCommit: Boolean(transactionResult.recoveredAfterAmbiguousCommit)
    };
};

const parseAndProcessRawMessage = async(rawMessage, context = {}) => {
    const parsed = await simpleParser(rawMessage);
    return processParsedEmailMessage(parsed, context);
};

const syncEmailInbox = async(options = {}) => {
    if (!(await productSettingsService.isFeatureEnabled('email'))) {
        return { mailbox: null, processed: [], skipped: [], failed: [], totalScanned: 0, featureDisabled: true };
    }

    const config = {
        ...getEmailIntakeConfig(),
        ...options
    };
    requireImapConfig(config);
    await cleanupOrphanedEmailAttachmentFiles();

    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.user,
            pass: config.password
        }
    });

    const processed = [];
    const skipped = [];
    const failed = [];

    await client.connect();
    const lock = await client.getMailboxLock(config.mailbox);

    try {
        const exists = client.mailbox && client.mailbox.exists ? client.mailbox.exists : 0;
        if (exists === 0) {
            return { mailbox: config.mailbox, processed, skipped, failed, totalScanned: 0 };
        }

        const maxMessages = Math.min(config.maxMessages, exists);
        const startSequence = Math.max(1, exists - maxMessages + 1);
        const range = `${startSequence}:*`;
        let totalScanned = 0;

        for await (const message of client.fetch(range, { uid: true, source: true, envelope: true })) {
            totalScanned += 1;
            if (message.uid < config.startUid) {
                skipped.push({
                    skipped: true,
                    reason: 'before_start_uid',
                    uid: message.uid
                });
                continue;
            }
            try {
                const result = await parseAndProcessRawMessage(message.source, {
                    mailbox: config.mailbox,
                    uid: message.uid
                });
                if (result.skipped) {
                    skipped.push(result);
                } else {
                    processed.push(result);
                }
            } catch (error) {
                failed.push({
                    uid: message.uid,
                    error: error.message
                });
            }
        }

        return { mailbox: config.mailbox, processed, skipped, failed, totalScanned };
    } finally {
        lock.release();
        await client.logout();
    }
};

const scheduleNextEmailIntake = () => {
    const config = getEmailIntakeConfig();
    intakeTimer = setTimeout(async() => {
        try {
            intakeRunning = true;
            const result = await syncEmailInbox();
            console.log('[email-intake] Sync finished', {
                processed: result.processed.length,
                skipped: result.skipped.length,
                failed: result.failed.length
            });
        } catch (error) {
            console.error('[email-intake] Sync failed:', error.message);
        } finally {
            intakeRunning = false;
            scheduleNextEmailIntake();
        }
    }, config.pollIntervalMs);

    if (typeof intakeTimer.unref === 'function') {
        intakeTimer.unref();
    }

    return config.pollIntervalMs;
};

const startEmailIntakeScheduler = () => {
    const config = getEmailIntakeConfig();
    if (!config.enabled) {
        return null;
    }

    requireImapConfig(config);

    if (intakeTimer) {
        return config.pollIntervalMs;
    }

    const intervalMs = scheduleNextEmailIntake();
    console.log(`[email-intake] Scheduler enabled. Interval: ${intervalMs}ms, mailbox: ${config.mailbox}`);
    return intervalMs;
};

const stopEmailIntakeScheduler = () => {
    if (intakeTimer) {
        clearTimeout(intakeTimer);
        intakeTimer = null;
    }
};

module.exports = {
    getEmailIntakeConfig,
    parseAndProcessRawMessage,
    processParsedEmailMessage,
    cleanupOrphanedEmailAttachmentFiles,
    startEmailIntakeScheduler,
    stopEmailIntakeScheduler,
    syncEmailInbox,
    isEmailIntakeRunning: () => intakeRunning
};
