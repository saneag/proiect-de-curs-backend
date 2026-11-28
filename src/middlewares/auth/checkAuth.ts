import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

import { IDecodedJwt } from '../../interfaces/IUser/IDecodedJwt';
import { readAccessToken } from '../../utils/authCookies';
import { JWT_ALGORITHM } from '../../utils/tokens';
import { isUuid } from '../../utils/validation';

export default (req: Request, res: Response, next: NextFunction) => {
    const token = readAccessToken(req);

    if (token) {
        try {
            const decoded: IDecodedJwt = jwt.verify(
                token,
                process.env.JWTSECRET as string,
                { algorithms: [JWT_ALGORITHM] }
            ) as IDecodedJwt;
            if (!isUuid(decoded.userId)) throw new Error('Legacy user id');
            req.params.userId = decoded.userId;
            next();
        } catch (err) {
            return res.status(403).json({
                message: 'Access denied',
            });
        }
    } else {
        return res.status(403).json({
            message: 'Access denied',
        });
    }
};
