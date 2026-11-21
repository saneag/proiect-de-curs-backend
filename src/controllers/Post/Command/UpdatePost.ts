import { Request, Response } from 'express';

import User from '../../../models/User';
import Post from '../../../models/Post';
import { ICommand } from '../../../interfaces/IPost/Command/ICommand';
import { PostDecorator } from '../Decorator/PostDecorator';

export class UpdatePost implements ICommand {
    public async execute(req: Request, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.params.userId).lean();
            if (!user) {
                res.status(401).json({ message: 'Invalid credentials.' });
                return;
            }

            const updates: { title?: string; content?: string; image?: string; updatedAt: Date } = {
                updatedAt: new Date(),
            };
            const { title, content, image } = req.body;
            if (title !== undefined) updates.title = title;
            if (content !== undefined) {
                updates.content = new PostDecorator().decorateText(content);
            }
            if (image !== undefined) updates.image = image;

            const post = await Post.findOneAndUpdate(
                { _id: req.params.postId, 'creator.email': user.email },
                { $set: updates },
                { new: true, runValidators: true }
            );

            if (!post) {
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
