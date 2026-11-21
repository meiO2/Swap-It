#ifndef SWAP_HUB_ACCESS_CONTROL_H
#define SWAP_HUB_ACCESS_CONTROL_H

#include <Arduino.h>
#include <cstring>
#include <esp_heap_caps.h>
#include <esp_timer.h>
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

#if ENABLE_PHYSICAL_RELAY
static const int RELAY_PIN = 21;
static esp_timer_handle_t relayTimer = nullptr;
static bool relayTimerExpired = false;
static uint32_t relayGeneration = 0;

inline void relayTimeout(void *) {
    portENTER_CRITICAL(&accessStateMux);
    relayTimerExpired = true;
    digitalWrite(RELAY_PIN, HIGH);
    doorUnlocked = false;
    authorizedDeviceSessionId[0] = '\0';
    portEXIT_CRITICAL(&accessStateMux);
}

inline bool activateRelay(const String &sessionId, uint32_t generation) {
    if (!relayTimer || sessionId.length() == 0 || sessionId.length() > 128) return false;
    portENTER_CRITICAL(&accessStateMux);
    if (generation != relayGeneration) {
        portEXIT_CRITICAL(&accessStateMux);
        return false;
    }
    relayTimerExpired = false;
    portEXIT_CRITICAL(&accessStateMux);
    if (esp_timer_start_once(relayTimer, 3000000) != ESP_OK) {
        Serial.println("[ACCESS] Could not start relay safety timer.");
        return false;
    }
    portENTER_CRITICAL(&accessStateMux);
    if (relayTimerExpired || generation != relayGeneration) {
        portEXIT_CRITICAL(&accessStateMux);
        return false;
    }
    digitalWrite(RELAY_PIN, LOW);
    doorUnlocked = true;
    sessionId.toCharArray(authorizedDeviceSessionId, sizeof(authorizedDeviceSessionId));
    portEXIT_CRITICAL(&accessStateMux);
    return true;
}

inline void remoteUnlockTask(void *) {
    for (;;) {
        bool reserved = false;
        uint32_t generation = 0;
        if (WiFi.status() == WL_CONNECTED) {
            portENTER_CRITICAL(&accessStateMux);
            if (!doorUnlocked && !accessRequestInFlight) {
                accessRequestInFlight = true;
                reserved = true;
                generation = relayGeneration;
            }
            portEXIT_CRITICAL(&accessStateMux);
        }
        if (reserved) {
            const unsigned long startedAt = millis();
            String responseBody;
            const int code = postHubJson(
                "/api/iot/remote-unlock", "{\"action\":\"CLAIM\"}", responseBody);
            StaticJsonDocument<512> response;
            if (code != HTTP_CODE_OK) {
                Serial.println("[ACCESS] Remote command poll failed.");
            } else if (deserializeJson(response, responseBody) || response["success"] != true) {
                Serial.println("[ACCESS] Invalid remote command response.");
            } else if (strcmp(response["action"] | "", "UNLOCK") == 0) {
                const char *id = response["data"]["sessionId"] | "";
                const unsigned long validForMs = response["data"]["validForMs"] | 0UL;
                const String sessionId(id);
                if (validForMs > millis() - startedAt && activateRelay(sessionId, generation)) {
                    Serial.println("[ACCESS] Relay activated; physical door position is not verified.");
                    StaticJsonDocument<256> ack;
                    ack["action"] = "RELAY_ACTIVATED";
                    ack["sessionId"] = sessionId;
                    String payload;
                    serializeJson(ack, payload);
                    String ackResponse;
                    int ackCode = postHubJson("/api/iot/remote-unlock", payload, ackResponse);
                    if (ackCode < 0 || ackCode >= 500) {
                        ackResponse = "";
                        ackCode = postHubJson("/api/iot/remote-unlock", payload, ackResponse);
                    }
                    StaticJsonDocument<256> ackResult;
                    if (ackCode != HTTP_CODE_OK || deserializeJson(ackResult, ackResponse) ||
                        ackResult["success"] != true) {
                        Serial.println("[ACCESS] Relay acknowledgement failed; check the session manually.");
                    }
                } else {
                    Serial.println("[ACCESS] Expired or invalid remote command; relay remains locked.");
                }
            } else if (strcmp(response["action"] | "", "NONE") != 0) {
                Serial.println("[ACCESS] Unknown remote command; relay remains locked.");
            }
            portENTER_CRITICAL(&accessStateMux);
            accessRequestInFlight = false;
            portEXIT_CRITICAL(&accessStateMux);
        }
        vTaskDelay(pdMS_TO_TICKS(1500));
    }
}
#endif

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
#if ENABLE_PHYSICAL_RELAY
    digitalWrite(RELAY_PIN, HIGH);
    pinMode(RELAY_PIN, OUTPUT);
    esp_timer_create_args_t timerArgs = {};
    timerArgs.callback = relayTimeout;
    timerArgs.dispatch_method = ESP_TIMER_TASK;
    timerArgs.name = "hubRelay";
    if (esp_timer_create(&timerArgs, &relayTimer) != ESP_OK) {
        relayTimer = nullptr;
        Serial.println("[ACCESS] Relay timer initialization failed; remote unlock disabled.");
    }
#endif
    portENTER_CRITICAL(&accessStateMux);
    doorUnlocked = false;
    accessRequestInFlight = false;
    portEXIT_CRITICAL(&accessStateMux);

    lastAttemptedQrCode[0] = '\0';
    authorizedDeviceSessionId[0] = '\0';
    lastDuplicateQrLogAt = 0;

    Serial.println("[ACCESS] Access control initialized.");
#if ENABLE_PHYSICAL_RELAY
    Serial.println("[ACCESS] Relay is locked. Remote unlock requires backend authorization.");
#else
    Serial.println("[ACCESS] Physical relay is disabled; unlock remains simulated.");
#endif
}

inline void startRemoteUnlockTask() {
#if ENABLE_PHYSICAL_RELAY
    if (relayTimer && xTaskCreatePinnedToCore(
            remoteUnlockTask, "hubRemoteUnlock", 12288, nullptr, 1, nullptr, 1) != pdPASS) {
        Serial.println("[ACCESS] Could not start remote unlock task.");
    }
#endif
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
#if ENABLE_PHYSICAL_RELAY
    relayGeneration++;
    relayTimerExpired = true;
    digitalWrite(RELAY_PIN, HIGH);
#endif
    doorUnlocked = false;
    authorizedDeviceSessionId[0] = '\0';
    portEXIT_CRITICAL(&accessStateMux);
#if ENABLE_PHYSICAL_RELAY
    if (relayTimer) esp_timer_stop(relayTimer);
    Serial.println("[ACCESS] Relay locked. No door event was sent.");
#else
    Serial.println("[ACCESS] Simulated door locked. No door event was sent.");
#endif
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
