
    #ifndef SWAP_HUB_API_CLIENT_H
    #define SWAP_HUB_API_CLIENT_H

    #include <WiFi.h>
    #include <HTTPClient.h>
    #include "../config/config.h"

    bool verifyQRCode(String qrCode) {

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[API] Wi-Fi is not connected.");
        return false;
    }

    HTTPClient http;

    String endpoint = String(API_BASE_URL) + "/api/swaphub/verify";

    http.begin(endpoint);
    http.addHeader("Content-Type", "application/json");

    String payload = "{\"qrCode\":\"" + qrCode + "\"}";

    Serial.println("[API] Sending QR verification request...");

    int httpResponseCode = http.POST(payload);

    bool authorized = false;

    if (httpResponseCode > 0) {
        String response = http.getString();

        Serial.print("[API] Response: ");
        Serial.println(response);

        authorized = response.indexOf("\"authorized\":true") >= 0;
    } else {
        Serial.print("[API] Request failed: ");
        Serial.println(http.errorToString(httpResponseCode));
    }

    http.end();

    return authorized;
    }

    void initializeAPI() {
    Serial.println("[API] API client initialized.");
    }

    #endif
