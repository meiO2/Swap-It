
    import { NextRequest, NextResponse } from "next/server";
    import { connectDB } from "@/lib/mongodb";
    import Session from "@/models/Session";
    import { hashSessionToken } from "@/lib/auth";

    export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const token = request.cookies.get("swapit_session")?.value;

        if (token) {
        const tokenHash = hashSessionToken(token);
        await Session.deleteOne({ tokenHash });
        }

        const response = NextResponse.json(
        {
            success: true,
            message: "Logout successful.",
            data: null,
        },
        { status: 200 }
        );

        response.cookies.set("swapit_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        });

        return response;
    } catch (error) {
        console.error("Logout error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to logout.",
            data: null,
        },
        { status: 500 }
        );
    }
    }
