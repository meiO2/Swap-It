    #ifndef SWAP_HUB_ACCESS_CONTROL_H
    #define SWAP_HUB_ACCESS_CONTROL_H

    #include "../api/api_client.h"

    // Simulated access status
    bool doorUnlocked = false;
    String usedQrCode = "";

    void initializeAccessControl() {
    Serial.println("[ACCESS] Access control initialized.");
    Serial.println("[ACCESS] Physical lock is not connected.");
    }

    // Process QR authorization
    void processAccessRequest(String qrCode) {

    Serial.println("[ACCESS] Processing access request...");

    bool authorized = verifyQRCode(qrCode);

    if (authorized) {
        Serial.println("[ACCESS] ACCESS GRANTED.");

        doorUnlocked = true;

        // Physical unlock command will be implemented later.
        Serial.println("[ACCESS] Simulated door unlock.");
    } 
    else {
        Serial.println("[ACCESS] ACCESS DENIED.");

        doorUnlocked = false;
    }
    }


    void processSimulatedAccessRequest(String qrCode) {

        Serial.println("\n[SIMULATION] QR Code detected: " + qrCode);

        // Prevent another access request while unlocked
        if (doorUnlocked) {
            Serial.println("[ACCESS] Access session already active.");
            Serial.println("[ACCESS] Duplicate request rejected.");
            return;
        }

        if (qrCode == usedQrCode) {
            Serial.println("[ACCESS] QR code already used.");
            Serial.println("[ACCESS] Request rejected.");
            return;
        }

        // Temporary mock authorization
        if (qrCode == "VALID-DEMO-QR") {

            Serial.println("[ACCESS] ACCESS GRANTED.");

            doorUnlocked = true;
            usedQrCode = qrCode;

            Serial.println("[ACCESS] Simulated door unlock.");

        } else {

            Serial.println("[ACCESS] ACCESS DENIED.");

            doorUnlocked = false;

            Serial.println("[ACCESS] Door remains locked.");
        }
    }


    void closeAccess() {
    doorUnlocked = false;

    // Physical lock command will be implemented later.
    Serial.println("[ACCESS] Simulated door locked.");
    }

    bool isDoorUnlocked() {
    return doorUnlocked;
    }

    #endif
