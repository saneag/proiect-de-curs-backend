export function validPost(
    data: { title?: unknown; content?: unknown; image?: unknown },
    partial = false
): boolean {
    const text = (value: unknown, min: number, max: number) =>
        typeof value === 'string' &&
        value.trim().length >= min &&
        value.trim().length <= max;
    return (
        ((partial && data.title === undefined) || text(data.title, 3, 50)) &&
        ((partial && data.content === undefined) ||
            text(data.content, 3, 1000)) &&
        (data.image === undefined || typeof data.image === 'string')
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
        (data.avatarUrl === undefined || typeof data.avatarUrl === 'string')
    );
}
