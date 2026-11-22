import { Prisma } from '../generated/prisma/client';
import { ISimpleUser } from '../interfaces/IUser/IUser';
import { PostDecorator } from '../controllers/Post/Decorator/PostDecorator';
export const snapshot = (user: ISimpleUser) => ({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    avatarUrl: user.avatarUrl,
});
export const postInclude = {
    comments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    reactions: {
        include: { user: { select: { email: true } } },
        orderBy: { id: 'asc' },
    },
} satisfies Prisma.PostInclude;
type PostWithRelations = Prisma.PostGetPayload<{ include: typeof postInclude }>;
export function postResponse(post: PostWithRelations) {
    const { creatorSnapshot, comments, reactions, ...fields } = post;
    return {
        ...fields,
        creator: creatorSnapshot,
        content: new PostDecorator().simplifyText(post.content),
        comments: comments.map(({ creatorSnapshot, ...comment }) => ({
            ...comment,
            creator: creatorSnapshot,
        })),
        reactions: reactions.map(({ user, type, ...reaction }) => ({
            ...reaction,
            email: user.email,
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
