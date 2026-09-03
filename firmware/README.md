# Firmware FreshIQ

Dua board terpisah, dua sketch terpisah:

## 1. esp32_sensor_fan.ino
Board ESP32 biasa (bukan ESP32-CAM) yang pegang DHT22, MS-1100, dan relay kipas.

**Sebelum upload:**
1. Buka Arduino IDE > Tools > Manage Libraries, install:
   - "DHT sensor library" (Adafruit) — otomatis minta install "Adafruit Unified Sensor" juga, terima saja
   - "ArduinoJson" (Benoit Blanchon)
2. Ganti `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_ANON_KEY` di bagian atas file
3. Cek pin `DHTPIN`, `MS1100_PIN`, `FAN_PIN` sesuai wiring kamu
4. Board: pilih sesuai modul ESP32 kamu (biasanya "ESP32 Dev Module")

MS-1100 di sketch ini masih pakai konversi kasar (linear) dari nilai analog ke ppm — belum dikalibrasi presisi. Sensor ini perlu dipanaskan (preheat) 3-5 menit sebelum pembacaannya stabil, dan tegangan normal di udara bersih ada di bawah 1V. Untuk hasil lebih akurat, ukur dulu nilai `analogRead()` di udara bersih sebagai baseline, lalu sesuaikan rentang `map()` di kode berdasarkan baseline itu.

## 2. esp32cam_stream.ino
Board ESP32-CAM (AI-Thinker atau varian sejenis) khusus streaming video.

**Sebelum upload:**
1. Board: pilih "AI Thinker ESP32-CAM"
2. File ini BUTUH dua file tambahan dari contoh bawaan Arduino IDE:
   - Buka **File > Examples > ESP32 > Camera > CameraWebServer**
   - Copy file `app_httpd.cpp` dan `camera_pins.h` dari contoh itu ke folder project ini
   - File-file itu berisi server HTTP untuk streaming-nya (ratusan baris, jadi lebih aman pakai versi resmi dari Espressif daripada ditulis ulang dari nol)
3. Ganti `WIFI_SSID` dan `WIFI_PASSWORD`
4. Upload, buka Serial Monitor untuk lihat alamat IP-nya

Setelah nyala, alamat streaming-nya `http://ALAMAT_IP:81/stream` — itu yang dimasukkan ke kolom "Kamera box" di dashboard.

## Wiring singkat

| Komponen        | Pin ESP32 |
|-----------------|-----------|
| DHT22 data      | GPIO 4    |
| MS-1100 analog   | GPIO 34   |
| Relay/MOSFET kipas | GPIO 26 |

ESP32-CAM pin kameranya sudah tetap sesuai modul, tidak perlu wiring tambahan selain power dan (kalau perlu upload) jumper GPIO0 ke GND saat flashing.
