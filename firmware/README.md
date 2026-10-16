<div align="center">

# FreshRay Firmware

**[🇬🇧 English](#english)** · **[🇮🇩 Bahasa Indonesia](#bahasa-indonesia)**

</div>

---

<a id="english"></a>
## 🇬🇧 English

Two separate boards, two separate sketches, both talking to Supabase over HTTPS REST (not directly to the dashboard).

### 1. `esp32_sensor_fan.ino` — `device_id = 1`

A regular ESP32 board (not ESP32-CAM) driving the DHT22, MS-1100, fan relay, and the solar panel voltage reading.

**Before uploading:**
1. Arduino IDE → Tools → Manage Libraries, install:
   - "DHT sensor library" (Adafruit) — it will ask to also install "Adafruit Unified Sensor", accept that
   - "ArduinoJson" (Benoit Blanchon)
2. Fill in `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` near the top of the file
3. Check the pins against the wiring table below, and `VDIV_R1` / `VDIV_R2` against the resistors you actually used for the voltage divider
4. Board: pick whichever ESP32 module you have (usually "ESP32 Dev Module")

**What this firmware does every cycle:**
- Reads DHT22 + MS-1100 + solar voltage → `POST`s to `sensor_readings` (including `rssi`)
- Polls `box_settings` → runs the fan hysteresis logic **locally**, without waiting for a live command from the dashboard (keeps working even if the dashboard is closed or the internet briefly drops)
- Polls `wifi_config` → on a new SSID/password, tries connecting; failing within 15 seconds triggers an automatic rollback to the previous network (old credentials stay persisted via `Preferences`/NVS) → the outcome is reported to `wifi_history`
- Polls `ota_firmware` → runs `HTTPUpdate` from the file in the `firmware` bucket when a newer version is registered
- `logRemote()` → every notable event (WiFi connect/disconnect, OTA result, errors) is sent to `device_logs`, in addition to the physical Serial Monitor

The MS-1100 reading in this sketch is still a rough linear conversion from the analog value to ppm — not precisely calibrated. This sensor needs 3–5 minutes to preheat before its reading stabilizes, and its voltage in clean air normally sits below 1V. For a more accurate reading, measure your own `analogRead()` baseline in clean air first, then adjust the `map()` range in the code accordingly.

#### Wiring

| Component | ESP32 Pin |
|---|---|
| DHT22 data | GPIO 4 |
| MS-1100 analog | GPIO 34 |
| Fan relay/MOSFET | GPIO 26 |
| Solar panel voltage divider | GPIO 35 |

The solar voltage divider uses two resistors (default `R1 = 30k`, `R2 = 7.5k` in code — adjust to match the resistors you actually wired in, or the voltage reading will be off).

### 2. `esp32cam_stream.ino` — `device_id = 2`

An ESP32-CAM board (AI Thinker or a similar variant). **Note**: despite the filename still saying "stream", this board does **not** do live video streaming — it was redesigned around cloud snapshots, since in practice the ESP32-CAM is rarely on the same network as whoever wants to check on it remotely.

**Before uploading:**
1. Board: select "AI Thinker ESP32-CAM"
2. Fill in `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` near the top of the file
3. Tools → Partition Scheme: pick one that leaves room for OTA (e.g. "Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)"), since this board also supports OTA
4. Upload **via USB** the first time (OTA only becomes usable once this initial firmware is on the board). Jumper GPIO0 to GND while flashing, remove it afterward, then reset

**What this firmware does every cycle:**
- Every 30 minutes: capture a frame automatically (`source: "interval"`)
- Polls `camera_command` → when `capture_requested_at` changes (written by the dashboard when "Capture now" is pressed), captures a frame (`source: "manual"`)
- The frame is uploaded via `WiFiClientSecure` + `HTTPClient::PUT` to the `snapshots` Storage bucket, then a new row is written to `camera_snapshots` with the public URL, path, source, and capture time (via NTP / `configTime`, so filenames and timestamps are human-readable)
- Periodic heartbeat to `camera_status` (online + RSSI), so the dashboard knows this board is alive
- Polls `wifi_config` and `ota_firmware` — same behavior as the sensor board (automatic rollback, etc.)
- `logRemote()` same as the sensor board, plus extra diagnostics (PSRAM status, free heap) to help trace capture/upload failures mid-process

PSRAM **must be enabled** (Tools → PSRAM: "Enabled") — without it, the camera frame buffer at higher resolutions will fail or crash.

#### Wiring

The ESP32-CAM's camera pins are fixed by the module (no extra wiring needed) aside from power, and jumpering GPIO0↔GND while flashing over USB.

### Remote debugging

If a device is unresponsive and you can't plug in USB right away, open the **"Device log"** panel on the dashboard and press **"View log"** — this pulls the last 50 rows from `device_logs`. Useful for seeing normal events (WiFi changes, OTA, photo captures), but it **cannot** capture a crash dump (e.g. a *Guru Meditation Error*) because the board reboots before it can send its last log line — for that you still need a physical Serial Monitor over USB.

<div align="right"><a href="#freshray-firmware">↑ back to top</a></div>

---

<a id="bahasa-indonesia"></a>
## 🇮🇩 Bahasa Indonesia

Dua board terpisah, dua sketch terpisah, keduanya bicara ke Supabase lewat HTTPS REST (bukan ke dashboard secara langsung).

### 1. `esp32_sensor_fan.ino` — `device_id = 1`

Board ESP32 biasa (bukan ESP32-CAM) yang pegang DHT22, MS-1100, relay kipas, dan pembacaan tegangan panel surya.

**Sebelum upload:**
1. Buka Arduino IDE → Tools → Manage Libraries, install:
   - "DHT sensor library" (Adafruit) — akan minta install "Adafruit Unified Sensor" juga, terima saja
   - "ArduinoJson" (Benoit Blanchon)
2. Isi `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` di bagian atas file
3. Cek pin sesuai wiring di bawah, dan `VDIV_R1` / `VDIV_R2` sesuai resistor voltage divider yang dipakai
4. Board: pilih sesuai modul ESP32 kamu (biasanya "ESP32 Dev Module")

**Yang dikerjakan firmware ini setiap siklus:**
- Baca DHT22 + MS-1100 + tegangan panel → `POST` ke `sensor_readings` (termasuk `rssi`)
- Polling `box_settings` → jalankan histeresis kipas **secara lokal**, tidak menunggu perintah dashboard real-time (tetap jalan walau dashboard sedang tidak dibuka / koneksi internet sempat putus)
- Polling `wifi_config` → kalau ada SSID/password baru, coba konek; gagal dalam 15 detik → otomatis rollback ke WiFi sebelumnya (kredensial lama tersimpan persisten lewat `Preferences`/NVS) → hasil percobaan dilaporkan ke `wifi_history`
- Polling `ota_firmware` → kalau ada versi baru terdaftar, jalankan `HTTPUpdate` dari file di bucket `firmware`
- `logRemote()` → setiap kejadian penting (konek/putus WiFi, hasil OTA, error) dikirim ke `device_logs`, selain tetap muncul di Serial Monitor fisik

MS-1100 di sketch ini masih pakai konversi kasar (linear) dari nilai analog ke ppm — belum dikalibrasi presisi. Sensor ini perlu dipanaskan (preheat) 3–5 menit sebelum pembacaannya stabil, dan tegangan normal di udara bersih ada di bawah 1V. Untuk hasil lebih akurat, ukur dulu nilai `analogRead()` di udara bersih sebagai baseline, lalu sesuaikan rentang `map()` di kode berdasarkan baseline itu.

#### Wiring

| Komponen | Pin ESP32 |
|---|---|
| DHT22 data | GPIO 4 |
| MS-1100 analog | GPIO 34 |
| Relay/MOSFET kipas | GPIO 26 |
| Voltage divider panel surya | GPIO 35 |

Voltage divider panel surya pakai dua resistor (default `R1 = 30k`, `R2 = 7.5k` di kode — sesuaikan dengan resistor fisik yang dipakai supaya pembacaan tegangan akurat).

### 2. `esp32cam_stream.ino` — `device_id = 2`

Board ESP32-CAM (AI Thinker atau varian sejenis). **Catatan**: meskipun nama filenya masih menyebut "stream", perangkat ini **tidak** melakukan live video streaming — itu didesain ulang jadi snapshot ke cloud, karena ESP32-CAM pada praktiknya jarang satu jaringan dengan orang yang mau memantau dari luar.

**Sebelum upload:**
1. Board: pilih "AI Thinker ESP32-CAM"
2. Isi `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` di bagian atas file
3. Tools → Partition Scheme: pilih yang menyisakan ruang OTA (mis. "Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)"), karena board ini juga dukung OTA
4. Upload **via USB** untuk pertama kali (OTA baru bisa dipakai setelah firmware awal ini terpasang). Jumper GPIO0 ke GND saat proses flashing, lepas setelah selesai lalu reset

**Yang dikerjakan firmware ini setiap siklus:**
- Tiap 30 menit: ambil frame kamera otomatis (`source: "interval"`)
- Polling `camera_command` → kalau `capture_requested_at` berubah (ditulis dashboard saat tombol "Ambil sekarang" ditekan), ambil frame (`source: "manual"`)
- Frame diupload lewat `WiFiClientSecure` + `HTTPClient::PUT` ke Storage bucket `snapshots`, lalu baris baru dicatat ke `camera_snapshots` berisi URL publik, path, source, dan waktu capture (NTP, lewat `configTime`, supaya nama file & timestamp manusiawi)
- Heartbeat berkala ke `camera_status` (online + RSSI), supaya dashboard tahu board ini masih hidup
- Polling `wifi_config` dan `ota_firmware` — perilakunya sama seperti board sensor (rollback otomatis, dsb)
- `logRemote()` sama seperti board sensor, termasuk diagnostik tambahan (status PSRAM, free heap) untuk membantu melacak kalau proses capture/upload gagal di tengah jalan

PSRAM **wajib aktif** (Tools → PSRAM: "Enabled") — tanpa ini, buffer frame kamera resolusi lebih tinggi akan gagal/crash.

#### Wiring

Pin kamera ESP32-CAM sudah tetap sesuai modul (tidak perlu wiring tambahan) selain power dan jumper GPIO0↔GND saat flashing via USB.

### Debugging jarak jauh

Kalau perangkat tidak merespons dan tidak bisa dicolok USB saat itu juga, buka panel **"Log perangkat"** di dashboard dan tekan **"Lihat Log"** — ini menarik 50 baris log terakhir dari `device_logs`. Berguna untuk melihat kejadian normal (ganti WiFi, OTA, capture foto), tapi **tidak** bisa menangkap crash dump (mis. *Guru Meditation Error*) karena board reboot sebelum sempat mengirim baris log terakhirnya — untuk kasus itu tetap perlu Serial Monitor fisik via USB.

<div align="right"><a href="#freshray-firmware">↑ kembali ke atas</a></div>
