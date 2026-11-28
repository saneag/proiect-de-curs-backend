import { Request, Response } from 'express';
import { prisma } from '../../../db';
import { IStrategy } from '../../../interfaces/IPost/Strategy/IStrategy';
export class CommentStrategy implements IStrategy {
    public async performAction(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const content = req.body.content;
            if (
                typeof content !== 'string' ||
                content.trim().length < 1 ||
                content.trim().length > 500
            ) {
                res.status(400).json({
                    message: 'Comment must contain 1–500 characters.',
                });
                return;
            }
            const user = await prisma.user.findUnique({
                where: { id: req.params.userId },
            });
            if (!user) {
                res.status(401).json({ message: 'Invalid credentials.' });
                return;
            }
            const post = await prisma.post.findUnique({
                where: { id: req.params.postId },
                select: { id: true },
            });
            if (!post) {
                res.status(404).json({ message: 'Post not found.' });
                return;
            }
            await prisma.comment.create({
                data: {
                    postId: post.id,
                    creatorId: user.id,
                    content: content.trim(),
                },
            });
            res.status(200).json({ message: 'Comment added successfully.' });
        } catch {
            res.status(500).json({ message: 'Comment addition failed.' });
        }
    }
}
