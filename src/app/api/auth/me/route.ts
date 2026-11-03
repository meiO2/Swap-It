    import { NextResponse } from "next/server";
    import { getCurrentUser } from "@/lib/session";

    export async function GET() {
    try {
        const user = await getCurrentUser();

        if (!user) {
        return NextResponse.json(
            {
            success: false,
            message: "Unauthorized. Please log in.",
            },
            { status: 401 }
        );
        }

        return NextResponse.json(
        {
            success: true,
            message: "User authenticated successfully.",
            data: user,
        },
        { status: 200 }
        );
    } catch (error) {
        console.error("Get current user error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to retrieve current user.",
        },
        { status: 500 }
        );
    }
    }