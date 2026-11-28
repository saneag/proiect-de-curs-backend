import express from 'express';

import multerInstance from '../shared/multerInstance';
import { verifyImageSignature } from '../shared/imageSignature';
import { deleteUpload } from '../shared/deleteUpload';
import { uploadLimiter } from '../shared/rateLimiters';

import PostController from '../controllers/Post/PostController';
import { getSidebar } from '../controllers/Sidebar/getSidebar';

import { checkAuth } from '../middlewares';
import { isUuid } from '../utils/validation';

const postRoutes = express.Router();

// Ids are native UUIDs, so anything else cannot match a post.
postRoutes.param('postId', (_req, res, next, postId) =>
    isUuid(postId)
        ? next()
        : res.status(404).json({ message: 'Post not found.' })
);

const upload = multerInstance.init('postImage').getMulterUpload();

postRoutes.get(
    '/get-posts',
    checkAuth,
    PostController.getPosts.bind(PostController)
);

postRoutes.get(
    '/get-post/:postId',
    checkAuth,
    PostController.getPost.bind(PostController)
);

postRoutes.get('/sidebar', checkAuth, getSidebar);

postRoutes.post(
    '/create-post',
    checkAuth,
    PostController.createPost.bind(PostController)
);
postRoutes.post(
    '/create-post-with-image',
    checkAuth,
    PostController.createPostWithImage.bind(PostController)
);

postRoutes.post(
    '/post/postImage',
    checkAuth,
    uploadLimiter,
    upload.single('postImage'),
    verifyImageSignature,
    (req: any, res) => {
        if (!req.file) {
            res.status(400).json({ message: 'An image file is required.' });
            return;
        }
        res.json({
            url: `uploads/postImage/${req.file.filename}`,
        });
    }
);

postRoutes.patch(
    '/react-to-post/:postId/:reactionType',
    checkAuth,
    PostController.reactToPost.bind(PostController)
);

postRoutes.patch(
    '/update-post/:postId',
    checkAuth,
    PostController.updatePost.bind(PostController)
);

postRoutes.delete(
    '/delete-post/:postId',
    checkAuth,
    PostController.deletePost.bind(PostController)
);
postRoutes.delete(
    '/post/postImage/:fileName',
    checkAuth,
    deleteUpload('postImage')
);

export default postRoutes;
