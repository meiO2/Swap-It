#ifndef SWAP_HUB_QR_SCANNER_H
#define SWAP_HUB_QR_SCANNER_H

#include <Arduino.h>
#include <esp_camera.h>
#include <img_converters.h>
#include <quirc/quirc.h>
#include <string.h>

struct quirc *qrRecognizer = nullptr;
struct quirc_code *qrCodeBuffer = nullptr;
struct quirc_data *qrDataBuffer = nullptr;
uint8_t *qrRgbBuffer = nullptr;
size_t qrRgbBufferSize = 0;
size_t qrFrameWidth = 0;
size_t qrFrameHeight = 0;
bool qrScannerReady = false;
unsigned long lastQrFrameWarningAt = 0;

void initializeQrScanner() {
    if (!cameraReady || !psramFound()) {
        Serial.println("[QR] Scanner requires an initialized camera and PSRAM.");
        return;
    }

    qrRecognizer = quirc_new();
    qrCodeBuffer = static_cast<struct quirc_code *>(ps_malloc(sizeof(struct quirc_code)));
    qrDataBuffer = static_cast<struct quirc_data *>(ps_malloc(sizeof(struct quirc_data)));

    if (!qrRecognizer || !qrCodeBuffer || !qrDataBuffer) {
        Serial.println("[QR] Could not allocate the decoder in PSRAM.");
        if (qrRecognizer) quirc_destroy(qrRecognizer);
        if (qrCodeBuffer) free(qrCodeBuffer);
        if (qrDataBuffer) free(qrDataBuffer);
        qrRecognizer = nullptr;
        qrCodeBuffer = nullptr;
        qrDataBuffer = nullptr;
        return;
    }

    qrScannerReady = true;
    Serial.println("[QR] JPEG-to-RGB-to-grayscale QR decoder initialized.");
}

bool isBase64UrlToken(const uint8_t *payload, int length) {
    if (length != 43) return false;
    for (int index = 0; index < length; index++) {
        const uint8_t character = payload[index];
        const bool isAlphaNumeric =
            (character >= 'A' && character <= 'Z') ||
            (character >= 'a' && character <= 'z') ||
            (character >= '0' && character <= '9');
        if (!isAlphaNumeric && character != '-' && character != '_') return false;
    }
    return true;
}

bool readQRCodeFrame(String &token) {
    if (!qrScannerReady || !cameraReady) return false;

    camera_fb_t *frame = esp_camera_fb_get();
    if (!frame) {
        if (millis() - lastQrFrameWarningAt > 3000) {
            Serial.println("[QR] Camera frame capture failed.");
            lastQrFrameWarningAt = millis();
        }
        return false;
    }

    const size_t width = frame->width;
    const size_t height = frame->height;
    const size_t pixelCount = width * height;
    const size_t requiredRgbBytes = pixelCount * 3;

    if (frame->format != PIXFORMAT_JPEG) {
        esp_camera_fb_return(frame);
        Serial.println("[QR] Expected a JPEG camera frame.");
        return false;
    }

    if (requiredRgbBytes > qrRgbBufferSize) {
        uint8_t *newBuffer = static_cast<uint8_t *>(ps_malloc(requiredRgbBytes));
        if (!newBuffer) {
            esp_camera_fb_return(frame);
            Serial.println("[QR] Could not allocate the JPEG conversion buffer.");
            return false;
        }
        free(qrRgbBuffer);
        qrRgbBuffer = newBuffer;
        qrRgbBufferSize = requiredRgbBytes;
    }

    if (width != qrFrameWidth || height != qrFrameHeight) {
        if (quirc_resize(qrRecognizer, width, height) < 0) {
            esp_camera_fb_return(frame);
            qrScannerReady = false;
            Serial.println("[QR] Could not allocate the grayscale decoder buffer.");
            return false;
        }
        qrFrameWidth = width;
        qrFrameHeight = height;
    }

    if (!fmt2rgb888(frame->buf, frame->len, frame->format, qrRgbBuffer)) {
        esp_camera_fb_return(frame);
        Serial.println("[QR] JPEG-to-RGB conversion failed.");
        return false;
    }

    int decoderWidth = 0;
    int decoderHeight = 0;
    uint8_t *grayscale = quirc_begin(qrRecognizer, &decoderWidth, &decoderHeight);
    if (!grayscale || decoderWidth != width || decoderHeight != height) {
        esp_camera_fb_return(frame);
        Serial.println("[QR] Decoder frame buffer is unavailable.");
        return false;
    }

    for (size_t pixel = 0; pixel < pixelCount; pixel++) {
        const size_t rgbIndex = pixel * 3;
        const uint32_t red = qrRgbBuffer[rgbIndex];
        const uint32_t green = qrRgbBuffer[rgbIndex + 1];
        const uint32_t blue = qrRgbBuffer[rgbIndex + 2];
        grayscale[pixel] = static_cast<uint8_t>((77 * red + 150 * green + 29 * blue) >> 8);
    }
    esp_camera_fb_return(frame);
    quirc_end(qrRecognizer);

    const int codeCount = quirc_count(qrRecognizer);
    if (codeCount == 0) return false;

    for (int index = 0; index < codeCount; index++) {
        quirc_extract(qrRecognizer, index, qrCodeBuffer);
        const quirc_decode_error_t decodeError = quirc_decode(qrCodeBuffer, qrDataBuffer);
        if (decodeError != QUIRC_SUCCESS) {
            if (millis() - lastQrFrameWarningAt > 3000) {
                Serial.print("[QR] Detected code could not be decoded: ");
                Serial.println(quirc_strerror(decodeError));
                lastQrFrameWarningAt = millis();
            }
            continue;
        }

        if (!isBase64UrlToken(qrDataBuffer->payload, qrDataBuffer->payload_len)) {
            Serial.println("[QR] Decoded QR is not a SwapIt access token.");
            continue;
        }

        token = "";
        token.reserve(qrDataBuffer->payload_len);
        for (int payloadIndex = 0; payloadIndex < qrDataBuffer->payload_len; payloadIndex++) {
            token += static_cast<char>(qrDataBuffer->payload[payloadIndex]);
        }
        Serial.println("[QR] SwapIt access token decoded.");
        return true;
    }

    return false;
}

#endif
