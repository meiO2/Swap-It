
    import { NextRequest, NextResponse } from "next/server";

    import { connectDB } from "@/lib/mongodb";
    import User from "@/models/User";
    import PendingRegistration from "@/models/PendingRegistration";

    import { verifyAndConsumeOTP } from "@/lib/auth/otp-service";
    import { awardGreenPoints } from "@/lib/green-points";

    export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();
        const { email, code } = body;

        // Validate input.
        if (
        typeof email !== "string" ||
        typeof code !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        !/^\d{6}$/.test(code)
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "A valid email and six-digit verification code are required.",
            },
            { status: 400 }
        );
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Find the pending registration.
        const pendingRegistration = await PendingRegistration.findOne({
        email: normalizedEmail,
        expiresAt: { $gt: new Date() },
        }).select("+passwordHash");

        if (!pendingRegistration) {
        return NextResponse.json(
            {
            success: false,
            message: "Registration request not found or expired. Please register again.",
            },
            { status: 404 }
        );
        }

        // Prevent duplicate accounts.
        const existingUser = await User.findOne({
        email: normalizedEmail,
        });

        if (existingUser) {
        await PendingRegistration.deleteOne({
            email: normalizedEmail,
        });

        return NextResponse.json(
            {
            success: false,
            message: "An account with this email already exists.",
            },
            { status: 409 }
        );
        }

        // Verify and consume the OTP.
        const verification = await verifyAndConsumeOTP(
        normalizedEmail,
        "REGISTER",
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

        // Create the verified customer account.
        const user = await User.create({
        name: pendingRegistration.name,
        email: pendingRegistration.email,
        passwordHash: pendingRegistration.passwordHash,
        role: "CUSTOMER",
        isActive: true,
        emailVerifiedAt: new Date(),
        });
        await awardGreenPoints({
            userId: user._id.toString(),
            amount: 2000,
            description: "Account registration reward",
            referenceKey: `registration:${user._id.toString()}`,
        });

        // Remove temporary registration data.
        await PendingRegistration.deleteOne({
        _id: pendingRegistration._id,
        });

        return NextResponse.json(
        {
            success: true,
            message: "Email verified and account created successfully.",
            data: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            emailVerifiedAt: user.emailVerifiedAt,
            },
        },
        { status: 201 }
        );

    } catch (error) {
        console.error("OTP verification error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to verify email. Please try again.",
        },
        { status: 500 }
        );
    }
    }
