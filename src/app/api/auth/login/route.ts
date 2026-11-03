    import { NextRequest, NextResponse } from "next/server";
    import { connectDB } from "@/lib/mongodb";
    import User from "@/models/User";
    import Session from "@/models/Session";
    import {
    verifyPassword,
    generateSessionToken,
    hashSessionToken,
    } from "@/lib/auth";

    const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

    export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();
        const { email, password } = body;

        if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "Email and password are required.",
            },
            { status: 400 }
        );
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Retrieve passwordHash explicitly because the field has select: false.
        const user = await User.findOne({
        email: normalizedEmail,
        }).select("+passwordHash");

        if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return NextResponse.json(
            {
            success: false,
            message: "Invalid email or password.",
            },
            { status: 401 }
        );
        }

        if (!user.emailVerifiedAt) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Please verify your email before logging in.",
                },
                { status: 403 }
            );
        }

        if (!user.isActive) {
        return NextResponse.json(
            {
            success: false,
            message: "This account is inactive.",
            },
            { status: 403 }
        );
        }

        // Generate a random session token.
        const sessionToken = generateSessionToken();
        const tokenHash = hashSessionToken(sessionToken);

        const expiresAt = new Date(Date.now() + SESSION_DURATION);

        // Store only the token hash in MongoDB.
        await Session.create({
        userId: user._id,
        tokenHash,
        expiresAt,
        });

        const response = NextResponse.json(
        {
            success: true,
            message: "Login successful.",
            data: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            },
        },
        { status: 200 }
        );

        response.cookies.set("swapit_session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
        });

        return response;
    } catch (error) {
        console.error("Login error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to login.",
        },
        { status: 500 }
        );
    }
    }