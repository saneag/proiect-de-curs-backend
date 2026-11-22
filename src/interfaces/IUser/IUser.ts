export interface IUser extends ISimpleUser {
    id: string;
    passwordHash: string;
    refreshToken?: string | null;
    description: string;
    role: 'user' | 'moderator' | 'admin';
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserUpdate {
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string;
    description: string;
    role?: 'user' | 'moderator' | 'admin';
    updatedAt?: Date;
}

export interface IUserRegister extends ISimpleUser {
    passwordHash: string;
}

export interface ISimpleUser {
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string;
}
