    import { NextRequest, NextResponse } from "next/server";
    import { connectDB } from "@/lib/mongodb";
    import User from "@/models/User";
    import { hashPassword } from "@/lib/auth";

    export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();

        const { name, email, password } = body;

        // Validate required fields
        if (!name || !email || !password) {
        return NextResponse.json(
            {
            success: false,
            message: "Name, email, and password are required.",
            },
            { status: 400 }
        );
        }

        // Validate input types
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

        const normalizedEmail = email.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return NextResponse.json(
            {
            success: false,
            message: "Invalid email address.",
            },
            { status: 400 }
        );
        }

        if (password.length < 8) {
        return NextResponse.json(
            {
            success: false,
            message: "Password must be at least 8 characters.",
            },
            { status: 400 }
        );
        }

        // Check whether email already exists
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

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create user
        const user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: "CUSTOMER",
        });

        return NextResponse.json(
        {
            success: true,
            message: "Account registered successfully.",
            data: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            },
        },
        { status: 201 }
        );
    } catch (error) {
        console.error("Registration error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to register account.",
        },
        { status: 500 }
        );
    }
    }