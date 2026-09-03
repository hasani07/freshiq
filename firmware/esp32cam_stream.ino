/*
  FreshIQ — Firmware ESP32-CAM (streaming video)
  ------------------------------------------------------------
  Board ini TERPISAH dari ESP32 sensor+kipas. Tugasnya cuma satu:
  menyediakan stream video MJPEG yang dibuka dashboard di panel "Kamera box".

  PENTING — pilih board yang benar di Arduino IDE:
  Tools > Board > "AI Thinker ESP32-CAM" (atau sesuai varian ESP32-CAM kamu)

  Setelah upload, buka Serial Monitor untuk lihat alamat IP-nya, lalu:
  http://ALAMAT_IP_INI:81/stream
  itulah yang dimasukkan ke kolom "Kamera box" di dashboard (lewat Tailscale
  kalau mau diakses dari luar jaringan rumah).

  Ini memakai contoh bawaan Arduino IDE: File > Examples > ESP32 > Camera >
  CameraWebServer — di bawah ini versi yang sudah disederhanakan & dikomentari.
*/

#include "esp_camera.h"
#include <WiFi.h>

// =====================================================================
// KONFIGURASI
// =====================================================================

const char* WIFI_SSID     = "NAMA_WIFI_KAMU";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_KAMU";

// Pin kamera untuk board AI-Thinker ESP32-CAM.
// Kalau kamu pakai varian ESP32-CAM lain, cek pinout modul-nya masing-masing.
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

void startCameraServer(); // didefinisikan di file terpisah app_httpd.cpp
                          // (ikut dari contoh CameraWebServer, lihat catatan di README firmware)

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(false);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
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
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // Resolusi & kualitas — turunkan kalau koneksi WiFi lemah / mau lebih ringan
  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA; // 640x480
    config.jpeg_quality = 12;          // makin kecil angka = makin bagus (tapi makin berat)
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA; // 320x240, lebih ringan tanpa PSRAM
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Kamera gagal diinisialisasi, error 0x%x\n", err);
    return;
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Menyambungkan ke WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("WiFi tersambung!");

  startCameraServer();

  Serial.print("Kamera siap, buka: http://");
  Serial.print(WiFi.localIP());
  Serial.println(":81/stream");
}

void loop() {
  delay(10000); // server jalan di background lewat startCameraServer()
}
