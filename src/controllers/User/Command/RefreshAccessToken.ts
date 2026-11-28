import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { prisma } from '../../../db';

import { ICommand } from '../../../interfaces/IUser/Command/ICommand';
import { IDecodedJwt } from '../../../interfaces/IUser/IDecodedJwt';
import {
    clearAuthCookies,
    readRefreshToken,
    setAuthCookies,
} from '../../../utils/authCookies';
import {
    JWT_ALGORITHM,
    signAccessToken,
    signRefreshToken,
} from '../../../utils/tokens';
import { revokeAllSessions, rotateSession } from '../../../utils/sessions';
import { isUuid } from '../../../utils/validation';

export class RefreshAccessToken implements ICommand {
    public async execute(req: Request<Record<string, string>>, res: Response): Promise<void> {
        const reject = (message = 'Invalid refresh token') => {
            clearAuthCookies(res);
            res.status(401).json({ message });
        };

        try {
            const refreshToken = readRefreshToken(req);
            if (!refreshToken) {
                reject();
                return;
            }

            const decoded: IDecodedJwt = jwt.verify(
                refreshToken,
                process.env.JWTREFRESHSECRET as string,
                { algorithms: [JWT_ALGORITHM] }
            ) as IDecodedJwt;

            const user = isUuid(decoded.userId)
                ? await prisma.user.findUnique({
                      where: { id: decoded.userId },
                  })
                : null;

            if (!user) {
                reject();
                return;
            }

            // Every refresh issues a new refresh token and retires the old one.
            const newRefreshToken = signRefreshToken(user.id);
            const rotation = await rotateSession(
                user.id,
                refreshToken,
                newRefreshToken
            );

            if (rotation.status === 'reuse') {
                // A retired token was replayed: assume it was copied and end every session.
                await revokeAllSessions(user.id);
                reject();
                return;
            }

            if (rotation.status === 'invalid') {
                reject();
                return;
            }

            setAuthCookies(res, signAccessToken(user.id), newRefreshToken);
            res.status(200).json({ message: 'Access token refreshed' });
        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                reject('Invalid or expired refresh token');
                return;
            }
            console.error(error as Error);
            res.status(500).send('Server error');
        }
    }
}
