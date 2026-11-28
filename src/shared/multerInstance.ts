import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs';

import { uploadOwnerPrefix, uploadsRoot } from '../utils/uploads';

class MulterInstance {
    private static _instance: MulterInstance;

    private upload: any;

    constructor() {}

    static getInstance() {
        if (this._instance) {
            return this._instance;
        }

        this._instance = new MulterInstance();
        return this._instance;
    }

    public init(folderPath: string) {
        const storage = multer.diskStorage({
            destination: (_, __, cb) => {
                const destination = path.join(uploadsRoot, folderPath);
                fs.mkdirSync(destination, { recursive: true });
                cb(null, destination);
            },
            filename: (req, file, cb) => {
                const extensions: Record<string, string> = {
                    'image/jpeg': '.jpg',
                    'image/png': '.png',
                    'image/gif': '.gif',
                    'image/webp': '.webp',
                };
                const owner = uploadOwnerPrefix(String(req.params.userId));
                cb(null, `${owner}${randomUUID()}${extensions[file.mimetype]}`);
            },
        });

        this.upload = multer({
            storage,
            limits: { fileSize: 5 * 1024 * 1024, files: 1 },
            fileFilter: (_req, file, cb) => {
                if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
                    cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed.'));
                    return;
                }
                cb(null, true);
            },
        });

        return this;
    }

    public getMulterUpload() {
        return this.upload;
    }
}

export default MulterInstance.getInstance();
