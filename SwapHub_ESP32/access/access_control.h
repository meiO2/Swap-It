#ifndef SWAP_HUB_ACCESS_CONTROL_H
#define SWAP_HUB_ACCESS_CONTROL_H

#include <Arduino.h>
#include <cstring>
#include <esp_heap_caps.h>
#include "../api/api_client.h"

#ifndef QR_TOKEN_LENGTH
#define QR_TOKEN_LENGTH 43
#endif

static bool doorUnlocked = false;
static bool accessRequestInFlight = false;
static portMUX_TYPE accessStateMux = portMUX_INITIALIZER_UNLOCKED;
static char lastAttemptedQrCode[QR_TOKEN_LENGTH + 1];
static char authorizedDeviceSessionId[129];
static unsigned long lastDuplicateQrLogAt = 0;

struct AccessRequestParams {
    char qrCode[QR_TOKEN_LENGTH + 1];
};

inline void accessRequestTask(void *parameter) {
    AccessRequestParams *params =
        static_cast<AccessRequestParams *>(parameter);
    if (!params) {
        portENTER_CRITICAL(&accessStateMux);
        accessRequestInFlight = false;
        portEXIT_CRITICAL(&accessStateMux);
        vTaskDelete(nullptr);
        return;
    }

    const String qrCode(params->qrCode);
    heap_caps_free(params);

    String sessionId;
    const bool authorized = verifyQRCode(qrCode, sessionId);

    portENTER_CRITICAL(&accessStateMux);
    doorUnlocked = authorized;
    accessRequestInFlight = false;
    if (authorized) {
        sessionId.toCharArray(
            authorizedDeviceSessionId,
            sizeof(authorizedDeviceSessionId));
    } else {
        authorizedDeviceSessionId[0] = '\0';
    }
    portEXIT_CRITICAL(&accessStateMux);

    if (authorized) {
        Serial.println("[ACCESS] BACKEND AUTHORIZATION CONFIRMED.");
        Serial.println("[ACCESS] Access session authorized.");
        Serial.println("[ACCESS] Simulated door unlock; no GPIO output was activated.");
    } else {
        Serial.println("[ACCESS] ACCESS DENIED. Door remains locked.");
    }

    vTaskDelete(nullptr);
}

inline void initializeAccessControl() {
    portENTER_CRITICAL(&accessStateMux);
    doorUnlocked = false;
    accessRequestInFlight = false;
    portEXIT_CRITICAL(&accessStateMux);

    lastAttemptedQrCode[0] = '\0';
    authorizedDeviceSessionId[0] = '\0';
    lastDuplicateQrLogAt = 0;

    Serial.println("[ACCESS] Access control initialized.");
    Serial.println("[ACCESS] Physical lock is not connected; unlock remains simulated.");
}

inline void processAccessRequest(const String &qrCode) {
    if (qrCode.length() != QR_TOKEN_LENGTH) {
        Serial.println("[ACCESS] Invalid QR token length.");
        return;
    }

    portENTER_CRITICAL(&accessStateMux);
    const bool duplicate =
        strncmp(lastAttemptedQrCode, qrCode.c_str(), sizeof(lastAttemptedQrCode)) == 0;
    const bool busy = doorUnlocked || accessRequestInFlight;
    if (!duplicate && !busy) accessRequestInFlight = true;
    portEXIT_CRITICAL(&accessStateMux);

    if (duplicate) {
        if (millis() - lastDuplicateQrLogAt > 3000) {
            Serial.println("[ACCESS] Ignoring a previously submitted QR token.");
            lastDuplicateQrLogAt = millis();
        }
        return;
    }
    if (busy) return;

    AccessRequestParams *params =
        static_cast<AccessRequestParams *>(heap_caps_malloc(
            sizeof(AccessRequestParams), MALLOC_CAP_INTERNAL));
    if (!params) {
        portENTER_CRITICAL(&accessStateMux);
        accessRequestInFlight = false;
        portEXIT_CRITICAL(&accessStateMux);
        Serial.println("[ACCESS] Could not allocate authorization task parameters.");
        return;
    }

    memset(params, 0, sizeof(*params));
    qrCode.toCharArray(params->qrCode, sizeof(params->qrCode));

    portENTER_CRITICAL(&accessStateMux);
    strlcpy(lastAttemptedQrCode, qrCode.c_str(), sizeof(lastAttemptedQrCode));
    portEXIT_CRITICAL(&accessStateMux);

    Serial.println("[ACCESS] Contacting the SwapIt backend...");
    if (xTaskCreatePinnedToCore(
            accessRequestTask, "hubScanRequest", 12288,
            params, 1, nullptr, 1) != pdPASS) {
        heap_caps_free(params);
        portENTER_CRITICAL(&accessStateMux);
        accessRequestInFlight = false;
        portEXIT_CRITICAL(&accessStateMux);
        Serial.println("[ACCESS] Could not start the HTTPS request task.");
    }
}

inline void closeAccess() {
    portENTER_CRITICAL(&accessStateMux);
    doorUnlocked = false;
    authorizedDeviceSessionId[0] = '\0';
    portEXIT_CRITICAL(&accessStateMux);
    Serial.println("[ACCESS] Simulated door locked. No door event was sent.");
}

inline bool isDoorUnlocked() {
    portENTER_CRITICAL(&accessStateMux);
    const bool unlocked = doorUnlocked;
    portEXIT_CRITICAL(&accessStateMux);
    return unlocked;
}

inline bool isAccessRequestInFlight() {
    portENTER_CRITICAL(&accessStateMux);
    const bool inFlight = accessRequestInFlight;
    portEXIT_CRITICAL(&accessStateMux);
    return inFlight;
}

#endif
