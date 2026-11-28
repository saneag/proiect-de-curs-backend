import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

export const JWT_ALGORITHM = 'HS256' as const;

export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const signAccessToken = (userId: string) =>
    jwt.sign({ userId }, process.env.JWTSECRET as string, {
        algorithm: JWT_ALGORITHM,
        expiresIn: Math.floor(ACCESS_TOKEN_MAX_AGE_MS / 1000),
    });

// Each refresh token is unique, so devices that sign in together never share one.
export const signRefreshToken = (userId: string) =>
    jwt.sign({ userId }, process.env.JWTREFRESHSECRET as string, {
        algorithm: JWT_ALGORITHM,
        expiresIn: Math.floor(REFRESH_TOKEN_MAX_AGE_MS / 1000),
        jwtid: randomUUID(),
    });

/** Refresh tokens are stored hashed, so a database leak cannot be replayed. */
export const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');
