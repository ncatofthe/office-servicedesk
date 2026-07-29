const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const auditMiddleware = (req, res, next) => {
    const startedAt = Date.now();

    res.on('finish', () => {
        if (!AUDITED_METHODS.has(req.method) || !req.originalUrl.startsWith('/api/')) {
            return;
        }

        const auditRecord = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            ip: req.ip,
            userId: req.user ? req.user.id : null,
            userRole: req.user ? req.user.role : null
        };

        console.info('[AUDIT]', JSON.stringify(auditRecord));
    });

    next();
};

module.exports = auditMiddleware;
