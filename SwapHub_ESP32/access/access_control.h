#ifndef SWAP_HUB_ACCESS_CONTROL_H
#define SWAP_HUB_ACCESS_CONTROL_H

#include <Arduino.h>
#include "../api/api_client.h"

bool doorUnlocked = false;
bool accessRequestInFlight = false;
portMUX_TYPE accessStateMux = portMUX_INITIALIZER_UNLOCKED;
String lastAttemptedQrCode;
String authorizedDeviceSessionId;
String pendingQrCode;
unsigned long lastDuplicateQrLogAt = 0;

void accessRequestTask(void *parameter) {
    (void)parameter;
    const String qrCode = pendingQrCode;
    String sessionId;
    const bool authorized = verifyQRCode(qrCode, sessionId);

    if (authorized) {
        authorizedDeviceSessionId = sessionId;
        Serial.println("[ACCESS] BACKEND AUTHORIZATION CONFIRMED.");
        Serial.print("[ACCESS] Device session recorded: ");
        Serial.println(authorizedDeviceSessionId);
        Serial.println("[ACCESS] Simulated door unlock; no GPIO output was activated.");
    } else {
        Serial.println("[ACCESS] ACCESS DENIED. Door remains locked.");
    }

    portENTER_CRITICAL(&accessStateMux);
    doorUnlocked = authorized;
    accessRequestInFlight = false;
    portEXIT_CRITICAL(&accessStateMux);

    vTaskDelete(NULL);
}

void initializeAccessControl() {
    portENTER_CRITICAL(&accessStateMux);
    doorUnlocked = false;
    accessRequestInFlight = false;
    portEXIT_CRITICAL(&accessStateMux);
    lastAttemptedQrCode = "";
    authorizedDeviceSessionId = "";
    pendingQrCode = "";

    Serial.println("[ACCESS] Access control initialized.");
    Serial.println("[ACCESS] Physical lock is not connected; unlock remains simulated.");
}

void processAccessRequest(const String &qrCode) {
    if (qrCode.length() == 0) {
        Serial.println("[ACCESS] Empty QR token.");
        return;
    }

    if (qrCode == lastAttemptedQrCode) {
        if (millis() - lastDuplicateQrLogAt > 3000) {
            Serial.println("[ACCESS] Ignoring a previously submitted QR token.");
            lastDuplicateQrLogAt = millis();
        }
        return;
    }

    portENTER_CRITICAL(&accessStateMux);
    const bool busy = doorUnlocked || accessRequestInFlight;
    if (!busy) accessRequestInFlight = true;
    portEXIT_CRITICAL(&accessStateMux);
    if (busy) return;

    // A scan request can consume a one-time token even if its response times out.
    // Never submit that token again automatically.
    lastAttemptedQrCode = qrCode;
    pendingQrCode = qrCode;
    Serial.println("[ACCESS] Contacting the SwapIt backend...");

    if (xTaskCreate(accessRequestTask, "hubScanRequest", 12288, NULL, 1, NULL) != pdPASS) {
        portENTER_CRITICAL(&accessStateMux);
        accessRequestInFlight = false;
        portEXIT_CRITICAL(&accessStateMux);
        pendingQrCode = "";
        Serial.println("[ACCESS] Could not start the HTTPS request task.");
        return;
    }
}

void closeAccess() {
    portENTER_CRITICAL(&accessStateMux);
    doorUnlocked = false;
    portEXIT_CRITICAL(&accessStateMux);
    Serial.println("[ACCESS] Simulated door locked. No door event was sent.");
}

bool isDoorUnlocked() {
    portENTER_CRITICAL(&accessStateMux);
    const bool unlocked = doorUnlocked;
    portEXIT_CRITICAL(&accessStateMux);
    return unlocked;
}

bool isAccessRequestInFlight() {
    portENTER_CRITICAL(&accessStateMux);
    const bool inFlight = accessRequestInFlight;
    portEXIT_CRITICAL(&accessStateMux);
    return inFlight;
}

#endif
