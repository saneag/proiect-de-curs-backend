import { Request, Response } from 'express';

import { prisma } from '../../../db';

import { ICommand } from '../../../interfaces/IUser/Command/ICommand';
import { UserBuilder } from '../Builder/UserBuilder';

import { hashPassword } from '../../../utils/PasswordHashFacade';
import { UserDestructuring } from '../../../utils/userDestructuring';

export class Register implements ICommand {
    public async execute(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const passwordHash = await hashPassword(req.body.password);

            const userBuilder = new UserBuilder();
            userBuilder
                .setFirstName(req.body.firstName)
                .setLastName(req.body.lastName)
                .setEmail(req.body.email)
                .setPasswordHash(passwordHash)
                .setAvatarUrl(req.body.avatarUrl);

            const user = await prisma.user.create({
                data: userBuilder.build(),
            });
            res.status(201).json(UserDestructuring(user));
        } catch (error) {
            console.error(error as Error);
            res.status(409).send('Conflict');
        }
    }
}
