import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

class Database {
    private static _instance: Database;
    private constructor() {}

    public async connect(): Promise<void> {
        const mongoUri = process.env.MONGOURI;
        if (!mongoUri) throw new Error('MONGOURI is required');
        await mongoose.connect(mongoUri);
        console.log('Connected to Database');
    }

    public static getInstance(): Database {
        if (this._instance) {
            return this._instance;
        }

        this._instance = new Database();
        return this._instance;
    }

    public getConnection(): mongoose.Connection {
        return mongoose.connection;
    }
}

export default Database.getInstance();
