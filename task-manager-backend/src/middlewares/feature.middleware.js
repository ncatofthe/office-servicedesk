const productSettingsService = require('../services/product-settings.service.js');

const createFeatureDisabledResponse = (feature) => ({
    error: 'Эта функция отключена администратором.',
    code: 'FEATURE_DISABLED',
    feature
});

const requireFeature = (feature) => async(req, res, next) => {
    try {
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
