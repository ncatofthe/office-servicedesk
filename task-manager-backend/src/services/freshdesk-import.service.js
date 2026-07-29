const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../prisma/prisma.js');
const { safeRecordTimelineEvent } = require('./timeline.service.js');
const { uploadsDir } = require('../middlewares/upload.middleware.js');

const SUPPORTED_EXTENSIONS = new Set(['.json', '.csv']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeString = (value) => {
    if (value === undefined || value === null) {
        return null;
    }
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
};

const toArray = (value) => {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }
        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }
    return [];
};

const normalizeFreshdeskStatus = (value) => {
    const numeric = Number(value);
    if (numeric === 3) return 'IN_PROGRESS';
    if (numeric === 4 || numeric === 5) return 'DONE';
    if (numeric === 2) return 'NEW';
    const normalized = String(value || '').trim().toLowerCase();
    if (['resolved', 'closed', 'done'].includes(normalized)) {
        return 'DONE';
    }
    if (['in progress', 'in_progress', 'processing', 'open-in-progress'].includes(normalized)) {
        return 'IN_PROGRESS';
    }
    return 'NEW';
};

const parseDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizePriority = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (['low', '1', 'minor', 'низкий'].includes(normalized)) {
        return 'LOW';
    }
    if (['high', '3', 'major', 'высокий'].includes(normalized)) {
        return 'HIGH';
    }
    if (['critical', '4', 'urgent', 'срочный', 'критичный'].includes(normalized)) {
        return 'URGENT';
    }
    return 'MEDIUM';
};

const parseBoolean = (value) => ['1', 'true', 'yes', 'on', 'internal', 'private'].includes(String(value || '').trim().toLowerCase());

const parseCsv = (content) => {
    const rows = [];
    let current = '';
    let row = [];
    let inQuotes = false;

    const pushCell = () => {
        row.push(current);
        current = '';
    };

    const pushRow = () => {
        if (row.length > 0 || current.length > 0) {
            pushCell();
            rows.push(row);
            row = [];
        }
    };

    for (let index = 0; index < content.length; index += 1) {
        const char = content[index];
        const nextChar = content[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                index += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }

        if (!inQuotes && char === ',') {
            pushCell();
            continue;
        }

        if (!inQuotes && (char === '\n' || char === '\r')) {
            if (char === '\r' && nextChar === '\n') {
                index += 1;
            }
            pushRow();
            continue;
        }

        current += char;
    }

    pushRow();

    if (rows.length === 0) {
        return [];
    }

    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map((cell) => String(cell || '').trim());

    return dataRows
        .filter((dataRow) => dataRow.some((cell) => String(cell || '').trim() !== ''))
        .map((dataRow) => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ''])));
};

