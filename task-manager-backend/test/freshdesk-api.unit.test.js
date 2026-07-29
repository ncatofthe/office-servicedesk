const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createFreshdeskApiClient,
    assertSafeRemoteUrl,
    getFreshdeskSourceHealth,
    TRUSTED_FRESHDESK_ATTACHMENT
} = require('../src/services/freshdesk-api.service.js');

const publicDns = async() => [{ address: '93.184.216.34', family: 4 }];
const jsonResponse = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
});

test('Freshdesk client paginates, loads all conversations and retries 429 without exposing secret', async() => {
    const calls = [];
    let rateLimited = true;
    const fetchImpl = async(url) => {
        calls.push(url.toString());
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/agents')) return jsonResponse([]);
        if (parsed.pathname.endsWith('/groups')) return jsonResponse([]);
        if (parsed.pathname.endsWith('/tickets/7/conversations')) {
            if (rateLimited) {
                rateLimited = false;
                return jsonResponse({}, 429, { 'retry-after': '0' });
            }
            return jsonResponse([{ id: 1, body_text: 'one' }, { id: 2, body_text: 'two' }]);
        }
        if (parsed.pathname.endsWith('/tickets/7')) return jsonResponse({ id: 7, status: 3, priority: 4, source: 1, requester: { email: 'u@example.com' } });
        if (parsed.pathname.endsWith('/tickets')) return jsonResponse(parsed.searchParams.get('page') === '1' ? [{ id: 7 }] : []);
        if (parsed.pathname.endsWith('/contacts/1')) return jsonResponse({ id: 1, email: 'u@example.com' });
        return jsonResponse([]);
    };
    const client = createFreshdeskApiClient({
        config: { domain: 'desk.example.com', apiKey: 'super-secret', maxRetries: 2, timeoutMs: 5000 },
        fetchImpl,
        resolveHost: publicDns,
        sleepImpl: async() => {}
    });
    const records = await client.pullTickets({ maxTickets: 1 });
    assert.equal(records.length, 1);
    assert.equal(records[0].comments.length, 2);
    assert.equal(records[0].sourceChannel, 'EMAIL');
    assert.ok(calls.filter((url) => url.includes('/conversations')).length >= 2);
    assert.ok(calls.every((url) => !url.includes('super-secret')));
});

test('Freshdesk list pagination requests the next page', async() => {
    const pages = [];
    const client = createFreshdeskApiClient({
        config: { domain: 'desk.example.com', apiKey: 'key', maxRetries: 0, timeoutMs: 5000 },
        resolveHost: publicDns,
        fetchImpl: async(url) => {
            const page = Number(new URL(url).searchParams.get('page'));
            pages.push(page);
            return jsonResponse(page === 1 ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 101 }]);
        }
    });
    assert.equal((await client.listAll('/tickets')).length, 101);
    assert.deepEqual(pages, [1, 2]);
});

test('attachment policy rejects http, private targets and oversize plans', async() => {
    await assert.rejects(() => assertSafeRemoteUrl('http://example.com/a', publicDns), /HTTPS/);
    await assert.rejects(() => assertSafeRemoteUrl('https://127.0.0.1/a', publicDns), /локальный/);
    await assert.rejects(() => assertSafeRemoteUrl('https://files.example.com/a', async() => [{ address: '192.168.1.2' }]), /private/);
    const client = createFreshdeskApiClient({
        config: { domain: 'desk.example.com', apiKey: 'key', attachmentMaxBytes: 10, timeoutMs: 5000 },
        resolveHost: publicDns,
        fetchImpl: async() => jsonResponse({})
    });
    const attachment = { url: 'https://files.example.com/a', sizeBytes: 11 };
    Object.defineProperty(attachment, TRUSTED_FRESHDESK_ATTACHMENT, { value: true });
    await assert.rejects(() => client.validateAttachment(attachment), /размер/);
});

test('source health masks domain and never returns API key', () => {
    const previous = { domain: process.env.FRESHDESK_DOMAIN, key: process.env.FRESHDESK_API_KEY };
    process.env.FRESHDESK_DOMAIN = 'company.freshdesk.com';
    process.env.FRESHDESK_API_KEY = 'never-return-me';
    const health = getFreshdeskSourceHealth();
    assert.equal(health.configured, true);
    assert.equal(JSON.stringify(health).includes('never-return-me'), false);
    assert.match(health.maskedDomain, /\*\*\*/);
    if (previous.domain === undefined) delete process.env.FRESHDESK_DOMAIN; else process.env.FRESHDESK_DOMAIN = previous.domain;
    if (previous.key === undefined) delete process.env.FRESHDESK_API_KEY; else process.env.FRESHDESK_API_KEY = previous.key;
});
