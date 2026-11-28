import { ISimpleUser } from '../IUser/IUser';
import { IComment } from './IComment';

export interface IPost extends IImagePost {
    id: string;
    creator: ISimpleUser;
    title: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    comments: IComment[];
    reactions: IPostReaction[];
}

export interface IBasicPost {
    title: string;
    content: string;
    creator: ISimpleUser;
}

export interface IImagePost extends IBasicPost {
    image: string;
}

export interface IPostUpdate {
    title: string;
    content: string;
    image: string;
    updatedAt: Date;
}

export interface IPostReaction {
    email: string;
    like?: boolean;
    dislike?: boolean;
}
