import { Request, Response } from 'express';

export interface IUserController {
    login(req: Request<Record<string, string>>, res: Response): Promise<void>;
    register(req: Request<Record<string, string>>, res: Response): Promise<void>;
    refreshAccessToken(req: Request<Record<string, string>>, res: Response): Promise<void>;
    logout(req: Request<Record<string, string>>, res: Response): Promise<void>;
    getUser(req: Request<Record<string, string>>, res: Response): Promise<void>;
    updateUser(req: Request<Record<string, string>>, res: Response): Promise<void>;
}
