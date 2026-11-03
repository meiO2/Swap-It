
    import { connectDB } from "@/lib/mongodb";
    import OTP, { OTPPurpose } from "@/models/OTP";

    import {
    generateOTP,
    hashOTP,
    verifyOTP,
    getOTPExpiry,
    OTP_MAX_ATTEMPTS,
    } from "@/lib/auth/otp";

    /**
     * Create a new OTP.
     * Any previous OTP for the same email and purpose is invalidated.
     */
    export async function createOTP(
    email: string,
    purpose: OTPPurpose
    ) {
    await connectDB();

    const normalizedEmail = email.trim().toLowerCase();

    // Invalidate previous OTPs.
    await OTP.deleteMany({
        email: normalizedEmail,
        purpose,
    });

    // Generate a new OTP.
    const code = generateOTP();

    // Store only its hash.
    await OTP.create({
        email: normalizedEmail,
        codeHash: hashOTP(code),
        purpose,
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt: getOTPExpiry(),
    });

    // Return the original code for the email delivery service.
    return code;
    }

    export type OTPVerificationResult =
    | { success: true }
    | {
        success: false;
        reason: "NOT_FOUND" | "EXPIRED" | "INVALID" | "MAX_ATTEMPTS";
        remainingAttempts?: number;
        };

    /**
     * Verify an OTP and consume it if valid.
     */
    export async function verifyAndConsumeOTP(
    email: string,
    purpose: OTPPurpose,
    code: string
    ): Promise<OTPVerificationResult> {
    await connectDB();

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^\d{6}$/.test(code)) {
        return { success: false, reason: "INVALID" };
    }

    const otp = await OTP.findOne({
        email: normalizedEmail,
        purpose,
        consumedAt: null,
    }).select("+codeHash");

    if (!otp) {
        return { success: false, reason: "NOT_FOUND" };
    }

    const now = new Date();

    if (otp.expiresAt <= now) {
        return { success: false, reason: "EXPIRED" };
    }

    if (otp.attempts >= otp.maxAttempts) {
        return { success: false, reason: "MAX_ATTEMPTS" };
    }

    const isValid = verifyOTP(code, otp.codeHash);

    // Incorrect code: atomically increment attempts.
    if (!isValid) {
        const updated = await OTP.findOneAndUpdate(
        {
            _id: otp._id,
            consumedAt: null,
            expiresAt: { $gt: now },
            attempts: { $lt: otp.maxAttempts },
        },
        {
            $inc: { attempts: 1 },
        },
        {
            new: true,
        }
        );

        if (!updated) {
        return { success: false, reason: "MAX_ATTEMPTS" };
        }

        const remainingAttempts = Math.max(
        0,
        updated.maxAttempts - updated.attempts
        );

        if (remainingAttempts === 0) {
        return { success: false, reason: "MAX_ATTEMPTS" };
        }

        return {
        success: false,
        reason: "INVALID",
        remainingAttempts,
        };
    }

    // Correct code: consume it atomically.
    const consumed = await OTP.findOneAndUpdate(
        {
        _id: otp._id,
        consumedAt: null,
        expiresAt: { $gt: now },
        attempts: { $lt: otp.maxAttempts },
        },
        {
        $set: { consumedAt: now },
        },
        {
        new: true,
        }
    );

    if (!consumed) {
        return { success: false, reason: "EXPIRED" };
    }

    return { success: true };
    }
