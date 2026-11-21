const database = db.getSiblingDB(process.env.MONGO_APP_DATABASE || 'friendo');

database.createUser({
    user: process.env.MONGO_APP_USER,
    pwd: process.env.MONGO_APP_PASSWORD,
    roles: [{ role: 'readWrite', db: database.getName() }],
});
