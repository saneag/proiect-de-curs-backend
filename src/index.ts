import express from 'express';
import * as path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';

import Database from './db';

import userRoutes from './routes/userRoutes';
import postRoutes from './routes/postRoutes';

const app = express();
dotenv.config();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/hf', userRoutes, postRoutes);

const start = async () => {
    for (const secretName of ['JWTSECRET', 'JWTREFRESHSECRET']) {
        if ((process.env[secretName] || '').length < 32) {
            throw new Error(`${secretName} must be set to a random value of at least 32 characters`);
        }
    }

    await Database.connect();
    const port = Number(process.env.PORT || 5000);
    app.listen(port, () => console.log(`Server running on port ${port}`));
};

start().catch((error) => {
    console.error('Server startup failed:', error);
    process.exit(1);
});
