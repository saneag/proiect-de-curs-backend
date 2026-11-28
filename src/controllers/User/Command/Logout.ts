import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { ICommand } from '../../../interfaces/IUser/Command/ICommand';
import { IDecodedJwt } from '../../../interfaces/IUser/IDecodedJwt';
import { clearAuthCookies, readRefreshToken } from '../../../utils/authCookies';
import { JWT_ALGORITHM } from '../../../utils/tokens';
import { removeSession } from '../../../utils/sessions';
import { isUuid } from '../../../utils/validation';

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
                    if (isUuid(userId)) await removeSession(userId, refreshToken);
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
