#ifndef SWAP_HUB_QR_SCANNER_H
#define SWAP_HUB_QR_SCANNER_H

#include <Arduino.h>
#include <esp_camera.h>
#include <img_converters.h>
#include "../src/quirc/quirc.h"
#include <esp_heap_caps.h>
#include <string.h>

#define QR_TOKEN_LENGTH       43
#define QR_SCAN_INTERVAL_MS   150

static struct quirc *qrRecognizer = nullptr;
static struct quirc_code *qrCodeBuffer = nullptr;
static struct quirc_data *qrDataBuffer = nullptr;
static uint8_t *qrRgbBuffer = nullptr;
static size_t qrRgbBufferSize = 0;
static const size_t QR_FRAME_WIDTH = 320;
static const size_t QR_FRAME_HEIGHT = 240;
static bool qrScannerReady = false;
static unsigned long lastQrFrameWarningAt = 0;
static unsigned long lastQrScanAt = 0;
static TaskHandle_t qrScannerTaskHandle = nullptr;

bool isWiFiConnected();
bool isDoorUnlocked();
bool isAccessRequestInFlight();
void processAccessRequest(const String &qrCode);

inline void logQrWarning(const char *message) {
    const unsigned long now = millis();
    if (now - lastQrFrameWarningAt >= 3000) {
        Serial.println(message);
        lastQrFrameWarningAt = now;
    }
}

inline void initializeQrScanner() {
    Serial.println("[QR] Initializing QR scanner...");
    qrScannerReady = false;

    if (!isCameraReady()) {
        Serial.println("[QR] Camera is not initialized.");
        return;
    }
    if (!psramFound()) {
        Serial.println("[QR] PSRAM is required.");
        return;
    }

    qrRecognizer = quirc_new();
    if (!qrRecognizer) {
        Serial.println("[QR] Failed to create decoder.");
        return;
    }

    qrCodeBuffer = static_cast<struct quirc_code *>(
        ps_malloc(sizeof(struct quirc_code)));
    qrDataBuffer = static_cast<struct quirc_data *>(
        ps_malloc(sizeof(struct quirc_data)));

    if (!qrCodeBuffer || !qrDataBuffer) {
        Serial.println("[QR] PSRAM allocation failed.");
        if (qrCodeBuffer) free(qrCodeBuffer);
        if (qrDataBuffer) free(qrDataBuffer);
        qrCodeBuffer = nullptr;
        qrDataBuffer = nullptr;
        quirc_destroy(qrRecognizer);
        qrRecognizer = nullptr;
        return;
    }

    if (quirc_resize(qrRecognizer, static_cast<int>(QR_FRAME_WIDTH),
                     static_cast<int>(QR_FRAME_HEIGHT)) < 0) {
        Serial.println("[QR] Decoder resize failed.");
        free(qrCodeBuffer);
        free(qrDataBuffer);
        qrCodeBuffer = nullptr;
        qrDataBuffer = nullptr;
        quirc_destroy(qrRecognizer);
        qrRecognizer = nullptr;
        return;
    }

    qrRgbBufferSize = QR_FRAME_WIDTH * QR_FRAME_HEIGHT * 3;
    qrRgbBuffer = static_cast<uint8_t *>(ps_malloc(qrRgbBufferSize));
    if (!qrRgbBuffer) {
        Serial.println("[QR] RGB buffer allocation failed.");
        free(qrCodeBuffer);
        free(qrDataBuffer);
        qrCodeBuffer = nullptr;
        qrDataBuffer = nullptr;
        quirc_destroy(qrRecognizer);
        qrRecognizer = nullptr;
        qrRgbBufferSize = 0;
        return;
    }

    qrScannerReady = true;
    Serial.println("[QR] Scanner initialized successfully.");
    Serial.printf("[QR] Resolution: %u x %u\n",
                  static_cast<unsigned int>(QR_FRAME_WIDTH),
                  static_cast<unsigned int>(QR_FRAME_HEIGHT));
    Serial.printf("[QR] Free PSRAM: %u bytes\n",
                  static_cast<unsigned int>(ESP.getFreePsram()));
}

inline bool isBase64UrlToken(const uint8_t *payload, int length) {
    if (!payload || length != QR_TOKEN_LENGTH) return false;
    for (int i = 0; i < length; ++i) {
        const uint8_t c = payload[i];
        const bool alphanumeric =
            (c >= 'A' && c <= 'Z') ||
            (c >= 'a' && c <= 'z') ||
            (c >= '0' && c <= '9');
        if (!alphanumeric && c != '-' && c != '_') return false;
    }
    return true;
}

