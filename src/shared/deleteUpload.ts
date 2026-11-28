import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import { UploadFolder, canDeleteUpload, uploadsRoot } from '../utils/uploads';

/** Deletes an uploaded file, but only when it belongs to the signed-in user. */
export const deleteUpload =
    (folder: UploadFolder) => async (req: Request, res: Response) => {
        const fileName = String(req.params.fileName);
        if (path.basename(fileName) !== fileName) {
            res.status(400).json({ message: 'Invalid file name.' });
            return;
        }

        try {
            const userId = String(req.params.userId);
            if (!(await canDeleteUpload(userId, folder, fileName))) {
                res.status(403).json({
                    message: 'You can only delete your own files.',
                });
                return;
            }

            await fs.promises.unlink(path.join(uploadsRoot, folder, fileName));
            res.json({ message: 'File deleted' });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                res.status(404).json({ message: 'File not found.' });
                return;
            }
            res.status(500).json({ message: 'File could not be deleted.' });
        }
    };
