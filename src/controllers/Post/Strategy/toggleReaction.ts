import { prisma } from '../../../db';
import { ReactionType } from '../../../generated/prisma/client';
export async function toggleReaction(
    postId: string,
    userId: string,
    type: ReactionType
): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        // Serialize toggles, including concurrent requests and deletion of the post.
        const posts = await tx.$queryRaw<
            { id: string }[]
        >`SELECT id FROM posts WHERE id = ${postId} FOR UPDATE`;
        if (!posts.length) return false;
        const where = { postId_userId: { postId, userId } };
        const existing = await tx.reaction.findUnique({ where });
        if (existing?.type === type) await tx.reaction.delete({ where });
        else
            await tx.reaction.upsert({
                where,
                create: { postId, userId, type },
                update: { type },
            });
        return true;
    });
}
