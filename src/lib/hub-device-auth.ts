    import { createHash } from "crypto";
    import HubDevice from "@/models/HubDevice";

    export type AuthenticatedHubDevice = {
    deviceId: string;
    hubId: string;
    };

    function hashApiKey(apiKey: string) {
    return createHash("sha256").update(apiKey).digest("hex");
    }

    export async function authenticateHubDevice(
    request: Request
    ): Promise<AuthenticatedHubDevice | null> {
    const deviceId = request.headers.get("x-device-id");
    const apiKey = request.headers.get("x-device-key");

    if (!deviceId || !apiKey) {
        return null;
    }

    const device = await HubDevice.findOne({
        deviceId,
        apiKeyHash: hashApiKey(apiKey),
        status: "ACTIVE",
    }).select("deviceId hubId");

    if (!device) {
        return null;
    }

    await HubDevice.updateOne(
        { _id: device._id },
        { $set: { lastSeenAt: new Date() } }
    );

    return {
        deviceId: device.deviceId,
        hubId: device.hubId,
    };
    }