const parseImportFile = (filePath) => {
    const absolutePath = path.resolve(filePath);
    const extension = path.extname(absolutePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        throw new Error('Поддерживаются только JSON и CSV файлы для импорта Freshdesk.');
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    if (extension === '.json') {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (Array.isArray(parsed?.tickets)) {
            return parsed.tickets;
        }
        throw new Error('JSON для импорта должен быть массивом заявок или объектом с полем tickets.');
    }

    return parseCsv(content);
};

const buildPasswordHash = async() => {
    const generatedPassword = crypto.randomBytes(24).toString('hex');
    return bcrypt.hash(generatedPassword, 10);
};

const resolveImportedUser = async(db, payload, fallbackRole) => {
    const email = normalizeEmail(payload?.email);
    const name = normalizeString(payload?.name);
    if (!email) {
        return null;
    }

    const existing = await db.user.findUnique({
        where: { email }
    });
    if (existing) {
        return existing;
    }

    const role = payload?.role === 'ADMIN'
        ? 'ADMIN'
        : (payload?.role === 'AGENT' || fallbackRole === 'AGENT' ? 'AGENT' : 'REQUESTER');

    return db.user.create({
        data: {
            email,
            name: name || email,
            password: await buildPasswordHash(),
            role,
            position: role === 'AGENT' ? 'Импортированный исполнитель' : 'Импортированный заявитель',
            department: 'Freshdesk Import'
        }
    });
};

const parseTicketRecord = (record, index) => {
    const requester = record.requester || {
        email: record.requesterEmail || record.requester_email,
        name: record.requesterName || record.requester_name,
        role: 'REQUESTER'
    };
    const agent = record.agent || {
        email: record.agentEmail || record.agent_email || record.assigneeEmail || record.assignee_email,
        name: record.agentName || record.agent_name || record.assigneeName || record.assignee_name,
        role: 'AGENT'
    };

    const externalId = normalizeString(record.externalId || record.id || record.ticketId || record.ticket_id);
    const externalNumber = normalizeString(record.externalNumber || record.number || record.ticketNumber || record.ticket_number);

    if (!externalId) {
        throw new Error(`У записи #${index + 1} отсутствует externalId/id.`);
    }

    return {
        externalId,
        externalNumber,
        title: normalizeString(record.title || record.subject) || `Импортированная заявка ${externalNumber || externalId}`,
        description: normalizeString(record.description || record.body || record.text) || 'Импортировано из Freshdesk.',
        status: normalizeFreshdeskStatus(record.status),
        priority: normalizePriority(record.priority),
        sourceChannel: record.sourceChannel === 'EMAIL' || Number(record.source) === 1 ? 'EMAIL' : 'WEB',
        folderId: normalizeString(record.folderId || record.folder_id),
        entityId: normalizeString(record.entityId || record.entity_id),
        typeId: normalizeString(record.typeId || record.type_id),
        subtypeId: normalizeString(record.subtypeId || record.subtype_id),
        groupName: normalizeString(record.groupName || record.group_name || record.sourceMetadata?.groupName),
        createdAt: parseDate(record.createdAt || record.created_at),
        updatedAt: parseDate(record.updatedAt || record.updated_at),
        resolvedAt: parseDate(record.resolvedAt || record.resolved_at || record.closedAt || record.closed_at || record.stats?.resolved_at || record.stats?.closed_at),
        sourceMetadata: record.sourceMetadata || {
            groupName: record.groupName || record.group_name || null,
            tags: toArray(record.tags),
            customFields: record.custom_fields || record.customFields || {},
            source: record.source || null
        },
        requester,
        agent,
        comments: toArray(record.comments),
        attachments: toArray(record.attachments),
        raw: record
    };
};

const buildTaskReferenceMetadata = (ticket) => ({
    source: 'FRESHDESK',
    externalNumber: ticket.externalNumber,
    attachments: ticket.attachments.map((item) => ({
        externalId: item.externalId || item.id || null,
        fileName: item.fileName || item.filename || item.name || null,
        url: item.url || item.attachment_url || null,
        sizeBytes: item.sizeBytes || item.size || null
    })),
    sourceChannel: ticket.sourceChannel,
    sourceMetadata: ticket.sourceMetadata,
    sourceCreatedAt: ticket.createdAt?.toISOString() || null,
    sourceUpdatedAt: ticket.updatedAt?.toISOString() || null,
    sourceResolvedAt: ticket.resolvedAt?.toISOString() || null,
    importedAt: new Date().toISOString()
});

const resolveTicketFolderPlan = async(db, ticket) => {
    if (ticket.folderId) {
        const folder = await db.ticketFolder.findUnique({ where: { id: ticket.folderId } });
        if (!folder || !folder.isActive) throw new Error(`Папка ${ticket.folderId} не найдена или отключена.`);
        return { folderId: folder.id, matchedBy: 'explicit', warning: null };
    }
    if (ticket.groupName) {
        const folder = await db.ticketFolder.findFirst({
            where: { name: { equals: ticket.groupName, mode: 'insensitive' }, isActive: true }
        });
        if (folder) return { folderId: folder.id, matchedBy: 'group-name', warning: null };
    }
    const fallbackId = normalizeString(process.env.FRESHDESK_DEFAULT_FOLDER_ID || process.env.EMAIL_DEFAULT_FOLDER_ID);
    if (fallbackId) {
        const folder = await db.ticketFolder.findUnique({ where: { id: fallbackId } });
        if (!folder || !folder.isActive) throw new Error('FRESHDESK_DEFAULT_FOLDER_ID/EMAIL_DEFAULT_FOLDER_ID указывает на отсутствующую или отключённую папку.');
        return {
            folderId: folder.id,
            matchedBy: 'fallback',
            warning: ticket.groupName ? `Группа «${ticket.groupName}» не сопоставлена, использована fallback-папка.` : null
        };
    }
    return {
        folderId: null,
        matchedBy: 'none',
        warning: ticket.groupName ? `Группа «${ticket.groupName}» не сопоставлена; заявка останется без папки.` : 'Для заявки не определена папка.'
    };
};

const buildAttachmentExternalId = (ticketExternalId, attachment, index, owner = 'ticket') => {
    const explicit = normalizeString(attachment.externalId || attachment.id || attachment.attachment_id);
    if (explicit) return `${ticketExternalId}:attachment:${explicit}`;
    const digest = crypto.createHash('sha1').update(JSON.stringify({ owner, index, url: attachment.url || attachment.attachment_url, name: attachment.fileName || attachment.name })).digest('hex').slice(0, 16);
    return `${ticketExternalId}:attachment:${digest}`;
};

const collectTicketAttachments = (ticket) => [
    ...ticket.attachments.map((attachment, index) => ({ attachment, index, owner: 'ticket' })),
    ...ticket.comments.flatMap((comment, commentIndex) => toArray(comment.attachments).map((attachment, index) => ({
        attachment,
        index,
        owner: `comment:${comment.externalId || comment.id || commentIndex}`
    })))
];

const buildCommentExternalId = (ticketExternalId, comment, index) => {
    const explicitId = normalizeString(comment.externalId || comment.id);
    if (explicitId) {
        return `${ticketExternalId}:comment:${explicitId}`;
    }
    const hash = crypto
        .createHash('sha1')
        .update(JSON.stringify({
            ticketExternalId,
            index,
            body: comment.body || comment.content || '',
            createdAt: comment.createdAt || comment.created_at || null
        }))
        .digest('hex')
        .slice(0, 16);
    return `${ticketExternalId}:comment:${hash}`;
};

const resolveCommentAuthorPayload = (comment, ticket) => {
    const explicitAuthor = comment.author || null;
    if (explicitAuthor?.email) {
        return explicitAuthor;
    }

    const isInternal = parseBoolean(comment.isInternal || comment.private || comment.internal);
    if (isInternal && ticket.agent?.email) {
        return ticket.agent;
    }

    return ticket.requester;
};

const importTicketAttachments = async(db, task, ticket, uploaderId, options = {}) => {
    const results = { imported: 0, skipped: 0, failed: 0, errors: [] };
    for (const item of collectTicketAttachments(ticket)) {
        const externalId = buildAttachmentExternalId(ticket.externalId, item.attachment, item.index, item.owner);
        const existing = await db.taskExternalReference.findUnique({
            where: { system_entityType_externalId: { system: 'FRESHDESK', entityType: 'ATTACHMENT', externalId } }
        });
        if (existing) {
            results.skipped += 1;
            continue;
        }
        if (!options.downloadAttachment) {
            results.skipped += 1;
            continue;
        }

        let downloaded = null;
        try {
            downloaded = await options.downloadAttachment(item.attachment);
            const created = await db.$transaction(async(tx) => {
                const attachment = await tx.taskAttachment.create({
                    data: {
                        filename: downloaded.filename,
                        path: downloaded.path,
                        taskId: task.id,
                        uploadedById: uploaderId,
                        createdAt: parseDate(item.attachment.createdAt || item.attachment.created_at) || new Date()
                    }
                });
                await tx.taskExternalReference.create({
                    data: {
                        system: 'FRESHDESK',
                        entityType: 'ATTACHMENT',
                        externalId,
                        taskId: task.id,
                        attachmentId: attachment.id,
                        metadata: {
                            source: 'FRESHDESK',
                            owner: item.owner,
                            originalUrl: item.attachment.url || item.attachment.attachment_url || null,
                            sizeBytes: downloaded.sizeBytes,
                            contentType: item.attachment.contentType || item.attachment.content_type || null
                        }
                    }
                });
                return attachment;
            });
            results.imported += created ? 1 : 0;
        } catch (error) {
            if (downloaded?.absolutePath) fs.rmSync(downloaded.absolutePath, { force: true });
            results.failed += 1;
            results.errors.push({ externalId, fileName: item.attachment.fileName || item.attachment.name || null, message: error.message });
        }
    }
    return results;
};

const importSingleTicket = async(db, ticket, options = {}) => {
    const taskReference = await db.taskExternalReference.findUnique({
        where: {
            system_entityType_externalId: {
                system: 'FRESHDESK',
                entityType: 'TASK',
                externalId: ticket.externalId
            }
        },
        include: {
            task: {
                include: {
                    assignees: true
                }
            }
        }
    });

    const folderPlan = options.folderPlan || await resolveTicketFolderPlan(db, ticket);
    const requester = await resolveImportedUser(db, ticket.requester, 'REQUESTER');
    const agent = ticket.agent?.email
        ? await resolveImportedUser(db, ticket.agent, 'AGENT')
        : null;

    let task = taskReference?.task || null;
    let action = 'skipped';

    if (!task) {
        if (!requester?.id && !options.createdById) throw new Error('У Freshdesk-заявки нет requester email и не задан пользователь запуска импорта.');
        task = await db.task.create({
            data: {
                title: ticket.title,
                description: ticket.description,
                status: ticket.status,
                priority: ticket.priority,
                sourceChannel: ticket.sourceChannel,
                folderId: folderPlan.folderId,
                entityId: ticket.entityId,
                typeId: ticket.typeId,
                subtypeId: ticket.subtypeId,
                authorId: requester?.id || options.createdById,
                createdAt: ticket.createdAt || new Date(),
                updatedAt: ticket.updatedAt || ticket.createdAt || new Date(),
                resolvedAt: ticket.status === 'DONE' ? (ticket.resolvedAt || ticket.updatedAt || ticket.createdAt || new Date()) : null
            }
        });

        await db.taskExternalReference.create({
            data: {
                system: 'FRESHDESK',
                entityType: 'TASK',
                externalId: ticket.externalId,
                externalNumber: ticket.externalNumber,
                metadata: buildTaskReferenceMetadata(ticket),
                taskId: task.id
            }
        });

        await safeRecordTimelineEvent({
            taskId: task.id,
            actorId: options.createdById || null,
            type: 'TASK_CREATED',
            title: 'Заявка импортирована из Freshdesk',
            description: ticket.title,
            metadata: {
                externalSource: 'FRESHDESK',
                externalId: ticket.externalId,
                externalNumber: ticket.externalNumber
            }
        }, db);

        action = 'created';
    } else if (options.updateImportedExisting === true) {
        const updateData = {
            title: ticket.title,
            description: ticket.description,
            status: ticket.status,
            priority: ticket.priority,
            sourceChannel: ticket.sourceChannel,
            folderId: folderPlan.folderId,
            entityId: ticket.entityId,
            typeId: ticket.typeId,
            subtypeId: ticket.subtypeId,
            resolvedAt: ticket.status === 'DONE' ? (ticket.resolvedAt || task.resolvedAt) : task.resolvedAt
        };

        await db.task.update({
            where: { id: task.id },
            data: updateData
        });

        await db.taskExternalReference.update({
            where: {
                system_entityType_externalId: {
                    system: 'FRESHDESK',
                    entityType: 'TASK',
                    externalId: ticket.externalId
                }
            },
            data: {
                externalNumber: ticket.externalNumber,
                metadata: buildTaskReferenceMetadata(ticket)
            }
        });
        action = 'updated';
    } else {
        await db.taskExternalReference.update({
            where: { system_entityType_externalId: { system: 'FRESHDESK', entityType: 'TASK', externalId: ticket.externalId } },
            data: { externalNumber: ticket.externalNumber, metadata: buildTaskReferenceMetadata(ticket) }
        });
        action = 'skipped';
    }

    if (agent?.id) {
        await db.taskAssignee.upsert({
            where: {
                taskId_userId: {
                    taskId: task.id,
                    userId: agent.id
                }
            },
            update: {},
            create: {
                taskId: task.id,
                userId: agent.id
            }
        });
    }

    const commentResult = { imported: 0, skipped: 0 };
    for (let index = 0; index < ticket.comments.length; index += 1) {
        const comment = ticket.comments[index] || {};
        const externalId = buildCommentExternalId(ticket.externalId, comment, index);
        const existingCommentRef = await db.taskExternalReference.findUnique({
            where: {
                system_entityType_externalId: {
                    system: 'FRESHDESK',
                    entityType: 'COMMENT',
                    externalId
                }
            }
        });

        if (existingCommentRef) {
            commentResult.skipped += 1;
            continue;
        }

        const authorPayload = resolveCommentAuthorPayload(comment, ticket);
        const author = await resolveImportedUser(
            db,
            authorPayload,
            parseBoolean(comment.isInternal || comment.private || comment.internal) ? 'AGENT' : 'REQUESTER'
        );

        const createdComment = await db.taskComment.create({
            data: {
                taskId: task.id,
                authorId: author?.id || requester?.id || options.createdById,
                visibility: parseBoolean(comment.isInternal || comment.private || comment.internal) ? 'INTERNAL' : 'PUBLIC',
                content: normalizeString(comment.body || comment.content || comment.text) || 'Импортированный комментарий',
                createdAt: parseDate(comment.createdAt || comment.created_at) || new Date()
            }
        });

        await db.taskExternalReference.create({
            data: {
                system: 'FRESHDESK',
                entityType: 'COMMENT',
                externalId,
                metadata: {
                    source: 'FRESHDESK',
                    createdAt: comment.createdAt || comment.created_at || null,
                    attachments: toArray(comment.attachments)
                },
                taskId: task.id,
                commentId: createdComment.id
            }
        });
        commentResult.imported += 1;
    }

    const attachmentResult = await importTicketAttachments(db, task, ticket, requester?.id || options.createdById, options);

    return {
        action,
        taskId: task.id,
        externalId: ticket.externalId,
        externalNumber: ticket.externalNumber,
        folderPlan,
        commentResult,
        attachmentResult
    };
};

const acquireFreshdeskImportLock = async(db = prisma) => {
    const ownerId = crypto.randomUUID();
    const now = new Date();
    const ttlMs = Math.max(Number(process.env.FRESHDESK_IMPORT_LOCK_TTL_MS || 6 * 60 * 60 * 1000), 60000);
    try {
        await db.$transaction(async(tx) => {
            await tx.freshdeskImportLock.deleteMany({ where: { id: 'real-import', expiresAt: { lt: now } } });
            await tx.freshdeskImportLock.create({
                data: { id: 'real-import', ownerId, acquiredAt: now, expiresAt: new Date(now.getTime() + ttlMs) }
            });
        });
    } catch (error) {
        if (error.code === 'P2002') {
            const conflict = new Error('Уже выполняется другой реальный импорт Freshdesk. Дождитесь его завершения.');
            conflict.code = 'FRESHDESK_IMPORT_CONFLICT';
            throw conflict;
        }
        throw error;
    }
    return ownerId;
};

const releaseFreshdeskImportLock = async(ownerId, db = prisma) => {
    await db.freshdeskImportLock.deleteMany({ where: { id: 'real-import', ownerId } });
};

const withFreshdeskImportLock = async(callback, db = prisma) => {
    const ownerId = await acquireFreshdeskImportLock(db);
    try {
        return await callback(ownerId);
    } finally {
        await releaseFreshdeskImportLock(ownerId, db).catch((error) => {
            console.error('[freshdesk-import] Не удалось освободить import lock:', error.message);
        });
    }
};

const importFreshdeskRecords = async({
    records,
    dryRun = false,
    createdById = null,
    fileName = null,
    updateImportedExisting = false,
    downloadAttachments = false,
    downloadAttachment = null,
    validateAttachment = null,
    lockAlreadyHeld = false,
    db = prisma
}) => {
    if (!Array.isArray(records)) {
        throw new Error('Для импорта Freshdesk нужен массив заявок.');
    }

    if (!dryRun && !lockAlreadyHeld) {
        return withFreshdeskImportLock(() => importFreshdeskRecords({
            records,
            dryRun,
            createdById,
            fileName,
            updateImportedExisting,
            downloadAttachments,
            downloadAttachment,
            validateAttachment,
            lockAlreadyHeld: true,
            db
        }), db);
    }

    const initialSummary = {
        total: records.length,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        warnings: 0,
        commentsPlanned: 0,
        commentsImported: 0,
        commentsSkipped: 0,
        attachmentsPlanned: 0,
        attachmentsImported: 0,
        attachmentsSkipped: 0,
        attachmentsFailed: 0
    };
    const run = await db.freshdeskImportRun.create({
        data: {
            source: 'FRESHDESK',
            status: dryRun ? 'DRY_RUN' : 'SUCCESS',
            dryRun,
            fileName,
            createdById,
            summary: initialSummary,
            errors: []
        }
    });

    const summary = { ...initialSummary };
    const errors = [];

    for (let index = 0; index < records.length; index += 1) {
        try {
            const ticket = parseTicketRecord(records[index], index);
            const folderPlan = await resolveTicketFolderPlan(db, ticket);
            if (folderPlan.warning) {
                summary.warnings += 1;
                errors.push({ row: index + 1, severity: 'WARNING', message: folderPlan.warning });
            }
            const attachmentPlan = collectTicketAttachments(ticket);
            summary.commentsPlanned += ticket.comments.length;
            summary.attachmentsPlanned += attachmentPlan.length;

            if (dryRun) {
                const existingReference = await db.taskExternalReference.findUnique({
                    where: {
                        system_entityType_externalId: {
                            system: 'FRESHDESK',
                            entityType: 'TASK',
                            externalId: ticket.externalId
                        }
                    }
                });
                if (existingReference) {
                    summary[updateImportedExisting ? 'updated' : 'skipped'] += 1;
                } else {
                    summary.created += 1;
                }
                if (validateAttachment) {
                    for (const item of attachmentPlan) {
                        try {
                            if (!validateAttachment) throw new Error('Скачивание недоступно для файлового JSON/CSV импорта.');
                            await validateAttachment(item.attachment);
                        } catch (error) {
                            summary.attachmentsFailed += 1;
                            summary.errors += 1;
                            errors.push({ row: index + 1, attachment: item.attachment.fileName || item.attachment.name || null, message: error.message });
                        }
                    }
                } else {
                    summary.attachmentsSkipped += attachmentPlan.length;
                }
                continue;
            }

            const result = await importSingleTicket(db, ticket, {
                createdById,
                folderPlan,
                updateImportedExisting,
                downloadAttachment: downloadAttachments ? downloadAttachment : null
            });
            summary[result.action] += 1;
            summary.commentsImported += result.commentResult.imported;
            summary.commentsSkipped += result.commentResult.skipped;
            summary.attachmentsImported += result.attachmentResult.imported;
            summary.attachmentsSkipped += result.attachmentResult.skipped;
            summary.attachmentsFailed += result.attachmentResult.failed;
            if (result.attachmentResult.failed > 0) {
                summary.errors += result.attachmentResult.failed;
                errors.push(...result.attachmentResult.errors.map((error) => ({ row: index + 1, attachment: error.fileName, message: error.message })));
            }
        } catch (error) {
            summary.errors += 1;
            errors.push({
                row: index + 1,
                message: error.message
            });
        }
    }

    const finalStatus = summary.errors > 0
        ? (dryRun ? 'DRY_RUN' : (summary.created > 0 || summary.updated > 0 ? 'PARTIAL' : 'FAILED'))
        : (dryRun ? 'DRY_RUN' : 'SUCCESS');

    const updatedRun = await db.freshdeskImportRun.update({
        where: { id: run.id },
        data: {
            status: finalStatus,
            summary,
            errors,
            finishedAt: new Date()
        }
    });

    return {
        run: updatedRun,
        summary,
        errors
    };
};

const importFreshdeskFile = async({ filePath, dryRun = false, createdById = null, db = prisma }) => {
    const records = parseImportFile(filePath);
    return importFreshdeskRecords({
        records,
        dryRun,
        createdById,
        fileName: path.basename(filePath),
        updateImportedExisting: false,
        downloadAttachments: false,
        db
    });
};

const listFreshdeskImportRuns = async({ limit = 50, cursor = null } = {}, db = prisma) => {
    const parsedLimit = Number.parseInt(String(limit || ''), 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;

    const where = { source: 'FRESHDESK' };
    if (cursor) {
        const cursorDate = new Date(cursor);
        if (!Number.isNaN(cursorDate.getTime())) {
            where.createdAt = { lt: cursorDate };
        }
    }

    return db.freshdeskImportRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        include: {
            createdBy: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                }
            }
        }
    });
};

const getFreshdeskImportRun = async(id, db = prisma) => {
    const run = await db.freshdeskImportRun.findUnique({
        where: { id },
        include: {
            createdBy: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                }
            }
        }
    });

    if (!run || run.source !== 'FRESHDESK') {
        const error = new Error('Запуск импорта Freshdesk не найден.');
        error.code = 'FRESHDESK_IMPORT_NOT_FOUND';
        throw error;
    }

    return run;
};

module.exports = {
    parseImportFile,
    importFreshdeskRecords,
    importFreshdeskFile,
    listFreshdeskImportRuns,
    getFreshdeskImportRun,
    withFreshdeskImportLock,
    acquireFreshdeskImportLock,
    releaseFreshdeskImportLock,
    resolveTicketFolderPlan,
    collectTicketAttachments,
    normalizeFreshdeskStatus,
    normalizePriority
};
