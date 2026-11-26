import { Request, Response } from 'express';
import { prisma } from '../../../db';
import { ICommand } from '../../../interfaces/IPost/Command/ICommand';

export class DeletePost implements ICommand {
    public async execute(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const user = await prisma.user.findUnique({
                where: { id: req.params.userId },
            });
            if (!user) {
                res.status(401).json({ message: 'Invalid credentials.' });
                return;
            }

            const post = await prisma.post.deleteMany({
                where: { id: req.params.postId, creatorId: user.id },
            });
            if (!post.count) {
                res.status(404).json({ message: 'Post not found.' });
                return;
            }

            res.status(200).json({ message: 'Post deleted successfully.' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Post deletion failed.' });
        }
    }
}
