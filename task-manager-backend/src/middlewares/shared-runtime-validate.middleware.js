const { loadContractsRuntime } = require('../utils/contracts-runtime.js');

const sharedRuntimeValidate = (schemaExportName, options = {}) => {
    return (req, res, next) => {
        const runtime = loadContractsRuntime();

        // Keep current backend behavior unchanged if the runtime bundle
        // has not been built yet.
        if (!runtime) {
            return next();
        }

        const schema = runtime[schemaExportName];

        if (!schema || typeof schema.parse !== 'function') {
            return next(new Error(`Shared runtime schema "${schemaExportName}" is not available`));
        }

        try {
            const originalBody = req.body;
            req.body = schema.parse(req.body);
            const passthroughFields = Array.isArray(options.passthroughFields)
                ? options.passthroughFields
                : [];
            for (const field of passthroughFields) {
                if (Object.prototype.hasOwnProperty.call(originalBody || {}, field)) {
                    req.body[field] = originalBody[field];
                }
            }
            req.sharedRuntimeValidated = {
                ...(req.sharedRuntimeValidated || {}),
                [schemaExportName]: true
            };
            req.sharedRuntimeOriginalBodies = {
                ...(req.sharedRuntimeOriginalBodies || {}),
                [schemaExportName]: originalBody
            };
            next();
        } catch (error) {
            const issues = Array.isArray(error.issues) && error.issues.length > 0
                ? error.issues
                : [error.message || 'Invalid request payload'];

            if (options.errorShape === 'single-error') {
                return res.status(400).json({
                    error: issues[0]
                });
            }

            return res.status(400).json({
                errors: issues.map((message) => ({
                    msg: message,
                    source: 'shared-runtime',
                    schema: schemaExportName
                }))
            });
        }
    };
};

module.exports = sharedRuntimeValidate;
