const DEFAULT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const DEFAULT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 2000);
const DEFAULT_LOGIN_MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS || 30);
const DEFAULT_REGISTER_MAX_REQUESTS = Number(process.env.REGISTER_RATE_LIMIT_MAX_REQUESTS || 20);

const createRateLimit = ({ windowMs, maxRequests, keyPrefix }) => {
    const buckets = new Map();

    return (req, res, next) => {
        const key = `${keyPrefix}:${req.ip}`;
        const now = Date.now();
        const bucket = buckets.get(key);

        if (!bucket || now > bucket.resetAt) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', Math.max(maxRequests - 1, 0));
            return next();
        }

        if (bucket.count >= maxRequests) {
            const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
            res.setHeader('Retry-After', retryAfterSec);
            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', 0);
            return res.status(429).json({
                error: 'Too many requests. Please try again later.'
            });
        }

        bucket.count += 1;
        buckets.set(key, bucket);
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(maxRequests - bucket.count, 0));
        next();
    };
};

const globalRateLimit = createRateLimit({
    windowMs: DEFAULT_WINDOW_MS,
    maxRequests: DEFAULT_MAX_REQUESTS,
    keyPrefix: 'global'
});

const loginRateLimit = createRateLimit({
    windowMs: DEFAULT_WINDOW_MS,
    maxRequests: DEFAULT_LOGIN_MAX_REQUESTS,
    keyPrefix: 'auth-login'
});

const registerRateLimit = createRateLimit({
    windowMs: DEFAULT_WINDOW_MS,
    maxRequests: DEFAULT_REGISTER_MAX_REQUESTS,
    keyPrefix: 'auth-register'
});

module.exports = {
    createRateLimit,
    globalRateLimit,
    loginRateLimit,
    registerRateLimit
};
