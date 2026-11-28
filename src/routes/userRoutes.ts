import express from 'express';

import UserController from '../controllers/User/UserController';

import multerInstance from '../shared/multerInstance';
import { verifyImageSignature } from '../shared/imageSignature';
import { deleteUpload } from '../shared/deleteUpload';
import {
    loginLimiter,
    refreshLimiter,
    registerLimiter,
    uploadLimiter,
} from '../shared/rateLimiters';

import {
    checkAuth,
    loginValidation,
    registerValidation,
    validateErrors,
} from '../middlewares';

const userRoutes = express.Router();
const upload = multerInstance.init('userAvatar').getMulterUpload();

userRoutes.get('/user', checkAuth, UserController.getUser.bind(UserController));
userRoutes.get(
    '/user/:id',
    checkAuth,
    UserController.getUserById.bind(UserController)
);
userRoutes.get(
    '/users',
    checkAuth,
    UserController.getAllUsers.bind(UserController)
);

userRoutes.post(
    '/user/register',
    registerLimiter,
    registerValidation,
    validateErrors,
    UserController.register.bind(UserController)
);
userRoutes.post(
    '/user/login',
    loginLimiter,
    loginValidation,
    validateErrors,
    UserController.login.bind(UserController)
);
userRoutes.post('/user/logout', UserController.logout.bind(UserController));
userRoutes.post(
    '/user/refreshAccessToken',
    refreshLimiter,
    UserController.refreshAccessToken.bind(UserController)
);
userRoutes.post(
    '/user/userAvatar',
    checkAuth,
    uploadLimiter,
    upload.single('avatar'),
    verifyImageSignature,
    (req: any, res) => {
        if (!req.file) {
            res.status(400).json({ message: 'An avatar image is required.' });
            return;
        }
        res.json({
            url: `uploads/userAvatar/${req.file.filename}`,
        });
    }
);

userRoutes.patch(
    '/user/updateUser',
    checkAuth,
    UserController.updateUser.bind(UserController)
);

userRoutes.delete(
    '/user/userAvatar/:fileName',
    checkAuth,
    deleteUpload('userAvatar')
);

export default userRoutes;
