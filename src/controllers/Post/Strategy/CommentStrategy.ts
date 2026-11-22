import { Request, Response } from 'express';
import { prisma } from '../../../db';
import { snapshot } from '../../../utils/postResponse';
import { IStrategy } from '../../../interfaces/IPost/Strategy/IStrategy';
export class CommentStrategy implements IStrategy {
    public async performAction(req: Request, res: Response): Promise<void> {
        try {
            const content = req.body.content;
            if (
                typeof content !== 'string' ||
                content.trim().length < 3 ||
                content.trim().length > 300
            ) {
                res.status(400).json({
                    message: 'Comment must contain 3–300 characters.',
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
                    creatorSnapshot: snapshot(user),
                    content: content.trim(),
                },
            });
            res.status(200).json({ message: 'Comment added successfully.' });
        } catch {
            res.status(500).json({ message: 'Comment addition failed.' });
        }
    }
}
