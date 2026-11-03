
    import {
    createHmac,
    randomInt,
    timingSafeEqual,
    } from "node:crypto";

    export const OTP_LENGTH = 6;
    export const OTP_EXPIRY_MINUTES = 5;
    export const OTP_MAX_ATTEMPTS = 5;

    /**
     * Generate a cryptographically secure six-digit OTP.
     */
    export function generateOTP(): string {
    return randomInt(100000, 1000000).toString();
    }

    /**
     * Retrieve the secret used for OTP hashing.
     */
    function getOTPSecret(): string {
    const secret = process.env.OTP_SECRET;

    if (!secret) {
        throw new Error("OTP_SECRET is not configured.");
    }

    return secret;
    }

    /**
     * Hash an OTP using HMAC-SHA256.
     */
    export function hashOTP(code: string): string {
    return createHmac("sha256", getOTPSecret())
        .update(code)
        .digest("hex");
    }

    /**
     * Compare an entered OTP against its stored hash.
     */
    export function verifyOTP(
    code: string,
    storedHash: string
    ): boolean {
    if (!/^\d{6}$/.test(code)) {
        return false;
    }

    const enteredHash = Buffer.from(hashOTP(code), "hex");
    const originalHash = Buffer.from(storedHash, "hex");

    if (enteredHash.length !== originalHash.length) {
        return false;
    }

    return timingSafeEqual(enteredHash, originalHash);
    }

    /**
     * Calculate when an OTP should expire.
     */
    export function getOTPExpiry(): Date {
    return new Date(
        Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
    );
    }
