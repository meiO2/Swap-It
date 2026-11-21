#include <Arduino.h>

SET_LOOP_TASK_STACK_SIZE(16384);

#include "config/config.h"
#include "camera/camera.h"
#include "camera/qr_scanner.h"
#include "wifi/wifi_manager.h"
#include "api/api_client.h"
#include "access/access_control.h"

// ==========================================
// SETUP
// ==========================================


void setup() {
    Serial.begin(115200);
    initializeAccessControl();
    delay(2500);

    Serial.println();
    Serial.println("========== SWAP HUB BOOT ==========");

    Serial.println("[DEBUG 1] Serial initialized.");

    Serial.println("[DEBUG 2] Checking PSRAM...");
    Serial.printf("PSRAM: %s\n", psramFound() ? "YES" : "NO");

    Serial.println("[DEBUG 3] Starting camera...");
    initializeCamera();

    Serial.println("[DEBUG 4] Camera initialization returned.");

    Serial.println("[DEBUG 5] Starting QR scanner...");
    initializeQrScanner();

    Serial.println("[DEBUG 6] QR scanner initialization returned.");

    Serial.println("[DEBUG 7] Starting WiFi...");
    initializeWiFi();

    Serial.println("[DEBUG 8] WiFi initialization returned.");

    if (isWiFiConnected()) {
        startCameraServer();
        Serial.print("[CAMERA SERVER] URL: http://");
        Serial.println(WiFi.localIP());
    }

    Serial.println("[DEBUG 9] Initializing API...");
    initializeAPI();

    Serial.println("[DEBUG 10] Initializing access control...");
#if ENABLE_PHYSICAL_RELAY
    startRemoteUnlockTask();
#else
    startQrScannerTask();
#endif

    Serial.println("\n[SYSTEM] Initialization complete.");
}


// ==========================================
// MAIN LOOP
// ==========================================

void loop() {
    maintainWiFiConnection();

    // Start the preview server if Wi-Fi connects after initial setup.
    if (isWiFiConnected() && !cameraServerStarted && isCameraReady()) {
        startCameraServer();
        Serial.print("[CAMERA SERVER] URL: http://");
        Serial.println(WiFi.localIP());
    }

    handleCameraServer();

    if (Serial.available()) {
        Serial.setTimeout(20);
        String qrCode = Serial.readStringUntil('\n');
        qrCode.trim();

        if (qrCode == "CLOSE") {
            closeAccess();
        } else if (qrCode.length() > 0) {
            Serial.println("[INPUT] Serial token input is disabled; scan a QR with the camera.");
        }
    }

    static unsigned long lastStackCheck = 0;

    if (millis() - lastStackCheck >= 5000) {
        lastStackCheck = millis();

        Serial.printf(
            "[MEMORY] Loop stack remaining: %u bytes\n",
            uxTaskGetStackHighWaterMark(NULL)
        );
        Serial.printf(
            "[MEMORY] Free heap: %u bytes; Free PSRAM: %u bytes\n",
            static_cast<unsigned int>(ESP.getFreeHeap()),
            static_cast<unsigned int>(ESP.getFreePsram())
        );
    }

    delay(20);
}