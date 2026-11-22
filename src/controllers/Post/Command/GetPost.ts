import { Request, Response } from 'express';
import { prisma } from '../../../db';
import { ICommand } from '../../../interfaces/IPost/Command/ICommand';
import { postInclude, postResponse } from '../../../utils/postResponse';
export class GetPost implements ICommand {
    public async execute(req: Request, res: Response): Promise<void> {
        try {
            const post = await prisma.post.findUnique({
                where: { id: req.params.postId },
                include: postInclude,
            });
            if (!post) {
                res.status(404).json({ message: 'Post not found.' });
                return;
            }
            res.status(200).json({
                message: 'Success.',
                post: postResponse(post),
            });
        } catch {
            res.status(500).json({ message: 'Post could not be loaded.' });
        }
    }
}
