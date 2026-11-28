import rateLimit from 'express-rate-limit';

const windowMs = 15 * 60 * 1000;

const limitFromEnv = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

const createLimiter = (limit: number, skipSuccessfulRequests = false) =>
    rateLimit({
        windowMs,
        limit,
        skipSuccessfulRequests,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { message: 'Too many requests, please try again later.' },
    });

// Only failed logins count, so normal use is never throttled but guessing is.
export const loginLimiter = createLimiter(
    limitFromEnv('LOGIN_RATE_LIMIT', 20),
    true
);
export const registerLimiter = createLimiter(
    limitFromEnv('REGISTER_RATE_LIMIT', 20)
);
export const refreshLimiter = createLimiter(
    limitFromEnv('REFRESH_RATE_LIMIT', 100)
);
export const uploadLimiter = createLimiter(
    limitFromEnv('UPLOAD_RATE_LIMIT', 60)
);
