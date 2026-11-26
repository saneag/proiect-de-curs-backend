import { Request, Response } from 'express';

export interface IPostController {
    createPost(req: Request<Record<string, string>>, res: Response): Promise<void>;
    createPostWithImage(req: Request<Record<string, string>>, res: Response): Promise<void>;
    getPosts(req: Request<Record<string, string>>, res: Response): Promise<void>;
    updatePost(req: Request<Record<string, string>>, res: Response): Promise<void>;
    deletePost(req: Request<Record<string, string>>, res: Response): Promise<void>;
}
