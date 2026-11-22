import { Request, Response } from 'express';

import { prisma } from '../../../db';

import { ICommand } from '../../../interfaces/IPost/Command/ICommand';

import { PostDecorator } from '../Decorator/PostDecorator';
import { PostBuilder } from '../Builder/PostBuilder';
import { validPost } from '../../../utils/validation';
import { snapshot } from '../../../utils/postResponse';

export class CreatePostWithImage implements ICommand {
    public async execute(req: Request, res: Response): Promise<void> {
        try {
            const user = await prisma.user.findUnique({
                where: { id: req.params.userId },
            });

            if (!user) {
                res.status(401).json({
                    message: 'Invalid credentials',
                });
                return;
            }

            const { title, content, image } = req.body;

            if (!title || !content || !image) {
                res.status(400).json({
                    message: 'Title, content and image are required.',
                });
                return;
            }

            const postDecorator = new PostDecorator();
            const formattedText = postDecorator.decorateText(content);

            if (
                !validPost({
                    title,
                    content: formattedText,
                    image: req.body.image,
                })
            ) {
                res.status(400).json({ message: 'Invalid post fields.' });
                return;
            }
            const postBuilder = new PostBuilder();

            const post = postBuilder
                .setCreator(user)
                .setTitle(title.trim())
                .setContent(formattedText)
                .setImage(image);

            const { creator, ...data } = post.buildPostWithImages();
            await prisma.post.create({
                data: {
                    ...data,
                    creatorId: user.id,
                    creatorSnapshot: snapshot(creator),
                },
            });

            res.status(201).json({
                message: 'Post created successfully.',
            });
        } catch (error) {
            res.status(500).json({
                message: 'Post creation failed.',
            });
        }
    }
}
