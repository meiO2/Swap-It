
    import { NextRequest, NextResponse } from "next/server";
    import mongoose from "mongoose";

    import { connectDB } from "@/lib/mongodb";
    import { authenticateHubDevice } from "@/lib/hub-device-auth";
    import HubDeviceSession from "@/models/HubDeviceSession";
    import Order from "@/models/Order";
    import Product from "@/models/Product";
    import Donation from "@/models/Donation";
    import { createNotificationsForMany } from "@/lib/notifications";

    import type {
    HubDoorEventRequest,
    HubDoorEventResponse,
    HubDeviceEvent,
    HubDeviceState,
    } from "@/types/hub-device";

    const transitions: Record<
    HubDeviceState,
    Partial<Record<HubDeviceEvent, HubDeviceState>>
    > = {
    IDLE: {},
    SCANNING: {},
    AUTHORIZED: { DOOR_OPENED: "DOOR_OPEN" },
    DOOR_UNLOCKED: { DOOR_OPENED: "DOOR_OPEN" },
    DOOR_OPEN: { ITEM_DETECTED: "ITEM_DETECTED" },
    ITEM_DETECTED: { DOOR_CLOSED: "DOOR_CLOSED" },
    DOOR_CLOSED: { DOOR_LOCKED: "COMPLETED" },
    DOOR_LOCKED: {},
    COMPLETED: {},
    FAILED: {},
    ERROR: {},
    };

    export async function POST(request: NextRequest) {
    try {
        const device = await authenticateHubDevice(request);

        if (!device) {
        return NextResponse.json(
            { success: false, message: "Invalid device credentials." },
            { status: 401 }
        );
        }

        const body: unknown = await request.json();

        if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
            { success: false, message: "Invalid event payload." },
            { status: 400 }
        );
        }

        const input = body as HubDoorEventRequest;

        const allowedEvents: HubDeviceEvent[] = [
        "DOOR_OPENED",
        "ITEM_DETECTED",
        "DOOR_CLOSED",
        "DOOR_LOCKED",
        ];

        if (
        typeof input.sessionId !== "string" ||
        !mongoose.isValidObjectId(input.sessionId) ||
        !allowedEvents.includes(input.event) ||
        typeof input.occurredAt !== "string" ||
        Number.isNaN(Date.parse(input.occurredAt))
        ) {
        return NextResponse.json(
            { success: false, message: "Invalid event details." },
            { status: 400 }
        );
        }

        await connectDB();

        const session = await HubDeviceSession.findOne({
            _id: new mongoose.Types.ObjectId(input.sessionId),
            deviceId: device.deviceId,
            hubId: device.hubId,
            state: {
                $nin: ["COMPLETED", "FAILED"] as const,
            },
        }).exec();

        if (!session) {
        return NextResponse.json(
            { success: false, message: "No active device session found." },
            { status: 404 }
        );
        }

        const nextState = transitions[session.state]?.[input.event];

        if (!nextState) {
        return NextResponse.json(
            {
            success: false,
            message: `Event ${input.event} is invalid in state ${session.state}.`,
            },
            { status: 409 }
        );
        }

        const occurredAt = new Date(input.occurredAt);
        const now = new Date();

        if (
        occurredAt.getTime() > now.getTime() + 30_000 ||
        occurredAt.getTime() < now.getTime() - 10 * 60_000
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "Event timestamp is outside the allowed window.",
            },
            { status: 400 }
        );
        }

        // Atomic compare-and-update: only one request can advance this state.
        const updatedSession = await HubDeviceSession.findOneAndUpdate(
        {
            _id: session._id,
            deviceId: device.deviceId,
            hubId: device.hubId,
            state: session.state,
        },
        {
            $set: {
            state: nextState,
            ...(input.event === "ITEM_DETECTED"
                ? { itemDetected: true }
                : {}),
            },
            $push: {
            events: {
                event: input.event,
                occurredAt,
                receivedAt: now,
            },
            },
        },
        { new: true, runValidators: true }
        ).lean();

        if (!updatedSession) {
        return NextResponse.json(
            {
            success: false,
            message: "Session state changed. Please refresh device state.",
            },
            { status: 409 }
        );
        }

        // A locked compartment is the auditable point at which a seller
        // handover becomes received and can enter QC.
        if (input.event === "DOOR_LOCKED" && updatedSession.activity === "SELLER_HANDOVER" && updatedSession.orderId && updatedSession.productId) {
            const order = await Order.findById(updatedSession.orderId);
            const item = order?.items.find((entry) => entry.productId.toString() === updatedSession.productId);
            if (order && item?.handover && item.handover.status === "SCHEDULED") {
                item.handover.status = "RECEIVED";
                item.handover.receivedAt = now;
                item.qcStatus = "PENDING";
                order.status = "QC_IN_PROGRESS";
                await order.save();
                await Product.updateOne({ _id: item.productId }, { $set: { status: "RECEIVED" } });
                await createNotificationsForMany({ recipientIds: [order.buyerId.toString(), item.sellerId.toString()], type: "ITEM_ARRIVED", title: "Item received by SwapIt", message: `${item.name} has been received and will proceed to quality inspection.`, link: `/orders/${order._id.toString()}` });
            }
        }
        if (input.event === "DOOR_LOCKED" && updatedSession.activity === "DONATION" && updatedSession.donationSessionId) {
            await Donation.updateOne(
                { sessionId: updatedSession.donationSessionId, status: { $in: ["QR_SCANNED", "DEPOSITING"] } },
                { $set: { status: "UNDER_VERIFICATION" } },
            );
        }

        const response: HubDoorEventResponse = {
        success: true,
        message: `Event ${input.event} recorded.`,
        data: {
            deviceState: nextState,
            nextAction: input.event === "DOOR_CLOSED" ? "LOCK" : "NONE",
        },
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("Hub door event error:", error);

        return NextResponse.json(
        { success: false, message: "Failed to process door event." },
        { status: 500 }
        );
    }
    }
