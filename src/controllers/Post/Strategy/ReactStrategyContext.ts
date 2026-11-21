import { Request, Response } from 'express';
import { strategies } from './index';
import { IStrategy } from '../../../interfaces/IPost/Strategy/IStrategy';
import User from '../../../models/User';

export class ReactStrategyContext {
    public async performAction(req: Request, res: Response): Promise<void> {
        const { reactionType } = req.params;
        let strategy: IStrategy;

        switch (reactionType) {
            case 'like':
                strategy = new strategies.like();
                break;
            case 'dislike':
                strategy = new strategies.dislike();
                break;
            case 'comment':
                strategy = new strategies.comment();
                break;
            default:
                res.status(400).json({ message: 'Invalid reaction type.' });
                return;
        }

        try {
            const user = await User.findById(req.params.userId).lean();
            if (!user) {
                res.status(401).json({ message: 'Invalid credentials.' });
                return;
            }
            req.body.email = user.email;
            await strategy.performAction(req, res);
        } catch (error) {
            res.status(500).json({ message: 'Reaction failed.' });
        }
    }
}
