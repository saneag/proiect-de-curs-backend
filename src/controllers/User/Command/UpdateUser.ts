import { Request, Response } from 'express';

import { prisma } from '../../../db';

import { ICommand } from '../../../interfaces/IUser/Command/ICommand';
import { validUserUpdate } from '../../../utils/validation';
import { UserBuilder } from '../Builder/UserBuilder';

import { UserDestructuring } from '../../../utils/userDestructuring';

export class UpdateUser implements ICommand {
    public async execute(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const user = await prisma.user.findUnique({
                where: { id: req.params.userId },
            });

            if (!user) {
                res.status(404).json({
                    message: 'User not found',
                });
                return;
            }

            if (!validUserUpdate(req.body)) {
                res.status(400).json({ message: 'Invalid profile fields.' });
                return;
            }
            const userBuilder = new UserBuilder();
            userBuilder
                .setFirstName(req.body.firstName)
                .setLastName(req.body.lastName)
                .setEmail(req.body.email)
                .setAvatarUrl(req.body.avatarUrl)
                .setDescription(req.body.description);

            const updatedUser = await prisma.user.update({
                where: { id: user.id },
                data: userBuilder.buildUpdate(),
            });

            const destructuredUser = UserDestructuring(updatedUser);

            res.status(200).json({
                id: destructuredUser.id,
                firstName: destructuredUser.firstName,
                lastName: destructuredUser.lastName,
                email: destructuredUser.email,
                avatarUrl: destructuredUser.avatarUrl,
                description: destructuredUser.description,
            });
        } catch (error) {
            console.error(error as Error);
            res.status(500).send('Server error');
        }
    }
}
