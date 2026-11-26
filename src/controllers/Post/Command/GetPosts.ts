import { Request, Response } from 'express';
import { prisma } from '../../../db';
import { Prisma } from '../../../generated/prisma/client';
import { ICommand } from '../../../interfaces/IPost/Command/ICommand';
import { postInclude, postResponse } from '../../../utils/postResponse';
export class GetPosts implements ICommand {
    public async execute(req: Request<Record<string, string>>, res: Response): Promise<void> {
        try {
            const requestedLimit = Number.parseInt(
                String(req.query.limit || '10'),
                10
            );
            const requestedPage = Number.parseInt(
                String(req.query.page || '1'),
                10
            );
            const limit = Number.isFinite(requestedLimit)
                ? Math.min(Math.max(requestedLimit, 1), 50)
                : 10;
            const page = Number.isFinite(requestedPage)
                ? Math.min(
                      Math.max(requestedPage, 1),
                      Math.floor(2147483647 / limit)
                  )
                : 1;
            // Prisma contains uses LIKE; escape wildcards to preserve literal search.
            const escape = (value: unknown) =>
                String(value || '').replace(/[\\%_]/g, '\\$&');
            const search = escape(req.query.search);
            const email = escape(req.query.email);
            const where: Prisma.PostWhereInput = {
                ...(email
                    ? {
                          creatorSnapshot: {
                              path: ['email'],
                              string_contains: email,
                              mode: 'insensitive' as const,
                          },
                      }
                    : {}),
                ...(search
                    ? {
                          OR: [
                              {
                                  title: {
                                      contains: search,
                                      mode: 'insensitive' as const,
                                  },
                              },
                              ...['firstName', 'lastName'].map((field) => ({
                                  creatorSnapshot: {
                                      path: [field],
                                      string_contains: search,
                                      mode: 'insensitive' as const,
                                  },
                              })),
                          ],
                      }
                    : {}),
            };
            const [totalPostsNumber, posts] = await prisma.$transaction(
                [
                    prisma.post.count({ where }),
                    prisma.post.findMany({
                        where,
                        include: postInclude,
                        take: limit,
                        skip: limit * (page - 1),
                        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                    }),
                ],
                { isolationLevel: 'RepeatableRead' }
            );
            res.status(200).json({
                message: 'Posts fetched successfully.',
                posts: posts.map(postResponse),
                totalPostsNumber,
            });
        } catch {
            res.status(500).json({ message: 'Posts could not be loaded.' });
        }
    }
}
