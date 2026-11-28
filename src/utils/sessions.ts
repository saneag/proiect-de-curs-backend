import { prisma } from '../db';
import { REFRESH_TOKEN_MAX_AGE_MS, hashToken } from './tokens';

// A user may stay signed in on a few devices at once.
const MAX_SESSIONS = 5;
// A rotated refresh token still works briefly, so two tabs refreshing together do not clash.
const ROTATION_GRACE_MS = 30 * 1000;

export type RotationResult =
    | { status: 'rotated' }
    | { status: 'reuse' }
    | { status: 'invalid' };

/** Starts a session, dropping expired ones and the oldest ones over the limit. */
export async function createSession(userId: string, token: string) {
    await prisma.session.create({
        data: {
            userId,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
        },
    });
    const stale = await prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: MAX_SESSIONS,
        select: { id: true },
    });
    await prisma.session.deleteMany({
        where: {
            OR: [
                { id: { in: stale.map(({ id }) => id) } },
                { userId, expiresAt: { lt: new Date() } },
            ],
        },
    });
}

/**
 * Swaps a session's refresh token for a new one. Presenting a token that was
 * already replaced (after the grace period) means it was copied, so the caller
 * should revoke every session of that user.
 */
export async function rotateSession(
    userId: string,
    oldToken: string,
    newToken: string,
    retry = true
): Promise<RotationResult> {
    const oldHash = hashToken(oldToken);
    const now = new Date();
    const session = await prisma.session.findFirst({
        where: {
            userId,
            OR: [{ tokenHash: oldHash }, { previousHash: oldHash }],
        },
    });
    if (!session || session.expiresAt < now) return { status: 'invalid' };

    const withinGrace =
        session.previousHash === oldHash &&
        session.graceUntil !== null &&
        now <= session.graceUntil;
    if (session.tokenHash !== oldHash && !withinGrace) {
        return { status: 'reuse' };
    }

    const { count } = await prisma.session.updateMany({
        where: { id: session.id, tokenHash: session.tokenHash },
        data: {
            tokenHash: hashToken(newToken),
            previousHash: oldHash,
            graceUntil: new Date(now.getTime() + ROTATION_GRACE_MS),
            expiresAt: new Date(now.getTime() + REFRESH_TOKEN_MAX_AGE_MS),
        },
    });
    if (count === 1) return { status: 'rotated' };
    // Another request rotated this session first; look again once.
    return retry
        ? rotateSession(userId, oldToken, newToken, false)
        : { status: 'invalid' };
}

export const revokeAllSessions = (userId: string) =>
    prisma.session.deleteMany({ where: { userId } });

export const removeSession = (userId: string, token: string) => {
    const hash = hashToken(token);
    return prisma.session.deleteMany({
        where: {
            userId,
            OR: [{ tokenHash: hash }, { previousHash: hash }],
        },
    });
};
