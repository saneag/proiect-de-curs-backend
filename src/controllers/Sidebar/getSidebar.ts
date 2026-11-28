import { Request, Response } from 'express';

import { prisma } from '../../db';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TRENDING_LIMIT = 5;
const ACTIVITY_LIMIT = 5;
const SNIPPET_LENGTH = 90;

const fullName = (user: { firstName: string; lastName: string }) =>
    `${user.firstName} ${user.lastName}`.trim();

async function trendingPosts() {
    const since = new Date(Date.now() - WEEK_MS);

    const likedThisWeek = await prisma.reaction.groupBy({
        by: ['postId'],
        where: { type: 'LIKE', post: { createdAt: { gte: since } } },
        _count: { postId: true },
        orderBy: { _count: { postId: 'desc' } },
        take: TRENDING_LIMIT,
    });

    // A quiet week falls back to the all-time favourites so the panel is never empty.
    const ranked =
        likedThisWeek.length >= 3
            ? likedThisWeek
            : await prisma.reaction.groupBy({
                  by: ['postId'],
                  where: { type: 'LIKE' },
                  _count: { postId: true },
                  orderBy: { _count: { postId: 'desc' } },
                  take: TRENDING_LIMIT,
              });

    const posts = await prisma.post.findMany({
        where: { id: { in: ranked.map((row) => row.postId) } },
        select: {
            id: true,
            title: true,
            creator: { select: { firstName: true, lastName: true } },
        },
    });
    const byId = new Map(posts.map((post) => [post.id, post]));

    return ranked.flatMap((row) => {
        const post = byId.get(row.postId);
        if (!post) return [];
        return [
            {
                id: post.id,
                title: post.title,
                likes: row._count.postId,
                author: fullName(post.creator),
            },
        ];
    });
}

async function recentActivity(userId: string) {
    const comments = await prisma.comment.findMany({
        where: { post: { creatorId: userId }, creatorId: { not: userId } },
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_LIMIT,
        select: {
            id: true,
            content: true,
            createdAt: true,
            creator: {
                select: { firstName: true, lastName: true, avatarUrl: true },
            },
            post: { select: { id: true, title: true } },
        },
    });

    return comments.map((comment) => {
        return {
            id: comment.id,
            postId: comment.post.id,
            postTitle: comment.post.title,
            author: fullName(comment.creator),
            avatarUrl: comment.creator.avatarUrl,
            snippet:
                comment.content.length > SNIPPET_LENGTH
                    ? `${comment.content.slice(0, SNIPPET_LENGTH)}…`
                    : comment.content,
            createdAt: comment.createdAt,
        };
    });
}

/** Data for the side panels of the home page. */
export async function getSidebar(req: Request, res: Response) {
    try {
        const userId = String(req.params.userId);
        const [members, posts, comments, trending, activity] =
            await Promise.all([
                prisma.user.count(),
                prisma.post.count(),
                prisma.comment.count(),
                trendingPosts(),
                recentActivity(userId),
            ]);

        res.status(200).json({
            stats: { members, posts, comments },
            trending,
            activity,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Sidebar could not be loaded.' });
    }
}
