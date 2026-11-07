
    import { NextRequest, NextResponse } from "next/server";
    import { connectDB } from "@/lib/mongodb";
    import Order from "@/models/Order";

    export async function GET(request: NextRequest) {
    try {
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret) {
        console.error("CRON_SECRET is not configured.");

        return NextResponse.json(
            { success: false, message: "Cron configuration error." },
            { status: 500 },
        );
        }

        const authorization = request.headers.get("authorization");

        if (authorization !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { success: false, message: "Unauthorized." },
            { status: 401 },
        );
        }

        await connectDB();

        const now = new Date();

        const orders = await Order.find({
        items: {
            $elemMatch: {
            qcStatus: "FAILED_AWAITING_BUYER",
            qcDecisionDeadline: { $lte: now },
            },
        },
        });

        let expiredCount = 0;

        for (const order of orders) {
        let changed = false;

        for (const item of order.items) {
            if (
            item.qcStatus === "FAILED_AWAITING_BUYER" &&
            item.qcDecisionDeadline &&
            new Date(item.qcDecisionDeadline) <= now
            ) {
            item.qcStatus = "EXPIRED";
            changed = true;
            expiredCount++;
            }
        }

        if (changed) {
            await order.save();
        }
        }

        return NextResponse.json({
        success: true,
        message: "QC deadline processing completed.",
        expiredCount,
        processedAt: now.toISOString(),
        });
    } catch (error) {
        console.error("QC deadline cron error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Could not process QC deadlines.",
        },
        { status: 500 },
        );
    }
    }
