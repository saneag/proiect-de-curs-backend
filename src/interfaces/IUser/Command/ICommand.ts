import { Request, Response } from 'express';

export interface ICommand {
    execute(req: Request<Record<string, string>>, res: Response): Promise<void>;
}
