#ifndef SWAP_HUB_API_CLIENT_H
#define SWAP_HUB_API_CLIENT_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <string.h>
#include <time.h>
#include "../config/config.h"
#include "../config/root_ca.h"

const char *HUB_SCAN_ENDPOINT = "/api/iot/scan";
const char *HUB_DOOR_EVENT_ENDPOINT = "/api/iot/door-event";

bool ensureSystemClock() {
    if (WiFi.status() != WL_CONNECTED) return false;
    struct tm timeInfo;
    if (getLocalTime(&timeInfo, 0) && timeInfo.tm_year + 1900 >= 2024) {
        return true;
    }

    configTime(0, 0, "pool.ntp.org", "time.google.com");

    for (uint8_t attempt = 0; attempt < 10; attempt++) {
        if (getLocalTime(&timeInfo, 1000) && timeInfo.tm_year + 1900 >= 2024) {
            return true;
        }
        if (WiFi.status() != WL_CONNECTED) return false;
    }
    return false;
}

int postHubJsonAt(
    const String &endpoint,
    const String &canonicalEndpoint,
    const String &payload,
    String &responseBody,
    bool allowCanonicalRedirect
) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[API] Wi-Fi is not connected; request not sent.");
        return -1;
    }
    if (!ensureSystemClock()) {
        Serial.println("[API] System time is unavailable; HTTPS certificate validation cannot proceed.");
        return -1;
    }

    WiFiClientSecure secureClient;
    secureClient.setCACert(SWAPIT_ROOT_CA);
    secureClient.setHandshakeTimeout(10);

    HTTPClient http;
    if (!http.begin(secureClient, endpoint)) {
        Serial.println("[API] HTTPS request initialization failed.");
        return -1;
    }

    const char *responseHeaders[] = { "Location" };
    http.collectHeaders(responseHeaders, 1);
    http.setConnectTimeout(8000);
    http.setTimeout(8000);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-id", DEVICE_ID);
    http.addHeader("x-device-key", DEVICE_API_KEY);

    const int responseCode = http.POST(payload);
    if (responseCode > 0) {
        responseBody = http.getString();
        if (responseCode == HTTP_CODE_PERMANENT_REDIRECT) {
            const String redirectLocation = http.header("Location");
            http.end();
            if (allowCanonicalRedirect && redirectLocation == canonicalEndpoint) {
                Serial.println("[API] Following the verified production-host redirect.");
                return postHubJsonAt(
                    redirectLocation,
                    canonicalEndpoint,
                    payload,
                    responseBody,
                    false
                );
            }
            Serial.println("[API] Refusing an unexpected or repeated HTTPS redirect.");
            return responseCode;
        }
    } else {
        Serial.print("[API] HTTPS request failed: ");
        Serial.println(http.errorToString(responseCode));
    }

    http.end();
    return responseCode;
}

int postHubJson(const char *path, const String &payload, String &responseBody) {
    String baseUrl = API_BASE_URL;
    while (baseUrl.endsWith("/")) {
        baseUrl.remove(baseUrl.length() - 1);
    }
    if (baseUrl != "https://swapitproject.web.id" &&
        baseUrl != "https://www.swapitproject.web.id") {
        Serial.println("[API] Refusing to send device credentials to an unapproved backend host.");
        return -1;
    }

    const String canonicalEndpoint = String("https://www.swapitproject.web.id") + path;
    return postHubJsonAt(
        baseUrl + path,
        canonicalEndpoint,
        payload,
        responseBody,
        true
    );
}

bool verifyQRCode(const String &qrCode, String &sessionId) {
    StaticJsonDocument<256> request;
    request["token"] = qrCode;
    String payload;
    serializeJson(request, payload);

    Serial.println("[API] Sending QR token for backend verification.");
    String responseBody;
    const int responseCode = postHubJson(HUB_SCAN_ENDPOINT, payload, responseBody);

    if (responseCode != HTTP_CODE_OK) {
        Serial.print("[API] QR scan rejected or unavailable. HTTP status: ");
        Serial.println(responseCode);
        if (responseCode == 400) Serial.println("[API] Backend rejected the token format or request body.");
        if (responseCode == 401) Serial.println("[API] Check device credentials.");
        if (responseCode == 404) Serial.println("[API] Device or Hub resource was not found.");
        if (responseCode == 409) Serial.println("[API] Token is expired, revoked, consumed, or conflicts with the session.");
        if (responseCode >= 500) Serial.println("[API] Backend error. Do not retry this token automatically.");
        return false;
    }

    StaticJsonDocument<768> response;
    const DeserializationError parseError = deserializeJson(response, responseBody);
    if (parseError) {
        Serial.print("[API] Could not parse the scan response: ");
        Serial.println(parseError.c_str());
        return false;
    }

    const char *action = response["action"] | "";
    const char *returnedSessionId = response["data"]["sessionId"] | "";
    if (response["success"] != true ||
        strcmp(action, "UNLOCK") != 0 ||
        strlen(returnedSessionId) == 0 ||
        strlen(returnedSessionId) > 128) {
        const char *message = response["message"] | "Unexpected authorization response.";
        Serial.print("[API] Backend did not authorize access: ");
        Serial.println(message);
        return false;
    }

    sessionId = returnedSessionId;
    Serial.println("[API] Backend authorized the device session.");
    return true;
}

bool reportDoorEvent(const String &sessionId, const char *event) {
    const bool allowedEvent =
        strcmp(event, "DOOR_OPENED") == 0 ||
        strcmp(event, "ITEM_DETECTED") == 0 ||
        strcmp(event, "DOOR_CLOSED") == 0 ||
        strcmp(event, "DOOR_LOCKED") == 0;
    if (!allowedEvent || sessionId.length() == 0 || sessionId.length() > 128) {
        Serial.println("[API] Invalid device session or door event.");
        return false;
    }

    struct tm timeInfo;
    if (!getLocalTime(&timeInfo, 0) || timeInfo.tm_year + 1900 < 2024) {
        Serial.println("[API] Clock is not synchronized; door event was not sent.");
        return false;
    }

    char occurredAt[25];
    if (strftime(occurredAt, sizeof(occurredAt), "%Y-%m-%dT%H:%M:%SZ", &timeInfo) == 0) {
        Serial.println("[API] Could not format the door-event timestamp.");
        return false;
    }

    StaticJsonDocument<256> request;
    request["sessionId"] = sessionId;
    request["event"] = event;
    request["occurredAt"] = occurredAt;
    String payload;
    serializeJson(request, payload);

    String responseBody;
    const int responseCode = postHubJson(HUB_DOOR_EVENT_ENDPOINT, payload, responseBody);
    if (responseCode != HTTP_CODE_OK) {
        Serial.print("[API] Door event was not accepted. HTTP status: ");
        Serial.println(responseCode);
        return false;
    }

    StaticJsonDocument<512> response;
    const DeserializationError parseError = deserializeJson(response, responseBody);
    if (parseError || response["success"] != true) {
        Serial.println("[API] Backend did not confirm the door event.");
        return false;
    }

    Serial.print("[API] Door event confirmed: ");
    Serial.println(event);
    return true;
}

void initializeAPI() {
    Serial.println("[API] HTTPS client initialized with certificate validation.");
    Serial.print("[API] Backend: ");
    Serial.println(API_BASE_URL);
    Serial.print("[API] Device ID: ");
    Serial.println(DEVICE_ID);

    if (WiFi.status() == WL_CONNECTED) {
        configTime(0, 0, "pool.ntp.org", "time.google.com");
    }
}

#endif
