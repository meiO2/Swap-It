#ifndef SWAP_HUB_CAMERA_H
#define SWAP_HUB_CAMERA_H

#include <Arduino.h>
#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>

static WebServer cameraServer(80);
static bool cameraReady = false;
static bool cameraServerStarted = false;
static portMUX_TYPE cameraStateMux = portMUX_INITIALIZER_UNLOCKED;
static SemaphoreHandle_t cameraFrameMutex = nullptr;

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

inline bool isCameraReady() {
    portENTER_CRITICAL(&cameraStateMux);
    const bool ready = cameraReady;
    portEXIT_CRITICAL(&cameraStateMux);
    return ready;
}

inline bool acquireCameraFrameMutex(TickType_t timeoutTicks = pdMS_TO_TICKS(100)) {
    return cameraFrameMutex &&
           xSemaphoreTake(cameraFrameMutex, timeoutTicks) == pdTRUE;
}

inline void releaseCameraFrameMutex() {
    if (cameraFrameMutex) {
        xSemaphoreGive(cameraFrameMutex);
    }
}

inline void initializeCamera() {
    Serial.println("\n[CAMERA] Initializing OV3660...");

    if (!cameraFrameMutex) {
        cameraFrameMutex = xSemaphoreCreateMutex();
        if (!cameraFrameMutex) {
            Serial.println("[CAMERA] Could not create camera synchronization mutex.");
            return;
        }
    }

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

    const esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAMERA] Initialization FAILED! Error: 0x%x\n", err);
        portENTER_CRITICAL(&cameraStateMux);
        cameraReady = false;
        portEXIT_CRITICAL(&cameraStateMux);
        return;
    }

    sensor_t *sensor = esp_camera_sensor_get();
    if (!sensor) {
        Serial.println("[CAMERA] Could not retrieve sensor information.");
        portENTER_CRITICAL(&cameraStateMux);
        cameraReady = false;
        portEXIT_CRITICAL(&cameraStateMux);
        return;
    }

    Serial.println("[CAMERA] Initialization successful!");
    Serial.printf("[CAMERA] Sensor PID: 0x%04X\n", sensor->id.PID);
    if (sensor->id.PID == 0x3660) {
        Serial.println("[CAMERA] OV3660 detected!");
    } else {
        Serial.println("[CAMERA] Camera detected, but PID differs.");
    }

    Serial.println("[CAMERA] Testing image capture...");
    camera_fb_t *fb = nullptr;
    if (!acquireCameraFrameMutex(pdMS_TO_TICKS(250))) {
        Serial.println("[CAMERA] Could not synchronize test capture.");
        portENTER_CRITICAL(&cameraStateMux);
        cameraReady = false;
        portEXIT_CRITICAL(&cameraStateMux);
        return;
    }

    fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[CAMERA] Image capture FAILED!");
        releaseCameraFrameMutex();
        portENTER_CRITICAL(&cameraStateMux);
        cameraReady = false;
        portEXIT_CRITICAL(&cameraStateMux);
        return;
    }

    Serial.println("[CAMERA] Image capture successful!");
    Serial.printf("[CAMERA] Image size: %d x %d\n", fb->width, fb->height);
    Serial.printf("[CAMERA] Image bytes: %u\n", static_cast<unsigned int>(fb->len));
    esp_camera_fb_return(fb);
    releaseCameraFrameMutex();

    portENTER_CRITICAL(&cameraStateMux);
    cameraReady = true;
    portEXIT_CRITICAL(&cameraStateMux);
    Serial.println("[CAMERA] Camera is ready!");
}

inline void startCameraServer() {
    if (cameraServerStarted) return;
    if (!isCameraReady()) {
        Serial.println("[CAMERA SERVER] Camera is not ready!");
        return;
    }

    cameraServer.on("/", HTTP_GET, []() {
        const char *html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Swap Hub Camera</title>
<style>
body{font-family:Arial,sans-serif;background:#101827;color:white;text-align:center;padding:20px}
h1{color:#4ade80}img{width:100%;max-width:640px;border-radius:12px;border:3px solid #4ade80}
.status{color:#4ade80;margin-top:15px}
</style>
</head>
<body>
<h1>Swap Hub Camera</h1>
<p>ESP32-S3 + OV3660</p>
<img id="camera" src="/capture">
<p class="status" id="status">Connecting to camera...</p>
<script>
const camera=document.getElementById("camera");
const statusText=document.getElementById("status");
setInterval(function(){camera.src="/capture?t="+Date.now()},500);
camera.onload=function(){statusText.innerText="Camera is live"};
camera.onerror=function(){statusText.innerText="Camera connection failed"};
</script>
</body>
</html>
)rawliteral";
        cameraServer.send(200, "text/html", html);
    });

    cameraServer.on("/capture", HTTP_GET, []() {
        if (!isCameraReady()) {
            cameraServer.send(503, "text/plain", "Camera is not ready");
            return;
        }
        if (!acquireCameraFrameMutex(pdMS_TO_TICKS(250))) {
            cameraServer.send(503, "text/plain", "Camera busy");
            return;
        }

        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            releaseCameraFrameMutex();
            cameraServer.send(500, "text/plain", "Image capture failed");
            return;
        }

        cameraServer.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        cameraServer.setContentLength(fb->len);
        cameraServer.send(200, "image/jpeg", "");
        cameraServer.client().write(fb->buf, fb->len);
        esp_camera_fb_return(fb);
        releaseCameraFrameMutex();
    });

    cameraServer.begin();
    cameraServerStarted = true;
    Serial.println("[CAMERA SERVER] HTTP server started!");
    Serial.println("[CAMERA SERVER] Port: 80");
}

inline void handleCameraServer() {
    cameraServer.handleClient();
}

#endif