inline bool readQRCodeFrame(String &token) {
    if (!qrScannerReady || !qrRecognizer || !isCameraReady()) return false;

    const unsigned long now = millis();
    if (now - lastQrScanAt < QR_SCAN_INTERVAL_MS) return false;
    lastQrScanAt = now;

    if (!acquireCameraFrameMutex(pdMS_TO_TICKS(150))) {
        logQrWarning("[QR] Camera busy.");
        return false;
    }

    camera_fb_t *frame = esp_camera_fb_get();
    if (!frame) {
        releaseCameraFrameMutex();
        logQrWarning("[QR] Camera frame capture failed.");
        return false;
    }

    if (frame->format != PIXFORMAT_JPEG ||
        frame->width != QR_FRAME_WIDTH ||
        frame->height != QR_FRAME_HEIGHT) {
        esp_camera_fb_return(frame);
        releaseCameraFrameMutex();
        logQrWarning("[QR] Unexpected camera frame format or dimensions.");
        return false;
    }

    const bool converted = fmt2rgb888(
        frame->buf, frame->len, frame->format, qrRgbBuffer);
    esp_camera_fb_return(frame);
    releaseCameraFrameMutex();

    if (!converted) {
        logQrWarning("[QR] JPEG-to-RGB conversion failed.");
        return false;
    }

    int decoderWidth = 0;
    int decoderHeight = 0;
    uint8_t *grayscale = quirc_begin(
        qrRecognizer, &decoderWidth, &decoderHeight);
    if (!grayscale) {
        logQrWarning("[QR] Decoder buffer unavailable.");
        return false;
    }
    if (decoderWidth != static_cast<int>(QR_FRAME_WIDTH) ||
        decoderHeight != static_cast<int>(QR_FRAME_HEIGHT)) {
        quirc_end(qrRecognizer);
        logQrWarning("[QR] Decoder dimensions mismatch.");
        return false;
    }

    const size_t pixelCount = QR_FRAME_WIDTH * QR_FRAME_HEIGHT;
    for (size_t pixel = 0; pixel < pixelCount; ++pixel) {
        const size_t rgbIndex = pixel * 3;
        grayscale[pixel] = static_cast<uint8_t>(
            (77 * qrRgbBuffer[rgbIndex] +
             150 * qrRgbBuffer[rgbIndex + 1] +
             29 * qrRgbBuffer[rgbIndex + 2]) >> 8);
    }

    quirc_end(qrRecognizer);
    const int codeCount = quirc_count(qrRecognizer);
    for (int i = 0; i < codeCount; ++i) {
        quirc_extract(qrRecognizer, i, qrCodeBuffer);
        if (quirc_decode(qrCodeBuffer, qrDataBuffer) != QUIRC_SUCCESS) continue;
        if (!isBase64UrlToken(qrDataBuffer->payload,
                              qrDataBuffer->payload_len)) continue;

        token = "";
        token.reserve(qrDataBuffer->payload_len);
        for (int j = 0; j < qrDataBuffer->payload_len; ++j) {
            token += static_cast<char>(qrDataBuffer->payload[j]);
        }
        Serial.println("[QR] SwapIt access token decoded.");
        return true;
    }
    return false;
}

inline void qrScannerTask(void *parameter) {
    (void)parameter;
    for (;;) {
        if (isWiFiConnected() &&
            !isDoorUnlocked() &&
            !isAccessRequestInFlight()) {
            String qrToken;
            if (readQRCodeFrame(qrToken)) {
                processAccessRequest(qrToken);
            }
        }

        static unsigned long lastQrMemoryCheck = 0;
        if (millis() - lastQrMemoryCheck >= 10000) {
            lastQrMemoryCheck = millis();
            Serial.printf("[MEMORY] QR task stack remaining: %u bytes\n",
                          static_cast<unsigned int>(
                              uxTaskGetStackHighWaterMark(NULL)));
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

inline void startQrScannerTask() {
    if (!qrScannerReady) {
        Serial.println("[QR] Scanner task not started because initialization failed.");
        return;
    }
    if (qrScannerTaskHandle) return;

    const BaseType_t created = xTaskCreatePinnedToCore(
        qrScannerTask, "hubQrScanner", 16384, nullptr, 1,
        &qrScannerTaskHandle, 1);
    if (created != pdPASS) {
        qrScannerTaskHandle = nullptr;
        Serial.println("[QR] Could not create dedicated scanner task.");
    } else {
        Serial.println("[QR] Dedicated scanner task started.");
    }
}

inline void cleanupQrScanner() {
    Serial.println("[QR] Cleaning up scanner...");
    qrScannerReady = false;
    if (qrScannerTaskHandle) {
        vTaskDelete(qrScannerTaskHandle);
        qrScannerTaskHandle = nullptr;
    }
    if (qrRecognizer) quirc_destroy(qrRecognizer);
    if (qrCodeBuffer) free(qrCodeBuffer);
    if (qrDataBuffer) free(qrDataBuffer);
    if (qrRgbBuffer) free(qrRgbBuffer);
    qrRecognizer = nullptr;
    qrCodeBuffer = nullptr;
    qrDataBuffer = nullptr;
    qrRgbBuffer = nullptr;
    qrRgbBufferSize = 0;
    Serial.println("[QR] Cleanup complete.");
}

#endif
