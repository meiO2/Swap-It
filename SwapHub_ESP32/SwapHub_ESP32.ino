
#include "config/config.h"
#include "camera/camera.h"
#include "wifi/wifi_manager.h"
#include "api/api_client.h"
#include "access/access_control.h"

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n================================");
  Serial.println("       SWAP HUB CONTROLLER");
  Serial.println("================================");

  Serial.println("Firmware: " FIRMWARE_VERSION);

  initializeWiFi();
  initializeCamera();
  initializeAPI();
  initializeAccessControl();

  Serial.println("[SYSTEM] Initialization complete.");
}


void loop() {

  maintainWiFiConnection();

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

