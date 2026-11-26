import { Request, Response } from 'express';
import { IStrategy } from '../../../interfaces/IPost/Strategy/IStrategy';
import { toggleReaction } from './toggleReaction';
export class DislikeStrategy implements IStrategy {
    public async performAction(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const found = await toggleReaction(
                req.params.postId,
                req.params.userId,
                'DISLIKE'
            );
            if (!found) {
                res.status(404).json({ message: 'Post not found.' });
                return;
            }
            res.status(200).json({ message: 'Success.' });
        } catch {
            res.status(500).json({ message: 'Reaction failed.' });
        }
    }
}
