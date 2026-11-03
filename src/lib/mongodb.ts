
    import mongoose from "mongoose";

    const MONGODB_URI = process.env.MONGODB_URI as string;

    if (!MONGODB_URI) {
    throw new Error("Please define MONGODB_URI in .env.local");
    }

    interface MongooseCache {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
    }

    declare global {
    // eslint-disable-next-line no-var
    var mongooseCache: MongooseCache | undefined;
    }

    const cached: MongooseCache =
    global.mongooseCache ?? {
        conn: null,
        promise: null,
    };

    global.mongooseCache = cached;

    export async function connectDB() {
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
