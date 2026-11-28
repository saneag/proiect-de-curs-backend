import fs from 'fs';
import path from 'path';

import { prisma } from '../db';

export type UploadFolder = 'postImage' | 'userAvatar';

// UPLOADS_DIR lets a server keep images outside the project, for example on a data disk.
export const uploadsRoot = path.resolve(
    process.env.UPLOADS_DIR || path.join(__dirname, '../uploads')
);

const uploadPathPattern =
    /^uploads\/(postImage|userAvatar)\/([^/\\?#\u0000-\u001f]{1,200})$/;

/** Parses a client-supplied upload path such as `uploads/postImage/<file>`. */
export function parseUploadPath(
    value: unknown,
    folder: UploadFolder
): string | null {
    if (typeof value !== 'string') return null;
    const match = uploadPathPattern.exec(value);
    if (!match || match[1] !== folder) return null;
    const fileName = match[2];
    return fileName === '.' || fileName === '..' ? null : fileName;
}

/** True when the value is empty or points at an upload inside the expected folder. */
export function isUploadPath(value: unknown, folder: UploadFolder): boolean {
    return value === '' || parseUploadPath(value, folder) !== null;
}

/** True when the value points at a file that exists in the expected folder. */
export function uploadExists(value: unknown, folder: UploadFolder): boolean {
    const fileName = parseUploadPath(value, folder);
    return (
        fileName !== null &&
        fs.existsSync(path.join(uploadsRoot, folder, fileName))
    );
}

/** Uploaded files are named `<userId>_<uuid>.<ext>` so their owner is known. */
export const uploadOwnerPrefix = (userId: string) =>
    `${path.basename(userId)}_`;

/**
 * A user may delete a file they uploaded, or a legacy file that is currently
 * attached to their own post or profile.
 */
export async function canDeleteUpload(
    userId: string,
    folder: UploadFolder,
    fileName: string
): Promise<boolean> {
    if (fileName.startsWith(uploadOwnerPrefix(userId))) return true;

    const stored = `uploads/${folder}/${fileName}`;
    if (folder === 'postImage') {
        return (
            (await prisma.post.count({
                where: { creatorId: userId, image: stored },
            })) > 0
        );
    }
    return (
        (await prisma.user.count({
            where: { id: userId, avatarUrl: stored },
        })) > 0
    );
}
