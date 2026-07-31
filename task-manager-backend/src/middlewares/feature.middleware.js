const productSettingsService = require('../services/product-settings.service.js');

const createFeatureDisabledResponse = (feature) => ({
    error: 'Эта функция отключена администратором.',
    code: 'FEATURE_DISABLED',
    feature
});

const requireFeature = (feature) => async(req, res, next) => {
    try {
        // The feature control plane must always remain reachable, otherwise an
        // administrator could disable the very API needed to turn a feature back on.
        if (String(req.originalUrl || '').split('?')[0] === '/api/servicedesk/admin/product-settings') {
            next();
            return;
        }

        if (await productSettingsService.isFeatureEnabled(feature)) {
            next();
            return;
        }
        res.status(403).json(createFeatureDisabledResponse(feature));
    } catch (error) {
        next(error);
    }
};

module.exports = {
    requireFeature
};
