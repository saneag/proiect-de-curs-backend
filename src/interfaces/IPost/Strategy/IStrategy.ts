import { Request, Response } from 'express';

export interface IStrategy {
    performAction(req: Request<Record<string, string>>, res: Response): Promise<void>;
}
