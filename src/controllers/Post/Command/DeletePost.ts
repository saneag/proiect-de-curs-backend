import { Request, Response } from 'express';
import User from '../../../models/User';
import Post from '../../../models/Post';
import { ICommand } from '../../../interfaces/IPost/Command/ICommand';

export class DeletePost implements ICommand {
    public async execute(req: Request, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.params.userId).lean();
            if (!user) {
                res.status(401).json({ message: 'Invalid credentials.' });
                return;
            }

            const post = await Post.findOneAndDelete({
                _id: req.params.postId,
                'creator.email': user.email,
            });
            if (!post) {
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
