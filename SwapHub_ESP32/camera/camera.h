
#ifndef SWAP_HUB_CAMERA_H
#define SWAP_HUB_CAMERA_H

#include <Arduino.h>
#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>

// HTTP camera server
WebServer cameraServer(80);
bool cameraReady = false;

// ==========================================
// ESP32-S3-N16R8 + OV3660 PIN CONFIGURATION
// ==========================================

#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1

#define XCLK_GPIO_NUM     15
#define SIOD_GPIO_NUM     4
#define SIOC_GPIO_NUM     5

#define Y9_GPIO_NUM       16
#define Y8_GPIO_NUM       17
#define Y7_GPIO_NUM       18
#define Y6_GPIO_NUM       12
#define Y5_GPIO_NUM       10
#define Y4_GPIO_NUM       8
#define Y3_GPIO_NUM       9
#define Y2_GPIO_NUM       11

#define VSYNC_GPIO_NUM    6
#define HREF_GPIO_NUM     7
#define PCLK_GPIO_NUM     13


// ==========================================
// CAMERA INITIALIZATION
// ==========================================

void initializeCamera() {

    Serial.println("\n[CAMERA] Initializing OV3660...");

    camera_config_t config = {};

    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;

    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;

    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;

    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;

    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;

    config.xclk_freq_hz = 20000000;

    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;

    config.fb_count = 1;

    if (psramFound()) {
        Serial.println("[CAMERA] PSRAM detected.");

        config.fb_location = CAMERA_FB_IN_PSRAM;
        config.grab_mode = CAMERA_GRAB_LATEST;

    } else {
        Serial.println("[CAMERA] WARNING: PSRAM not detected.");

        config.fb_location = CAMERA_FB_IN_DRAM;
        config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    }

    // Initialize camera
    esp_err_t err = esp_camera_init(&config);

    if (err != ESP_OK) {

        Serial.printf(
            "[CAMERA] Initialization FAILED! Error: 0x%x\n",
            err
        );

        return;
    }

    Serial.println("[CAMERA] Initialization successful!");
    cameraReady = true;

    // Check detected sensor
    sensor_t *sensor = esp_camera_sensor_get();

    if (sensor != NULL) {

        Serial.printf(
            "[CAMERA] Sensor PID: 0x%04X\n",
            sensor->id.PID
        );

        if (sensor->id.PID == 0x3660) {
            Serial.println("[CAMERA] OV3660 detected!");
        } else {
            Serial.println("[CAMERA] Camera detected, but PID differs.");
        }

    } else {
        Serial.println("[CAMERA] Could not retrieve sensor information.");
        return;
    }

    // Test image capture
    Serial.println("[CAMERA] Testing image capture...");

    camera_fb_t *fb = esp_camera_fb_get();

    if (!fb) {

        Serial.println("[CAMERA] Image capture FAILED!");

        return;
    }

    Serial.println("[CAMERA] Image capture successful!");

    Serial.printf(
        "[CAMERA] Image size: %d x %d\n",
        fb->width,
        fb->height
    );

    Serial.printf(
        "[CAMERA] Image bytes: %u\n",
        (unsigned int)fb->len
    );

    esp_camera_fb_return(fb);

    Serial.println("[CAMERA] Camera is ready!");
}


// ==========================================
// CAMERA WEB SERVER
// ==========================================

void startCameraServer() {

    if (!cameraReady) {
        Serial.println("[CAMERA SERVER] Camera is not ready!");
        return;
    }

    // Homepage: Camera viewer
    cameraServer.on("/", HTTP_GET, []() {

        String html = R"rawliteral(
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Swap Hub Camera</title>

            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: #101827;
                    color: white;
                    text-align: center;
                    padding: 20px;
                }

                h1 {
                    color: #4ade80;
                }

                img {
                    width: 100%;
                    max-width: 640px;
                    border-radius: 12px;
                    border: 3px solid #4ade80;
                }

                .status {
                    color: #4ade80;
                    margin-top: 15px;
                }
            </style>
        </head>

        <body>

            <h1>Swap Hub Camera</h1>

            <p>ESP32-S3 + OV3660</p>

            <img id="camera" src="/capture">

            <p class="status" id="status">
                Connecting to camera...
            </p>

            <script>
                const camera = document.getElementById("camera");
                const statusText = document.getElementById("status");

                function refreshCamera() {
                    camera.src = "/capture?t=" + Date.now();
                }

                camera.onload = function() {
                    statusText.innerText = "Camera is live";
                };

                camera.onerror = function() {
                    statusText.innerText = "Camera connection failed";
                };

                setInterval(refreshCamera, 500);
            </script>

        </body>
        </html>
        )rawliteral";

        cameraServer.send(200, "text/html", html);
    });


    // JPEG image endpoint
    cameraServer.on("/capture", HTTP_GET, []() {

        if (!cameraReady) {
            cameraServer.send(
                503,
                "text/plain",
                "Camera is not ready"
            );
            return;
        }

        camera_fb_t *fb = esp_camera_fb_get();

        if (!fb) {
            cameraServer.send(
                500,
                "text/plain",
                "Image capture failed"
            );
            return;
        }

        cameraServer.sendHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate"
        );

        cameraServer.setContentLength(fb->len);

        cameraServer.send(
            200,
            "image/jpeg",
            ""
        );

        cameraServer.client().write(fb->buf, fb->len);

        esp_camera_fb_return(fb);
    });


    // Start HTTP server
    cameraServer.begin();

    Serial.println("[CAMERA SERVER] HTTP server started!");
    Serial.println("[CAMERA SERVER] Port: 80");
}


// ==========================================
// HANDLE CAMERA SERVER REQUESTS
// ==========================================

void handleCameraServer() {
    cameraServer.handleClient();
}


#endif
