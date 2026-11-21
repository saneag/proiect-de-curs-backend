import { Request, Response } from 'express';

import Post from '../../../models/Post';

import { ICommand } from '../../../interfaces/IPost/Command/ICommand';

import { PostDecorator } from '../Decorator/PostDecorator';

export class GetPosts implements ICommand {
    public async execute(req: Request, res: Response): Promise<void> {
        try {
            const requestedLimit = Number.parseInt(String(req.query.limit || '10'), 10);
            const requestedPage = Number.parseInt(String(req.query.page || '1'), 10);
            const limit = Number.isFinite(requestedLimit)
                ? Math.min(Math.max(requestedLimit, 1), 50)
                : 10;
            const page = Number.isFinite(requestedPage)
                ? Math.max(requestedPage, 1)
                : 1;
            const search = String(req.query.search || '');
            const email = String(req.query.email || '');
            const escapeRegex = (value: string) =>
                value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            const query: any = {};

            if (email !== '')
                query['creator.email'] = {
                    $regex: escapeRegex(email),
                    $options: 'i',
                };

            if (search !== '')
                query['$or'] = [
                    { title: { $regex: escapeRegex(search), $options: 'i' } },
                    {
                        'creator.firstName': {
                            $regex: escapeRegex(search),
                            $options: 'i',
                        },
                    },
                    {
                        'creator.lastName': {
                            $regex: escapeRegex(search),
                            $options: 'i',
                        },
                    },
                ];

            const totalPostsNumber = await Post.countDocuments(query);

            const posts = await Post.find(query)
                .limit(limit)
                .skip(limit * (page - 1))
                .sort({ createdAt: -1 });

            const simplifiedPosts = posts.map((post) => {
                const postDecorator = new PostDecorator();
                const simplifiedText = postDecorator.simplifyText(post.content);
                const numberOfLikes = post.reactions.filter(
                    (reaction) => reaction.like === true
                ).length;
                const numberOfDislikes = post.reactions.filter(
                    (reaction) => reaction.dislike === true
                ).length;
                const numberOfComments = post.comments.length;
                return {
                    ...post.toObject(),
                    content: simplifiedText,
                    numberOfLikes,
                    numberOfDislikes,
                    numberOfComments,
                };
            });

            res.status(200).json({
                message: 'Posts fetched successfully.',
                posts: simplifiedPosts,
                totalPostsNumber,
            });
        } catch (error) {
            res.status(500).json({
                message: 'Posts could not be loaded.',
            });
        }
    }
}
