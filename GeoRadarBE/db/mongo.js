import { MongoClient } from 'mongodb';

let client = null;
let db = null;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB || 'georadar';

export async function connectMongo() {
    if (db) return db;

    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);

        // Create indexes for conflict_events collection
        const col = db.collection('conflict_events');
        await col.createIndex({ event_id: 1 }, { unique: true, sparse: true });
        await col.createIndex({ event_date: -1 });
        await col.createIndex({ country: 1 });
        await col.createIndex({ latitude: 1, longitude: 1 });
        await col.createIndex({ event_type: 1 });

        // Create indexes for osint_posts collection
        const osintCol = db.collection('osint_posts');
        await osintCol.createIndex({ post_id: 1 }, { unique: true });
        await osintCol.createIndex({ created_at: -1 });

        console.log(`[MongoDB] ✅ Connected to ${MONGODB_URI}/${DB_NAME}`);
        return db;
    } catch (e) {
        console.error(`[MongoDB] ❌ Connection failed: ${e.message}`);
        console.warn('[MongoDB] Falling back to file-based data storage');
        db = null;
        return null;
    }
}

export function getDb() {
    return db;
}

export async function closeMongo() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}
