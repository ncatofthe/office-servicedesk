const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    isOriginAllowed,
    resolveAllowedOrigins
} = require('../src/utils/cors.js');

test('CORS allows only explicitly configured browser origins', () => {
    const allowed = resolveAllowedOrigins({
        CORS_ORIGINS: 'https://desk.example.ru/, https://desk-tunnel.trycloudflare.com'
    });

    assert.equal(isOriginAllowed('https://desk.example.ru', allowed), true);
    assert.equal(isOriginAllowed('https://desk-tunnel.trycloudflare.com', allowed), true);
    assert.equal(isOriginAllowed('https://random.trycloudflare.com', allowed), false);
    assert.equal(isOriginAllowed('https://desk.example.ru.evil.test', allowed), false);
    assert.equal(isOriginAllowed(undefined, allowed), true);
});

test('CORS rejects wildcard and URL values with paths', () => {
    assert.throws(
        () => resolveAllowedOrigins({ CORS_ORIGINS: '*' }),
        /wildcard is not allowed/
    );
    assert.throws(
        () => resolveAllowedOrigins({ CORS_ORIGINS: 'https://desk.example.ru/app' }),
        /Use only scheme, host and optional port/
    );
});

test('CORS_ORIGINS takes precedence over the single-origin alias', () => {
    const allowed = resolveAllowedOrigins({
        CORS_ORIGINS: 'https://primary.example.ru',
        CORS_ORIGIN: 'https://ignored.example.ru'
    });

    assert.equal(isOriginAllowed('https://primary.example.ru', allowed), true);
    assert.equal(isOriginAllowed('https://ignored.example.ru', allowed), false);
});
