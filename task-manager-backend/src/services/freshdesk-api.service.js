const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { uploadsDir } = require('../middlewares/upload.middleware.js');

const TRUSTED_FRESHDESK_ATTACHMENT = Symbol('trusted-freshdesk-attachment');
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeFreshdeskDomain = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || (url.pathname && url.pathname !== '/')) {
        throw new Error('FRESHDESK_DOMAIN должен содержать только HTTPS-домен без пути, порта и credentials.');
    }
    return url.hostname.toLowerCase();
};

const maskDomain = (domain) => {
    if (!domain) return null;
    const [first, ...rest] = domain.split('.');
    const masked = first.length <= 3 ? `${first[0] || '*'}***` : `${first.slice(0, 3)}***`;
    return [masked, ...rest].join('.');
};

const getFreshdeskApiConfig = () => {
    let domain = null;
    let domainError = null;
    try {
        domain = normalizeFreshdeskDomain(process.env.FRESHDESK_DOMAIN);
    } catch (error) {
        domainError = error.message;
    }
    return {
        domain,
        domainError,
        apiKey: String(process.env.FRESHDESK_API_KEY || '').trim() || null,
        attachmentMaxBytes: Math.max(Number(process.env.FRESHDESK_ATTACHMENT_MAX_BYTES || 25 * 1024 * 1024), 1),
        downloadAttachmentsEnabled: String(process.env.FRESHDESK_DOWNLOAD_ATTACHMENTS_ENABLED || 'false').toLowerCase() === 'true',
        timeoutMs: Math.max(Number(process.env.FRESHDESK_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS), 1000),
        maxRetries: Math.min(Math.max(Number(process.env.FRESHDESK_API_MAX_RETRIES || DEFAULT_RETRIES), 0), 5)
    };
};

const getFreshdeskSourceHealth = () => {
    const config = getFreshdeskApiConfig();
    return {
        configured: Boolean(config.domain && config.apiKey && !config.domainError),
        domain: config.domain ? maskDomain(config.domain) : null,
        maskedDomain: config.domain ? maskDomain(config.domain) : null,
        downloadAttachmentsEnabled: config.downloadAttachmentsEnabled,
        configurationError: config.domainError
    };
};

const requireFreshdeskApiConfig = (overrides = {}) => {
    const config = { ...getFreshdeskApiConfig(), ...overrides };
    if (config.domainError) throw new Error(config.domainError);
    if (!config.domain || !config.apiKey) {
        const error = new Error('Freshdesk API не настроен: задайте FRESHDESK_DOMAIN и FRESHDESK_API_KEY.');
        error.code = 'FRESHDESK_NOT_CONFIGURED';
        throw error;
    }
    return config;
};

const isPrivateIp = (address) => {
    const value = String(address || '').toLowerCase();
    if (!value) return true;
    if (value === '::1' || value === '::' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true;
    const mappedIpv4 = value.startsWith('::ffff:') ? value.slice('::ffff:'.length) : value;
    const parts = mappedIpv4.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
};

const assertSafeRemoteUrl = async(rawUrl, resolveHost = dns.lookup) => {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('Attachment URL должен использовать HTTPS без credentials.');
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || isPrivateIp(hostname)) {
        throw new Error('Attachment URL указывает на запрещённый локальный адрес.');
    }
    const addresses = await resolveHost(hostname, { all: true, verbatim: true });
    const list = Array.isArray(addresses) ? addresses : [addresses];
    if (list.length === 0 || list.some((entry) => isPrivateIp(entry?.address || entry))) {
        throw new Error('Attachment URL разрешается в private/link-local адрес.');
    }
    return url;
};

const parseRetryAfterMs = (value, attempt) => {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return Math.min(Math.max(date.getTime() - Date.now(), 0), 30000);
    return Math.min(500 * (2 ** attempt), 5000);
};

