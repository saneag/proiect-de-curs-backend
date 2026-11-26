import { Request, Response } from 'express';

import { prisma } from '../../../db';

import { ICommand } from '../../../interfaces/IUser/Command/ICommand';
import { UserDestructuring } from '../../../utils/userDestructuring';

export class GetUserByEmail implements ICommand {
    public async execute(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const user = await prisma.user.findUnique({
                where: { email: req.params.email },
            });

            if (!user) {
                res.status(404).json({
                    message: 'User not found',
                });
                return;
            }

            const destructuredUser = UserDestructuring(user);

            res.status(200).json({
                id: destructuredUser.id,
                firstName: destructuredUser.firstName,
                lastName: destructuredUser.lastName,
                email: destructuredUser.email,
                avatarUrl: destructuredUser.avatarUrl,
                description: destructuredUser.description,
            });
        } catch (error) {
            res.status(500).json({
                message: 'Something went wrong',
            });
        }
    }
}
