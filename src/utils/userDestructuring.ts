export const UserDestructuring = (user: any) => {
    const {
        id,
        firstName,
        lastName,
        email,
        role,
        avatarUrl,
        description,
        createdAt,
        updatedAt,
    } = user;

    return {
        id,
        firstName,
        lastName,
        email,
        avatarUrl,
        description,
        createdAt,
        updatedAt,
    };
};
