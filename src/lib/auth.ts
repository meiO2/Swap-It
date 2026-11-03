    import bcrypt from "bcryptjs";
    import { randomBytes, createHash } from "crypto";

    // Hash a password before storing it.
    export async function hashPassword(password: string) {
    return bcrypt.hash(password, 12);
    }

    // Verify a password against its stored hash.
    export async function verifyPassword(
    password: string,
    passwordHash: string
    ) {
    return bcrypt.compare(password, passwordHash);
    }

    // Generate a secure random session token.
    export function generateSessionToken() {
    return randomBytes(32).toString("hex");
    }

    // Hash the session token before storing it in MongoDB.
    export function hashSessionToken(token: string) {
    return createHash("sha256")
        .update(token)
        .digest("hex");
    }