
    import { connection, NextResponse } from "next/server";
    import { connectDB } from "@/lib/mongodb";

    export async function GET() {
    await connection();
    try {
        await connectDB();

        return NextResponse.json({
        success: true,
        message: "MongoDB connected successfully!",
        database: "SwapIt",
        });
    } catch (error) {
        console.error("Database connection failed:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Database connection failed.",
        },
        { status: 500 }
        );
    }
    }
