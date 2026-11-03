    import { NextRequest, NextResponse } from "next/server";

    import { connectDB } from "@/lib/mongodb";
    import User from "@/models/User";
    import Session from "@/models/Session";

    import { hashPassword } from "@/lib/auth";
    import { verifyAndConsumeOTP } from "@/lib/auth/otp-service";

    export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();
        const { email, code, newPassword } = body;

        if (
        typeof email !== "string" ||
        typeof code !== "string" ||
        typeof newPassword !== "string"
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "Email, verification code, and new password are required.",
            },
            { status: 400 }
        );
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return NextResponse.json(
            {
            success: false,
            message: "Invalid email format.",
            },
            { status: 400 }
        );
        }

        if (!/^\d{6}$/.test(code)) {
        return NextResponse.json(
            {
            success: false,
            message: "A valid six-digit verification code is required.",
            },
            { status: 400 }
        );
        }

        if (newPassword.length < 8 || newPassword.length > 128) {
        return NextResponse.json(
            {
            success: false,
            message: "Password must be between 8 and 128 characters.",
            },
            { status: 400 }
        );
        }

        const user = await User.findOne({
        email: normalizedEmail,
        isActive: true,
        emailVerifiedAt: { $ne: null },
        });

        if (!user) {
        return NextResponse.json(
            {
            success: false,
            message: "Unable to process password reset.",
            },
            { status: 400 }
        );
        }

        const verification = await verifyAndConsumeOTP(
        normalizedEmail,
        "FORGOT_PASSWORD",
        code
        );

        if (!verification.success) {
        const messages = {
            NOT_FOUND: "Verification code not found. Please request a new one.",
            EXPIRED: "Verification code has expired. Please request a new one.",
            INVALID: "Incorrect verification code.",
            MAX_ATTEMPTS: "Maximum verification attempts reached. Please request a new code.",
        };

        return NextResponse.json(
            {
            success: false,
            message: messages[verification.reason],
            ...(verification.reason === "INVALID"
                ? { remainingAttempts: verification.remainingAttempts }
                : {}),
            },
            { status: 400 }
        );
        }

        const passwordHash = await hashPassword(newPassword);

        user.passwordHash = passwordHash;
        await user.save();

        // Invalidate all existing login sessions.
        await Session.deleteMany({
        userId: user._id,
        });

        return NextResponse.json(
        {
            success: true,
            message: "Password reset successfully. Please log in again.",
        },
        { status: 200 }
        );
    } catch (error) {
        console.error("Reset password error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to reset password. Please try again.",
        },
        { status: 500 }
        );
    }
    }