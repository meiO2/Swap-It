#ifndef SWAP_HUB_WIFI_MANAGER_H
#define SWAP_HUB_WIFI_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include "../config/config.h"

// =====================================================
// WIFI CONFIGURATION
// =====================================================

static const unsigned long WIFI_RETRY_INTERVAL_MS = 10000UL;
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000UL;
static const unsigned long WIFI_DISCONNECT_SETTLE_MS = 2000UL;

// =====================================================
// WIFI STATE
//
// Wi-Fi event callbacks may execute outside loopTask, so
// state shared with loop() is declared volatile.
// =====================================================

static volatile bool wifiHasIP = false;
static volatile bool wifiAttemptActive = false;
static volatile bool wifiDisconnectRequested = false;
static volatile bool wifiRetryScheduled = false;
static volatile bool wifiInitialized = false;

static volatile unsigned long wifiAttemptStartedAt = 0;
static volatile unsigned long wifiNextRetryAt = 0;
static volatile unsigned long wifiDisconnectRequestedAt = 0;

static WiFiEventId_t wifiEventConnected;
static WiFiEventId_t wifiEventDisconnected;
static WiFiEventId_t wifiEventGotIP;

// =====================================================
// WIFI EVENT HANDLERS
// =====================================================

// Association with the access point is NOT the same as
// obtaining an IP address. Keep the attempt active here.
inline void onWiFiConnected(WiFiEvent_t event, WiFiEventInfo_t info) {
    (void)event;
    (void)info;
    Serial.println("[WIFI] Associated with access point; waiting for DHCP/IP...");
}

// This is the only event that marks Wi-Fi as usable.
inline void onWiFiGotIP(WiFiEvent_t event, WiFiEventInfo_t info) {
    (void)event;
    (void)info;

    wifiHasIP = true;
    wifiAttemptActive = false;
    wifiDisconnectRequested = false;
    wifiRetryScheduled = false;

    Serial.println("[WIFI] IP address acquired.");
    Serial.print("[WIFI] IP address: ");
    Serial.println(WiFi.localIP());
}

inline void onWiFiDisconnected(WiFiEvent_t event, WiFiEventInfo_t info) {
    (void)event;

    const bool wasUsable = wifiHasIP;

    wifiHasIP = false;
    wifiAttemptActive = false;
    wifiDisconnectRequested = false;
    wifiRetryScheduled = true;
    wifiNextRetryAt = millis() + WIFI_RETRY_INTERVAL_MS;

    Serial.print("[WIFI] Disconnected. Reason code: ");
    Serial.println(info.wifi_sta_disconnected.reason);

    if (wasUsable) {
        Serial.println("[WIFI] Lost network connection; retry scheduled.");
    } else {
        Serial.println("[WIFI] Connection attempt ended; retry scheduled.");
    }
}

// =====================================================
// WIFI STATUS
// =====================================================

inline bool isWiFiConnected() {
    // Require both the GOT_IP event and the driver's status.
    return wifiHasIP && WiFi.status() == WL_CONNECTED;
}

// =====================================================
// START A SINGLE CONNECTION ATTEMPT
// =====================================================

inline void beginWiFiConnection() {
    if (!wifiInitialized || wifiAttemptActive || wifiDisconnectRequested || isWiFiConnected()) {
        return;
    }

    Serial.println("[WIFI] Starting connection attempt...");

    // Set state before WiFi.begin(), because events may arrive quickly.
    wifiAttemptActive = true;
    wifiAttemptStartedAt = millis();
    wifiRetryScheduled = false;

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// =====================================================
// INITIALIZE WIFI
// =====================================================

inline void initializeWiFi() {
    if (wifiInitialized) {
        return;
    }

    Serial.println("\n[WIFI] Initializing Wi-Fi...");

    wifiHasIP = false;
    wifiAttemptActive = false;
    wifiDisconnectRequested = false;
    wifiRetryScheduled = false;
    wifiNextRetryAt = 0;

    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);  // This manager owns retry behavior.
    WiFi.persistent(false);

    // Register handlers before starting the connection.
    // Subscribe each callback only to its matching event.
    // Without the event filter, Arduino-ESP32 invokes each
    // callback for every Wi-Fi event, producing misleading logs
    // and corrupting the connection state machine.
    wifiEventConnected = WiFi.onEvent(
        onWiFiConnected,
        ARDUINO_EVENT_WIFI_STA_CONNECTED
    );

    wifiEventGotIP = WiFi.onEvent(
        onWiFiGotIP,
        ARDUINO_EVENT_WIFI_STA_GOT_IP
    );

    wifiEventDisconnected = WiFi.onEvent(
        onWiFiDisconnected,
        ARDUINO_EVENT_WIFI_STA_DISCONNECTED
    );

    wifiInitialized = true;
    beginWiFiConnection();

    // Wait up to 15 seconds for an actual IP address.
    const unsigned long waitStartedAt = millis();
    while (!isWiFiConnected() && millis() - waitStartedAt < 15000UL) {
        delay(100);
    }

    if (isWiFiConnected()) {
        Serial.println("[WIFI] Initial connection successful.");
        Serial.print("[WIFI] IP address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("[WIFI] No IP address yet; background retry remains enabled.");
    }
}

// =====================================================
// MAINTAIN WIFI CONNECTION
// =====================================================

inline void maintainWiFiConnection() {
    if (!wifiInitialized) {
        return;
    }

    const unsigned long now = millis();

    if (isWiFiConnected()) {
        return;
    }

    // Do not start another begin() while association/DHCP is
    // still in progress.
    if (wifiAttemptActive) {
        if (now - wifiAttemptStartedAt >= WIFI_CONNECT_TIMEOUT_MS) {
            Serial.println("[WIFI] Connection attempt timed out; disconnecting before retry.");
            wifiDisconnectRequested = true;
            wifiDisconnectRequestedAt = now;
            WiFi.disconnect(false, false);
        }
        return;
    }

    // Wait for the disconnect operation to settle before retrying.
    if (wifiDisconnectRequested) {
        if (now - wifiDisconnectRequestedAt < WIFI_DISCONNECT_SETTLE_MS) {
            return;
        }

        // Fallback in case the driver did not deliver a disconnect event.
        wifiDisconnectRequested = false;
        wifiRetryScheduled = true;
        wifiNextRetryAt = now + WIFI_RETRY_INTERVAL_MS;
    }

    if (wifiRetryScheduled) {
        if (static_cast<long>(now - wifiNextRetryAt) < 0) {
            return;
        }
        wifiRetryScheduled = false;
    }

    beginWiFiConnection();
}

// =====================================================
// CLEANUP (OPTIONAL)
// =====================================================

inline void stopWiFiManager() {
    if (!wifiInitialized) {
        return;
    }

    WiFi.removeEvent(wifiEventConnected);
    WiFi.removeEvent(wifiEventGotIP);
    WiFi.removeEvent(wifiEventDisconnected);

    wifiHasIP = false;
    wifiAttemptActive = false;
    wifiDisconnectRequested = false;
    wifiRetryScheduled = false;
    wifiInitialized = false;

    WiFi.disconnect(false, false);
    Serial.println("[WIFI] Wi-Fi manager stopped.");
}

#endif
