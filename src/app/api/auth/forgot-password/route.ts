    import { NextRequest, NextResponse } from "next/server";

    import { connectDB } from "@/lib/mongodb";
    import User from "@/models/User";

    import { createOTP } from "@/lib/auth/otp-service";
    import { sendVerificationEmail } from "@/lib/email/send-verification-email";

    export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();
        const { email } = body;

        if (typeof email !== "string" || !email.trim()) {
        return NextResponse.json(
            {
            success: false,
            message: "A valid email is required.",
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

        const user = await User.findOne({
        email: normalizedEmail,
        });

        // Return the same response whether the account exists or not.
        // This prevents exposing registered email addresses.
        if (user && user.isActive && user.emailVerifiedAt) {
        const code = await createOTP(
            normalizedEmail,
            "FORGOT_PASSWORD"
        );

        await sendVerificationEmail(normalizedEmail, code, "FORGOT_PASSWORD");
        }

        return NextResponse.json(
        {
            success: true,
            message:
            "If an eligible account exists, a password reset code has been sent.",
        },
        { status: 200 }
        );
    } catch (error) {
        console.error("Forgot password error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to process password recovery.",
        },
        { status: 500 }
        );
    }
    }