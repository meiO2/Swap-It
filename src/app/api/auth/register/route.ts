
    import { NextRequest, NextResponse } from "next/server";

    import { connectDB } from "@/lib/mongodb";
    import User from "@/models/User";
    import PendingRegistration from "@/models/PendingRegistration";

    import { hashPassword } from "@/lib/auth";
    import { createOTP } from "@/lib/auth/otp-service";
    import { sendVerificationEmail } from "@/lib/email/send-verification-email";

    export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();
        const { name, email, password } = body;

        // Validate required fields.
        if (!name || !email || !password) {
        return NextResponse.json(
            {
            success: false,
            message: "Name, email, and password are required.",
            },
            { status: 400 }
        );
        }

        // Validate input types.
        if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string"
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "Invalid input format.",
            },
            { status: 400 }
        );
        }

        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedName || normalizedName.length > 100) {
        return NextResponse.json(
            {
            success: false,
            message: "Name must be between 1 and 100 characters.",
            },
            { status: 400 }
        );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return NextResponse.json(
            {
            success: false,
            message: "Invalid email address.",
            },
            { status: 400 }
        );
        }

        if (password.length < 8 || password.length > 128) {
        return NextResponse.json(
            {
            success: false,
            message: "Password must be between 8 and 128 characters.",
            },
            { status: 400 }
        );
        }

        // Check whether the email is already registered.
        const existingUser = await User.findOne({
        email: normalizedEmail,
        });

        if (existingUser) {
        return NextResponse.json(
            {
            success: false,
            message: "Email is already registered.",
            },
            { status: 409 }
        );
        }

        // Hash the password before temporarily storing it.
        const passwordHash = await hashPassword(password);

        // Save or update the pending registration.
        await PendingRegistration.findOneAndUpdate(
        { email: normalizedEmail },
        {
            $set: {
            name: normalizedName,
            passwordHash,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            },
        },
        {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
        }
        );

        // Generate and store the verification OTP.
        const code = await createOTP(
        normalizedEmail,
        "REGISTER"
        );

        try {
        // Send the verification email.
        await sendVerificationEmail(
            normalizedEmail,
            code
        );
        } catch (emailError) {
        // Clean up if email delivery fails.
        await PendingRegistration.deleteOne({
            email: normalizedEmail,
        });

        const OTP = (await import("@/models/OTP")).default;

        await OTP.deleteMany({
            email: normalizedEmail,
            purpose: "REGISTER",
        });

        throw emailError;
        }

        return NextResponse.json(
        {
            success: true,
            message: "Verification code sent. Please check your email.",
            data: {
            email: normalizedEmail,
            expiresIn: 300,
            },
        },
        { status: 200 }
        );

    } catch (error) {
        console.error("Registration error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to start registration. Please try again.",
        },
        { status: 500 }
        );
    }
    }
