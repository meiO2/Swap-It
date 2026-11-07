
    /**
     * Shared SwapIt Hub Device Protocol
     */

    // DEVICE AUTHENTICATION

    export type HubDeviceHeaders = {
    "x-device-id": string;
    "x-device-key": string;
    };

    // QR SCANNING

    export type HubScanRequest = {
    token: string;
    };

    export type HubActivity = "DONATION" | "SELLER_HANDOVER";

    export type HubScanSuccessResponse = {
        success: true;
        action: "UNLOCK";
        message: string;
        data: {
            sessionId: string;
            activity: HubActivity;
            hubId: string;
            deviceId: string;
            donationSessionId: string | null;
            orderId: string | null;
            productId: string | null;
        };
    };

    export type HubErrorResponse = {
    success: false;
    message: string;
    };

    export type HubScanResponse =
    | HubScanSuccessResponse
    | HubErrorResponse;

    // DOOR CONTROL

    export type HubLockAction = "LOCK" | "UNLOCK";

    export type HubDeviceState =
        | "IDLE"
        | "SCANNING"
        | "AUTHORIZED"
        | "DOOR_UNLOCKED"
        | "DOOR_OPEN"
        | "ITEM_DETECTED"
        | "DOOR_CLOSED"
        | "DOOR_LOCKED"
        | "COMPLETED"
        | "FAILED"
        | "ERROR";

    // DEVICE EVENTS

    export type HubDeviceEvent =
    | "DOOR_OPENED"
    | "ITEM_DETECTED"
    | "DOOR_CLOSED"
    | "DOOR_LOCKED";

    export type HubDoorEventRequest = {
        sessionId: string;
        event: HubDeviceEvent;
        occurredAt: string;
    };

    export type HubDoorEventResponse = {
    success: boolean;
    message: string;
    data?: {
        deviceState: HubDeviceState;
        nextAction: HubLockAction | "NONE";
    };
    };
