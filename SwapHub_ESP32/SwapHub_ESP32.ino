
#include "config/config.h"
#include "camera/camera.h"
#include "wifi/wifi_manager.h"
#include "api/api_client.h"
#include "access/access_control.h"

// ==========================================
// SETUP
// ==========================================

void setup() {
    Serial.begin(115200);
    delay(1500);

    // MEMORY DIAGNOSTICS
    Serial.println("\n========== MEMORY TEST ==========");

    if (psramFound()) {
        Serial.println("[MEMORY] PSRAM detected!");

        Serial.printf(
            "[MEMORY] PSRAM Size: %u bytes\n",
            ESP.getPsramSize()
        );

        Serial.printf(
            "[MEMORY] Free PSRAM: %u bytes\n",
            ESP.getFreePsram()
        );

    } else {
        Serial.println("[MEMORY] PSRAM NOT DETECTED!");
    }

    Serial.printf(
        "[MEMORY] Heap Size: %u bytes\n",
        ESP.getHeapSize()
    );

    Serial.println("=================================");

    // SYSTEM INITIALIZATION
    Serial.println("\n================================");
    Serial.println("       SWAP HUB CONTROLLER");
    Serial.println("================================");

    Serial.println("Firmware: " FIRMWARE_VERSION);

    // CAMERA FIRST
    Serial.println("\n[SYSTEM] Starting camera...");
    initializeCamera();

    // WIFI
    Serial.println("\n[SYSTEM] Starting WiFi...");
    initializeWiFi();

    // Start camera web server AFTER Wi-Fi connects
    if (WiFi.status() == WL_CONNECTED) {

        startCameraServer();

        Serial.print("[CAMERA SERVER] Open this URL: http://");
        Serial.println(WiFi.localIP());

    } else {
        Serial.println("[CAMERA SERVER] Waiting for Wi-Fi connection.");
    }

    // API
    initializeAPI();

    // ACCESS CONTROL
    initializeAccessControl();

    Serial.println("\n[SYSTEM] Initialization complete.");
}

// ==========================================
// MAIN LOOP
// ==========================================

void loop() {
    maintainWiFiConnection();

    handleCameraServer();

    if (Serial.available()) {
        String qrCode = Serial.readStringUntil('\n');
        qrCode.trim();

        if (qrCode.length() > 0) {
            if (qrCode == "CLOSE") {
                closeAccess();
            } else {
                processSimulatedAccessRequest(qrCode);
            }
        }
    }

    delay(100);
}
