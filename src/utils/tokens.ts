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

// A user may stay signed in on a few devices at once.
const MAX_SESSIONS = 5;
// A rotated refresh token still works briefly, so two tabs refreshing together do not clash.
const ROTATION_GRACE_MS = 30 * 1000;

/** Refresh tokens are stored hashed, so a database leak cannot be replayed. */
export const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');

interface Session {
    current: string;
    previous?: string;
    graceUntil?: number;
}

// The `refreshToken` column holds one entry per device, comma separated:
// `<current hash>` or `<current hash>.<previous hash>.<grace end>` after a rotation.
const parseSessions = (stored: string | null): Session[] =>
    stored
        ? stored
              .split(',')
              .filter(Boolean)
              .map((entry) => {
                  const [current, previous, graceUntil] = entry.split('.');
                  return {
                      current,
                      previous,
                      graceUntil: graceUntil ? Number(graceUntil) : undefined,
                  };
              })
        : [];

const serializeSessions = (sessions: Session[]) =>
    sessions
        .map((session) =>
            session.previous
                ? `${session.current}.${session.previous}.${session.graceUntil}`
                : session.current
        )
        .join(',') || null;

/** Adds a new session, dropping the oldest one when the limit is reached. */
export const addRefreshToken = (stored: string | null, token: string) =>
    serializeSessions(
        [...parseSessions(stored), { current: hashToken(token) }].slice(
            -MAX_SESSIONS
        )
    ) as string;

export type RotationResult =
    | { status: 'rotated'; stored: string }
    | { status: 'reuse' }
    | { status: 'invalid' };

/**
 * Swaps a session's refresh token for a new one. Presenting a token that was
 * already replaced (after the grace period) means it was copied, so the caller
 * should revoke every session of that user.
 */
export function rotateRefreshToken(
    stored: string | null,
    oldToken: string,
    newToken: string,
    now = Date.now()
): RotationResult {
    const oldHash = hashToken(oldToken);
    const sessions = parseSessions(stored);
    const index = sessions.findIndex(
        (session) => session.current === oldHash || session.previous === oldHash
    );
    if (index === -1) return { status: 'invalid' };

    const session = sessions[index];
    const withinGrace =
        session.previous === oldHash &&
        session.graceUntil !== undefined &&
        now <= session.graceUntil;
    if (session.current !== oldHash && !withinGrace) return { status: 'reuse' };

    sessions[index] = {
        current: hashToken(newToken),
        previous: oldHash,
        graceUntil: now + ROTATION_GRACE_MS,
    };
    return { status: 'rotated', stored: serializeSessions(sessions) as string };
}

/** Removes one session; returns null when none are left. */
export const removeRefreshToken = (stored: string | null, token: string) => {
    const hash = hashToken(token);
    return serializeSessions(
        parseSessions(stored).filter(
            (session) => session.current !== hash && session.previous !== hash
        )
    );
};
