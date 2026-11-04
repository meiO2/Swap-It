
    import mongoose from "mongoose";

    interface MongooseCache {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
    }

    declare global {
    var mongooseCache: MongooseCache | undefined;
    }

    const cached: MongooseCache =
    global.mongooseCache ?? {
        conn: null,
        promise: null,
    };

    global.mongooseCache = cached;

    export async function connectDB() {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        throw new Error("Please define MONGODB_URI in .env.local");
    }

    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI);
    }

    try {
        cached.conn = await cached.promise;
        console.log("MongoDB connected successfully!");
        return cached.conn;
    } catch (error) {
        cached.promise = null;
        throw error;
    }
    }
