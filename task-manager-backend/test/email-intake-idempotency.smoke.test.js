const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'email intake idempotency tests require .env.test with DATABASE_URL and JWT_SECRET',
        { skip: 'Missing test DATABASE_URL/JWT_SECRET' },
        () => {}
    );
} else {
    const prisma = require('../src/prisma/prisma.js');
    const { uploadsDir } = require('../src/middlewares/upload.middleware.js');
    const {
        cleanupOrphanedEmailAttachmentFiles,
        processParsedEmailMessage
    } = require('../src/services/email-intake.service.js');
    const emailSettingsService = require('../src/services/email-settings.service.js');

    after(async() => {
        await prisma.$disconnect();
    });

    const listEmailAttachmentFiles = () => new Set(
        fs.readdirSync(uploadsDir).filter((name) => name.startsWith('email-'))
    );

    const buildParsedMessage = ({ runId, messageId, subject, attachment = true }) => ({
        messageId,
        from: {
            value: [{
                address: `intake-${runId}@example.com`,
                name: 'Email Intake Test'
            }]
        },
        subject,
        date: new Date(),
        text: `Email intake idempotency test ${runId}`,
        attachments: attachment
            ? [{
                filename: `intake-${runId}.txt`,
                content: Buffer.from(`attachment-${runId}`, 'utf8')
            }]
            : []
    });

    test('concurrent processing creates one task and leaves only winner attachments', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const mailbox = `INTAKE_RACE_${runId}`;
        const uid = 31001;
        const messageId = `<intake-race-${runId}@example.com>`;
        const subject = `Email intake race ${runId}`;
        const parsed = buildParsedMessage({ runId, messageId, subject });
        const filesBefore = listEmailAttachmentFiles();
        const previousEmailNotifications = process.env.EMAIL_NOTIFICATIONS_ENABLED;
        process.env.EMAIL_NOTIFICATIONS_ENABLED = 'false';

        t.after(async() => {
            if (previousEmailNotifications === undefined) {
                delete process.env.EMAIL_NOTIFICATIONS_ENABLED;
            } else {
                process.env.EMAIL_NOTIFICATIONS_ENABLED = previousEmailNotifications;
            }

            const tasks = await prisma.task.findMany({
                where: { title: subject },
                select: {
                    id: true,
                    attachments: { select: { path: true } }
                }
            });
            const taskIds = tasks.map((task) => task.id);
            await prisma.emailInboundMessage.deleteMany({
                where: { OR: [{ messageId }, { mailbox }] }
            });
            if (taskIds.length > 0) {
                await prisma.notification.deleteMany({ where: { taskId: { in: taskIds } } });
                await prisma.automationRun.deleteMany({ where: { taskId: { in: taskIds } } });
                await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
            }
            await prisma.user.deleteMany({
                where: { email: `intake-${runId}@example.com` }
            });
            for (const task of tasks) {
                for (const attachment of task.attachments) {
                    const absolutePath = path.join(uploadsDir, path.basename(attachment.path));
                    try {
                        fs.unlinkSync(absolutePath);
                    } catch (error) {
                        if (error.code !== 'ENOENT') throw error;
                    }
                }
            }
        });

        const results = await Promise.all(
            Array.from({ length: 2 }, () => processParsedEmailMessage(parsed, { mailbox, uid }))
        );

        assert.equal(results.filter((result) => !result.skipped).length, 1);
        assert.equal(results.filter((result) => result.skipped).length, 1);
        const taskId = results.find((result) => !result.skipped).taskId;
        assert.ok(results.every((result) => result.taskId === taskId));

        const [inboundCount, tasks, attachments] = await Promise.all([
            prisma.emailInboundMessage.count({ where: { messageId } }),
            prisma.task.findMany({ where: { title: subject }, select: { id: true } }),
            prisma.taskAttachment.findMany({ where: { taskId }, select: { path: true } })
        ]);
        assert.equal(inboundCount, 1);
        assert.deepEqual(tasks.map((task) => task.id), [taskId]);
        assert.equal(attachments.length, 1);

        const filesAfter = listEmailAttachmentFiles();
        const newlyCreatedFiles = [...filesAfter].filter((name) => !filesBefore.has(name));
        assert.deepEqual(newlyCreatedFiles, [path.basename(attachments[0].path)]);

        const duplicateByUid = await processParsedEmailMessage(
            buildParsedMessage({
                runId,
                messageId: `<different-message-id-${runId}@example.com>`,
                subject: `${subject} different message id`,
                attachment: false
            }),
            { mailbox, uid }
        );
        assert.equal(duplicateByUid.skipped, true);
        assert.equal(duplicateByUid.reason, 'already_processed_uid');
        assert.equal(duplicateByUid.taskId, taskId);

        const duplicateByMessageId = await processParsedEmailMessage(parsed, {
            mailbox: `${mailbox}_OTHER`,
            uid: uid + 1
        });
        assert.equal(duplicateByMessageId.skipped, true);
        assert.equal(duplicateByMessageId.reason, 'already_processed');
        assert.equal(duplicateByMessageId.taskId, taskId);
    });

    test('database rollback removes prepared files and leaves no task or inbound marker', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const messageId = `<intake-rollback-${runId}@example.com>`;
        const subject = `Email intake rollback ${runId}`;
        const mailbox = `INTAKE_ROLLBACK_${runId}`;
        const filesBefore = listEmailAttachmentFiles();
        const previousDefaultFolderId = emailSettingsService.getRuntimeEmailSettings().defaultFolderId;
        await emailSettingsService.updateEmailSettings({
            defaultFolderId: `missing-folder-${runId}`
        });

        t.after(async() => {
            await emailSettingsService.updateEmailSettings({
                defaultFolderId: previousDefaultFolderId || null
            });
            await prisma.emailInboundMessage.deleteMany({ where: { messageId } });
            await prisma.task.deleteMany({ where: { title: subject } });
            await prisma.user.deleteMany({ where: { email: `intake-${runId}@example.com` } });
        });

        await assert.rejects(
            processParsedEmailMessage(
                buildParsedMessage({ runId, messageId, subject }),
                { mailbox, uid: 32001 }
            )
        );

        const [inboundCount, taskCount, userCount] = await Promise.all([
            prisma.emailInboundMessage.count({ where: { messageId } }),
            prisma.task.count({ where: { title: subject } }),
            prisma.user.count({ where: { email: `intake-${runId}@example.com` } })
        ]);
        assert.equal(inboundCount, 0);
        assert.equal(taskCount, 0);
        assert.equal(userCount, 0);
        assert.deepEqual(listEmailAttachmentFiles(), filesBefore);
    });

    test('stale unreferenced email files are removed without touching linked attachments', async() => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const orphanName = `email-orphan-${runId}.txt`;
        const orphanPath = path.join(uploadsDir, orphanName);
        fs.writeFileSync(orphanPath, 'orphan', { flag: 'wx' });
        const staleDate = new Date(Date.now() - 5000);
        fs.utimesSync(orphanPath, staleDate, staleDate);

        const removed = await cleanupOrphanedEmailAttachmentFiles({
            olderThanMs: 1000,
            candidateNames: [orphanName]
        });
        assert.ok(removed.includes(orphanName));
        assert.equal(fs.existsSync(orphanPath), false);
    });
}
