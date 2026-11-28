import express from 'express';
import * as path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import helmet from 'helmet';

import Database from './db';

import userRoutes from './routes/userRoutes';
import postRoutes from './routes/postRoutes';

const app = express();
dotenv.config();

// Set TRUST_PROXY to the number of reverse proxies in front of the API so rate
// limits see the real client address (for example 1 behind a single Nginx).
if (process.env.TRUST_PROXY) {
    app.set(
        'trust proxy',
        Number.isInteger(Number(process.env.TRUST_PROXY))
            ? Number(process.env.TRUST_PROXY)
            : process.env.TRUST_PROXY
    );
}

// Images are loaded by the frontend from another origin, so they must stay embeddable.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
// Credentials (the auth cookies) are only ever shared with the frontend origin.
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// CSRF defence on top of SameSite cookies: browsers always send an Origin header
// on requests that change data, and it must be the frontend.
app.use((req, res, next) => {
    const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (
        !isSafeMethod &&
        req.headers.origin &&
        req.headers.origin !== allowedOrigin
    ) {
        res.status(403).json({ message: 'Forbidden origin' });
        return;
    }
    next();
});
app.use(
    '/uploads',
    express.static(path.join(__dirname, 'uploads'), {
        setHeaders: (res) => {
            // Uploads must never run as a page, even if a file is not a real image.
            res.setHeader(
                'Content-Security-Policy',
                "default-src 'none'; sandbox"
            );
            res.setHeader('X-Content-Type-Options', 'nosniff');
        },
    })
);
app.use('/api/hf', userRoutes, postRoutes);

const start = async () => {
    for (const secretName of ['JWTSECRET', 'JWTREFRESHSECRET']) {
        if ((process.env[secretName] || '').length < 32) {
            throw new Error(
                `${secretName} must be set to a random value of at least 32 characters`
            );
        }
    }

    await Database.connect();
    const port = Number(process.env.PORT || 5000);
    const server = app.listen(port, () =>
        console.log(`Server running on port ${port}`)
    );
    const shutdown = () =>
        server.close(() => {
            void Database.disconnect().then(() => process.exit(0));
        });
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
};

start().catch((error) => {
    console.error('Server startup failed:', error);
    process.exit(1);
});
