
    #ifndef SWAP_HUB_WIFI_MANAGER_H
    #define SWAP_HUB_WIFI_MANAGER_H

    #include <WiFi.h>
    #include "../config/config.h"

    void initializeWiFi() {
    Serial.println("\n[WIFI] Initializing Wi-Fi...");

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("[WIFI] Connecting");

    unsigned long startAttempt = millis();

    while (WiFi.status() != WL_CONNECTED &&
            millis() - startAttempt < 15000) {
        Serial.print(".");
        delay(500);
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WIFI] Connected!");
        Serial.print("[WIFI] IP Address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("\n[WIFI] Connection failed.");
        Serial.println("[WIFI] Will retry later.");
    }
    }

    void maintainWiFiConnection() {
    if (WiFi.status() != WL_CONNECTED) {
        static unsigned long lastReconnectAttempt = 0;
        if (millis() - lastReconnectAttempt >= 5000) {
            Serial.println("[WIFI] Connection lost. Reconnecting...");
            WiFi.reconnect();
            lastReconnectAttempt = millis();
        }
    }
    }

    bool isWiFiConnected() {
    return WiFi.status() == WL_CONNECTED;
    }

    #endif
