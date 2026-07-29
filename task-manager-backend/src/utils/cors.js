const DEFAULT_DEVELOPMENT_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

const normalizeConfiguredOrigin = (value) => {
    const candidate = String(value || '').trim();
    if (!candidate) {
        return null;
    }
    if (candidate === '*') {
        throw new Error('CORS wildcard is not allowed; configure explicit frontend origins');
    }

    let parsed;
    try {
        parsed = new URL(candidate);
    } catch {
        throw new Error(`Invalid CORS origin: ${candidate}`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)
        || parsed.username
        || parsed.password
        || parsed.pathname !== '/'
        || parsed.search
        || parsed.hash) {
        throw new Error(`Invalid CORS origin: ${candidate}. Use only scheme, host and optional port`);
    }

    return parsed.origin;
};

const resolveAllowedOrigins = (env = process.env) => {
    const configured = env.CORS_ORIGINS || env.CORS_ORIGIN;
    const values = configured ? configured.split(',') : DEFAULT_DEVELOPMENT_ORIGINS;
    const origins = values.map(normalizeConfiguredOrigin).filter(Boolean);

    if (origins.length === 0) {
        throw new Error('At least one explicit CORS origin must be configured');
    }

    return new Set(origins);
};

const isOriginAllowed = (origin, allowedOrigins) => !origin || allowedOrigins.has(origin);

module.exports = {
    DEFAULT_DEVELOPMENT_ORIGINS,
    normalizeConfiguredOrigin,
    resolveAllowedOrigins,
    isOriginAllowed
};
