import { NextFunction, Request, Response } from 'express';
import fs from 'fs';

const signatures: Record<string, (head: Buffer) => boolean> = {
    'image/jpeg': (head) =>
        head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    'image/png': (head) =>
        head
            .subarray(0, 8)
            .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            ),
    'image/gif': (head) =>
        ['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString('latin1')),
    'image/webp': (head) =>
        head.subarray(0, 4).toString('latin1') === 'RIFF' &&
        head.subarray(8, 12).toString('latin1') === 'WEBP',
};

function readHead(filePath: string): Buffer {
    const fd = fs.openSync(filePath, 'r');
    try {
        const head = Buffer.alloc(12);
        fs.readSync(fd, head, 0, 12, 0);
        return head;
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Runs after multer: the saved file must really be the image type it claims to be.
 * Otherwise it is deleted and the upload is rejected.
 */
export function verifyImageSignature(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
        next();
        return;
    }

    let valid = false;
    try {
        valid = signatures[file.mimetype]?.(readHead(file.path)) ?? false;
    } catch {
        valid = false;
    }

    if (!valid) {
        fs.rm(file.path, { force: true }, () => {
            res.status(400).json({ message: 'The file is not a valid image.' });
        });
        return;
    }
    next();
}