const createFreshdeskApiClient = (options = {}) => {
    const config = requireFreshdeskApiConfig(options.config);
    const fetchImpl = options.fetchImpl || global.fetch;
    const resolveHost = options.resolveHost || dns.lookup;
    const sleepImpl = options.sleepImpl || sleep;
    const authHeader = `Basic ${Buffer.from(`${config.apiKey}:X`).toString('base64')}`;

    const request = async(rawUrl, requestOptions = {}) => {
        let url = rawUrl.startsWith('http') ? rawUrl : `https://${config.domain}/api/v2${rawUrl}`;
        let redirects = 0;
        let attempt = 0;
        while (true) {
            const safeUrl = await assertSafeRemoteUrl(url, resolveHost);
            const headers = { Accept: 'application/json', ...(requestOptions.headers || {}) };
            if (safeUrl.hostname.toLowerCase() === config.domain) headers.Authorization = authHeader;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), config.timeoutMs);
            let response;
            try {
                response = await fetchImpl(safeUrl, { ...requestOptions, headers, redirect: 'manual', signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                if (redirects >= 3) throw new Error('Превышен лимит redirects при загрузке Freshdesk.');
                const location = response.headers.get('location');
                if (!location) throw new Error('Freshdesk вернул redirect без Location.');
                url = new URL(location, safeUrl).toString();
                redirects += 1;
                continue;
            }
            if (response.status === 429 && attempt < config.maxRetries) {
                await sleepImpl(parseRetryAfterMs(response.headers.get('retry-after'), attempt));
                attempt += 1;
                continue;
            }
            if (!response.ok) {
                const error = new Error(`Freshdesk API вернул HTTP ${response.status}.`);
                error.code = response.status === 429 ? 'FRESHDESK_RATE_LIMIT' : 'FRESHDESK_API_ERROR';
                error.status = response.status;
                throw error;
            }
            return response;
        }
    };

    const requestJson = async(endpoint) => (await request(endpoint)).json();

    const listAll = async(endpoint, maxItems = Infinity) => {
        const result = [];
        for (let page = 1; page <= 300 && result.length < maxItems; page += 1) {
            const separator = endpoint.includes('?') ? '&' : '?';
            const pageItems = await requestJson(`${endpoint}${separator}per_page=100&page=${page}`);
            if (!Array.isArray(pageItems)) throw new Error('Freshdesk API вернул некорректный список.');
            result.push(...pageItems.slice(0, maxItems - result.length));
            if (pageItems.length < 100) break;
            if (page === 300 && result.length < maxItems) {
                throw new Error('Достигнут лимит Freshdesk API в 300 страниц. Повторите импорт с более поздним updatedSince.');
            }
        }
        return result;
    };

    const markAttachment = (attachment, context) => {
        const marked = { ...attachment, ...context };
        Object.defineProperty(marked, TRUSTED_FRESHDESK_ATTACHMENT, { value: true, enumerable: false });
        return marked;
    };

    const pullTickets = async({ updatedSince, maxTickets = Infinity } = {}) => {
        const since = updatedSince
            ? new Date(updatedSince).toISOString()
            : '1970-01-01T00:00:00.000Z';
        const ticketList = await listAll(`/tickets?updated_since=${encodeURIComponent(since)}`, maxTickets);
        const [agents, groups] = await Promise.all([listAll('/agents'), listAll('/groups')]);
        const agentById = new Map(agents.map((agent) => [String(agent.id), agent]));
        const groupById = new Map(groups.map((group) => [String(group.id), group]));
        const contactCache = new Map();
        const records = [];

        for (const listed of ticketList) {
            const [detail, conversations] = await Promise.all([
                requestJson(`/tickets/${listed.id}?include=requester,stats`),
                listAll(`/tickets/${listed.id}/conversations`)
            ]);
            let requester = detail.requester || null;
            if (!requester?.email && detail.requester_id) {
                const key = String(detail.requester_id);
                if (!contactCache.has(key)) contactCache.set(key, await requestJson(`/contacts/${key}`));
                requester = contactCache.get(key);
            }
            const responder = agentById.get(String(detail.responder_id)) || null;
            const group = groupById.get(String(detail.group_id)) || null;
            const normalizeAttachments = (items, owner) => (items || []).map((item) => markAttachment(item, {
                externalId: String(item.id || item.attachment_id || crypto.randomUUID()),
                fileName: item.name || item.filename || 'freshdesk-attachment',
                url: item.attachment_url || item.url,
                contentType: item.content_type || null,
                sizeBytes: item.size || null,
                owner
            }));
            records.push({
                ...detail,
                externalId: String(detail.id),
                externalNumber: String(detail.id),
                requester: requester ? { email: requester.email, name: requester.name || requester.email } : null,
                agent: responder ? { email: responder.contact?.email || responder.email, name: responder.contact?.name || responder.name } : null,
                groupName: group?.name || null,
                comments: conversations.map((conversation) => ({
                    ...conversation,
                    body: conversation.body_text || conversation.body,
                    private: Boolean(conversation.private),
                    createdAt: conversation.created_at,
                    author: conversation.from_email ? { email: conversation.from_email, name: conversation.user_name || conversation.from_email } : null,
                    attachments: normalizeAttachments(conversation.attachments, `conversation:${conversation.id}`)
                })),
                attachments: normalizeAttachments(detail.attachments, `ticket:${detail.id}`),
                sourceChannel: Number(detail.source) === 1 ? 'EMAIL' : 'WEB',
                sourceMetadata: {
                    requesterId: detail.requester_id || null,
                    responderId: detail.responder_id || null,
                    groupId: detail.group_id || null,
                    groupName: group?.name || null,
                    tags: Array.isArray(detail.tags) ? detail.tags : [],
                    customFields: detail.custom_fields || {},
                    source: detail.source || null
                }
            });
        }
        return records;
    };

    const downloadAttachment = async(attachment) => {
        if (!attachment?.[TRUSTED_FRESHDESK_ATTACHMENT]) throw new Error('Attachment не получен из доверенного Freshdesk API pull.');
        if (!attachment.url) throw new Error('У attachment отсутствует URL.');
        const response = await request(attachment.url, { headers: { Accept: '*/*' } });
        const declaredLength = Number(response.headers.get('content-length') || 0);
        if (declaredLength > config.attachmentMaxBytes) throw new Error('Attachment превышает разрешённый размер.');
        const safeOriginal = path.basename(String(attachment.fileName || 'freshdesk-attachment')).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'freshdesk-attachment';
        const extension = path.extname(safeOriginal).slice(0, 16).toLowerCase();
        const storedName = `freshdesk-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
        const absolutePath = path.join(uploadsDir, storedName);
        let received = 0;
        const limiter = new (require('stream').Transform)({
            transform(chunk, encoding, callback) {
                received += chunk.length;
                if (received > config.attachmentMaxBytes) return callback(new Error('Attachment превышает разрешённый размер.'));
                callback(null, chunk);
            }
        });
        try {
            await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(absolutePath, { flags: 'wx' }));
            return { filename: safeOriginal, storedName, absolutePath, path: `/uploads/${storedName}`, sizeBytes: received };
        } catch (error) {
            fs.rmSync(absolutePath, { force: true });
            throw error;
        }
    };

    const validateAttachment = async(attachment) => {
        if (!attachment?.[TRUSTED_FRESHDESK_ATTACHMENT]) throw new Error('Attachment не получен из доверенного Freshdesk API pull.');
        if (!attachment.url) throw new Error('У attachment отсутствует URL.');
        await assertSafeRemoteUrl(attachment.url, resolveHost);
        const declaredSize = Number(attachment.sizeBytes || attachment.size || 0);
        if (declaredSize > config.attachmentMaxBytes) throw new Error('Attachment превышает разрешённый размер.');
        return true;
    };

    return { config, requestJson, listAll, pullTickets, downloadAttachment, validateAttachment };
};

const pullAndImportFreshdesk = async(options = {}) => {
    const dryRun = Boolean(options.dryRun);
    const maxTickets = options.maxTickets === undefined || options.maxTickets === null
        ? Infinity
        : Math.max(Number(options.maxTickets), 1);
    const updatedSince = options.updatedSince || null;
    if (updatedSince && Number.isNaN(new Date(updatedSince).getTime())) throw new Error('updatedSince должен быть корректной ISO-датой.');
    const client = createFreshdeskApiClient(options.clientOptions || {});
    const downloadAttachments = Boolean(options.downloadAttachments);
    if (downloadAttachments && !client.config.downloadAttachmentsEnabled) {
        throw new Error('Скачивание вложений отключено. Установите FRESHDESK_DOWNLOAD_ATTACHMENTS_ENABLED=true.');
    }
    const importer = require('./freshdesk-import.service.js');

    const execute = async(lockAlreadyHeld) => {
        const records = await client.pullTickets({ updatedSince, maxTickets });
        return importer.importFreshdeskRecords({
            records,
            dryRun,
            createdById: options.createdById || null,
            fileName: `freshdesk-api-${new Date().toISOString()}`,
            updateImportedExisting: Boolean(options.updateImportedExisting),
            downloadAttachments,
            downloadAttachment: client.downloadAttachment,
            validateAttachment: downloadAttachments ? client.validateAttachment : null,
            lockAlreadyHeld,
            db: options.db
        });
    };

    if (dryRun) return execute(false);
    return importer.withFreshdeskImportLock(() => execute(true), options.db);
};

module.exports = {
    TRUSTED_FRESHDESK_ATTACHMENT,
    normalizeFreshdeskDomain,
    getFreshdeskSourceHealth,
    createFreshdeskApiClient,
    pullAndImportFreshdesk,
    assertSafeRemoteUrl,
    isPrivateIp
};
