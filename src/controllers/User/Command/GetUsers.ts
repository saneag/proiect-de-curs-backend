import { Request, Response } from 'express';

import { prisma } from '../../../db';

import { ICommand } from '../../../interfaces/IUser/Command/ICommand';

export class GetUsers implements ICommand {
    public async execute(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const users = await prisma.user.findMany({
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    avatarUrl: true,
                    description: true,
                },
                orderBy: { createdAt: 'asc' },
                take: 1000,
            });

            res.status(200).json({ users });
        } catch (error) {
            res.status(500).json({
                message: 'Something went wrong',
            });
        }
    }
}
