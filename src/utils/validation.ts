import { isUploadPath } from './uploads';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
    typeof value === 'string' && UUID_PATTERN.test(value);

export function validPost(
    data: { title?: unknown; image?: unknown },
    partial = false
): boolean {
    const text = (value: unknown, min: number, max: number) =>
        typeof value === 'string' &&
        value.trim().length >= min &&
        value.trim().length <= max;
    return (
        ((partial && data.title === undefined) || text(data.title, 3, 50)) &&
        (data.image === undefined || isUploadPath(data.image, 'postImage'))
    );
}

export function validUserUpdate(data: Record<string, unknown>): boolean {
    return (
        ['firstName', 'lastName'].every(
            (key) =>
                data[key] === undefined ||
                (typeof data[key] === 'string' &&
                    /^[a-zA-Z0-9]{3,20}$/.test(data[key] as string))
        ) &&
        (data.email === undefined ||
            (typeof data.email === 'string' &&
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) &&
        (data.description === undefined ||
            (typeof data.description === 'string' &&
                data.description.length <= 300)) &&
        (data.avatarUrl === undefined ||
            isUploadPath(data.avatarUrl, 'userAvatar'))
    );
}
