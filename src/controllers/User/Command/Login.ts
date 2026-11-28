import { Request, Response } from 'express';
import { prisma } from '../../../db';

import { ICommand } from '../../../interfaces/IUser/Command/ICommand';

import { comparePasswords } from '../../../utils/PasswordHashFacade';
import { setAuthCookies } from '../../../utils/authCookies';
import { signAccessToken, signRefreshToken } from '../../../utils/tokens';
import { createSession } from '../../../utils/sessions';

export class Login implements ICommand {
    public async execute(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const { email, password } = req.body;
            const user = await prisma.user.findUnique({ where: { email } });

            if (!user) {
                res.status(401).json({
                    message: 'Invalid credentials',
                });
                return;
            }

            const isPasswordValid = await comparePasswords(
                password,
                user.passwordHash
            );

            if (!isPasswordValid) {
                res.status(401).json({
                    message: 'Invalid credentials',
                });
                return;
            }

            const accessToken = signAccessToken(user.id);
            const refreshToken = signRefreshToken(user.id);

            await createSession(user.id, refreshToken);

            // The tokens travel only as HttpOnly cookies, never in the response body.
            setAuthCookies(res, accessToken, refreshToken);
            res.status(200).json({ message: 'Login successful' });
        } catch (error) {
            console.error(error as Error);
            res.status(500).send('Server error');
        }
    }
}
