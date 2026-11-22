import { Request, Response } from 'express';

import { prisma } from '../../../db';
import { ICommand } from '../../../interfaces/IPost/Command/ICommand';
import { validPost } from '../../../utils/validation';
import { PostDecorator } from '../Decorator/PostDecorator';

export class UpdatePost implements ICommand {
    public async execute(req: Request, res: Response): Promise<void> {
        try {
            const user = await prisma.user.findUnique({
                where: { id: req.params.userId },
            });
            if (!user) {
                res.status(401).json({ message: 'Invalid credentials.' });
                return;
            }

            const updates: {
                title?: string;
                content?: string;
                image?: string;
                updatedAt: Date;
            } = {
                updatedAt: new Date(),
            };
            const { title, content, image } = req.body;
            if (title !== undefined) updates.title = title;
            if (content !== undefined) {
                updates.content = new PostDecorator().decorateText(content);
            }
            if (image !== undefined) updates.image = image;

            if (!validPost(updates, true)) {
                res.status(400).json({ message: 'Invalid post fields.' });
                return;
            }
            if (updates.title) updates.title = updates.title.trim();
            const post = await prisma.post.updateMany({
                where: { id: req.params.postId, creatorId: user.id },
                data: updates,
            });

            if (!post.count) {
                res.status(404).json({ message: 'Post not found.' });
                return;
            }

            res.status(200).json({ message: 'Post updated successfully.' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Post update failed.' });
        }
    }
}
