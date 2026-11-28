import { Prisma } from '../generated/prisma/client';
import { renderPostContent } from './postContent';
export const creatorSelect = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    avatarUrl: true,
} satisfies Prisma.UserSelect;

export const postInclude = {
    creator: { select: creatorSelect },
    comments: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { creator: { select: creatorSelect } },
    },
    reactions: { orderBy: { id: 'asc' } },
} satisfies Prisma.PostInclude;
type PostWithRelations = Prisma.PostGetPayload<{ include: typeof postInclude }>;
export function postResponse(post: PostWithRelations) {
    const { comments, reactions, ...fields } = post;
    return {
        ...fields,
        content: renderPostContent(post.content),
        comments,
        reactions: reactions.map(({ type, ...reaction }) => ({
            ...reaction,
            like: type === 'LIKE',
            dislike: type === 'DISLIKE',
        })),
        numberOfLikes: reactions.filter((reaction) => reaction.type === 'LIKE')
            .length,
        numberOfDislikes: reactions.filter(
            (reaction) => reaction.type === 'DISLIKE'
        ).length,
        numberOfComments: comments.length,
    };
}
