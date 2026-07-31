const { test } = require('node:test');
const assert = require('node:assert/strict');

const productSettingsServicePath = require.resolve('../src/services/product-settings.service.js');
let featureEnabledImpl = async() => true;
require.cache[productSettingsServicePath] = {
    id: productSettingsServicePath,
    filename: productSettingsServicePath,
    loaded: true,
    exports: {
        isFeatureEnabled: (...args) => featureEnabledImpl(...args)
    }
};
const { requireFeature } = require('../src/middlewares/feature.middleware.js');

test('feature control-plane endpoint is never blocked by a feature gate', async() => {
    featureEnabledImpl = async() => {
        throw new Error('Feature lookup must not run for the control plane.');
    };

    let nextCalled = false;
    await requireFeature('freshdeskImport')(
        { originalUrl: '/api/servicedesk/admin/product-settings' },
        {},
        () => {
            nextCalled = true;
        }
    );

    assert.equal(nextCalled, true);
});

test('feature middleware still blocks disabled application endpoints', async() => {
    featureEnabledImpl = async() => false;

    let statusCode = null;
    let payload = null;
    const response = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(body) {
            payload = body;
            return this;
        }
    };

    await requireFeature('freshdeskImport')(
        { originalUrl: '/api/servicedesk/admin/freshdesk-import' },
        response,
        () => assert.fail('Disabled endpoint must not call next().')
    );

    assert.equal(statusCode, 403);
    assert.equal(payload.code, 'FEATURE_DISABLED');
    assert.equal(payload.feature, 'freshdeskImport');
});
