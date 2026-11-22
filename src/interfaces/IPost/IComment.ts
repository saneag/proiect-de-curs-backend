import { ISimpleUser } from '../IUser/IUser';

export interface IComment {
    postId: string;
    id: string;
    creatorId: string;
    content: string;
    creator: ISimpleUser;
    createdAt: Date;
    updatedAt: Date;
}
