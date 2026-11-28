import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { ICommand } from '../../../interfaces/IUser/Command/ICommand';
import { IDecodedJwt } from '../../../interfaces/IUser/IDecodedJwt';
import { clearAuthCookies, readRefreshToken } from '../../../utils/authCookies';
import { JWT_ALGORITHM, removeRefreshToken } from '../../../utils/tokens';
import { prisma } from '../../../db';

export class Logout implements ICommand {
    public async execute(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const refreshToken = readRefreshToken(req);
            if (refreshToken) {
                try {
                    const { userId } = jwt.verify(
                        refreshToken,
                        process.env.JWTREFRESHSECRET as string,
                        { algorithms: [JWT_ALGORITHM] }
                    ) as IDecodedJwt;
                    const user = await prisma.user.findUnique({
                        where: { id: userId },
                    });
                    if (user) {
                        await prisma.user.update({
                            where: { id: user.id },
                            data: {
                                refreshToken: removeRefreshToken(
                                    user.refreshToken,
                                    refreshToken
                                ),
                            },
                        });
                    }
                } catch (error) {
                    // An invalid or expired token has no session left to revoke.
                    if (!(error instanceof jwt.JsonWebTokenError)) throw error;
                }
            }
            clearAuthCookies(res);
            res.status(200).json({
                message: 'Logout successful',
            });
        } catch (error) {
            res.status(500).json({
                message: 'Internal server error',
            });
        }
    }
}
