<div align="center">

# FreshRay
### Smart climate & spoilage monitoring for a fruit storage box
*by **FIT** — Fresh Inovation Team*

**[🇬🇧 English](#english)** · **[🇮🇩 Bahasa Indonesia](#bahasa-indonesia)**

</div>

---

<a id="english"></a>
## 🇬🇧 English

A web dashboard for monitoring and controlling the environment inside a closed fruit-storage box. Two ESP32 boards do the fieldwork — one handles sensors and the fan, one (ESP32-CAM) handles visual documentation — and both talk to the dashboard through Supabase, so you can watch and reconfigure the box from anywhere, not just on the same WiFi network.

### Live stack

| Layer | Tech |
|---|---|
| Dashboard | React 18 + Vite, Tailwind CSS, Recharts, deployed on Vercel |
| Backend | Supabase (Postgres, Realtime, Storage, Edge Functions, pg_cron) |
| Firmware | Arduino/ESP32 (C++), two independent boards |

### Features

**Monitoring**
- Real-time temperature & humidity (DHT22) and VOC level (MS-1100), with trend charts that highlight the ideal range and auto-scale their Y-axis
- Solar panel voltage (via a voltage divider) — display-only, intentionally no threshold/alert and no chart
- WiFi signal strength (RSSI) for each board
- Online/offline status per device, last-seen timestamp — a device is marked **offline after 2 minutes** without incoming data

**Control**
- Fan: automatic mode (hysteresis against thresholds) or manual override
- Adjustable temperature/humidity/VOC thresholds via dual-range sliders
- **Fruit spoilage detection**: a Fresh / Starting to Spoil / Spoiled status computed from VOC, temperature and humidity together, with its own adjustable dual-range thresholds
- **Save ranges**: ideal ranges and spoilage ranges are saved with a *Save* button, so every device that opens the dashboard sees the same values (not the defaults). The last 5 saves are kept as a history you can re-apply; older ones are deleted automatically

**Camera (ESP32-CAM)**
- Automatic snapshot every 30 minutes, plus an on-demand "Capture now" button
- Photo history with a date-range filter
- Automatic 7-day retention — old photos delete themselves server-side
- Built for the common case where the ESP32-CAM is **not** on the same network as the viewer — photos are pushed to the cloud rather than streamed live (MJPEG)

**Remote operations (no USB, no shared network required)**
- **OTA firmware updates** for both boards, gated by a PIN that is validated **server-side** (never shipped in the frontend bundle)
- **Remote WiFi reconfiguration**: a board polls for new credentials, attempts to connect, and **automatically rolls back** to its previous WiFi if the new one fails within 15 seconds — plus a log of the last 3 attempts
- **Device logs**: a lightweight Serial-Monitor replacement. Logs are pulled from the server only when you press "View log" — not a constant live feed

**Also included**
- Rule-based recommendations comparing current readings against thresholds
- Alert banners for "Spoiled" status and offline devices, plus **push notifications that work on iOS, Android and desktop** (even with the web page closed). On iPhone/iPad, add the site to the Home Screen first (iOS 16.4+)
- Data export: CSV of sensor readings and a ZIP of camera photos, with a free date-range picker, human-readable filenames, and a manifest CSV inside the ZIP
- Glassmorphism UI, responsive from mobile to desktop

### Architecture

```
┌─────────────────────────┐        ┌──────────────────────────┐
│ ESP32 (Sensors + Fan)    │        │ ESP32-CAM                │
│ device_id = 1             │        │ device_id = 2             │
│                           │        │                            │
│ DHT22, MS-1100, relay     │        │ OV2640 camera               │
│ voltage divider (solar)   │        │                            │
└─────────────┬──────────────┘        └──────────────┬─────────────┘
              │ HTTPS REST (apikey = anon key)        │ HTTPS REST + Storage PUT
              ▼                                        ▼
┌───────────────────────────────────────────────────────────────────┐
│                              Supabase                               │
│                                                                      │
│  Postgres                             Storage (public-read buckets) │
│  ├─ sensor_readings (+rssi,           ├─ firmware/   (OTA .bin)     │
│  │  tegangan_panel)                   └─ snapshots/  (camera photos)│
│  ├─ box_settings (fan mode + thresholds read by ESP32)              │
│  ├─ range_settings / range_history (saved ranges, last 5)           │
│  ├─ push_subscriptions / alert_state (push notifications)           │
│  ├─ ota_firmware (version per device)  Edge Functions                │
│  ├─ wifi_config (new SSID/password)    ├─ check-ota-pin              │
│  ├─ wifi_history (log, capped 3/device)│    validates PIN server-side│
│  ├─ device_logs (capped 50/device)     ├─ cleanup-old-snapshots      │
│  ├─ camera_snapshots                   │    deletes photos > 7 days  │
│  ├─ camera_command (manual-capture flag)    (scheduled via pg_cron)  │
│  └─ camera_status (heartbeat + rssi)   └─ send-alerts (web push, 1/min)│
│                                                                      │
│  Realtime (postgres_changes, enabled per table via publication)     │
└────────────────────────────┬─────────────────────────────────────────┘
                              │ anon key (read + scoped write via RLS)
                              ▼
                   ┌───────────────────────────┐
                   │  Dashboard (React + Vite)  │
                   │  deployed on Vercel         │
                   └───────────────────────────┘
```

**Sensor data flow**: ESP32 reads DHT22 + MS-1100 + solar voltage on a timer → `POST` to `sensor_readings` → the dashboard receives it over a Realtime subscription → ring gauges and charts update with no page reload.

**Control flow**: the dashboard writes thresholds/fan mode to `box_settings` → the ESP32 polls that table every few seconds and runs the fan hysteresis logic **locally** in firmware — it does not wait for a live command from the dashboard, so the fan keeps working correctly even if the dashboard is closed or the internet briefly drops.

**Camera flow**: the ESP32-CAM auto-captures every 30 minutes, or immediately when the dashboard writes a new timestamp to `camera_command` (picked up on the next poll). Each photo is uploaded straight to the `snapshots` Storage bucket; its public URL is recorded in `camera_snapshots`. The `cleanup-old-snapshots` Edge Function runs daily via `pg_cron` to delete rows and storage objects older than 7 days.

**OTA flow**: the dashboard uploads a `.bin` file to the `firmware` bucket and registers the target version in `ota_firmware` — but only after the entered PIN passes the `check-ota-pin` Edge Function (the real PIN never ships in the JavaScript bundle). Each board polls this table, compares versions, and runs `HTTPUpdate` when a newer one is found.

**WiFi flow**: the dashboard writes a new SSID/password to `wifi_config`. The board polls, attempts to connect to the new network, and — if it fails to connect within 15 seconds — automatically falls back to the previous network (old credentials stay persisted via `Preferences`/NVS). The outcome (success/fail) is logged to `wifi_history`, auto-trimmed to the last 3 entries per device by a Postgres trigger.

**Save-ranges flow**: pressing *Save* writes the ideal + spoilage ranges to `range_settings` (what every device loads on open), appends a row to `range_history` (a Postgres trigger keeps only the newest 5), and updates `box_settings` so the ESP32 fan logic uses the new thresholds. Nothing is pushed to the database while sliders are merely being dragged, so a second device opening the dashboard can never overwrite saved values with defaults.

**Notification flow**: tapping the bell registers a service worker (`public/sw.js`), asks for permission, and stores the device's Web Push subscription in `push_subscriptions`. Every minute `pg_cron` calls the `send-alerts` Edge Function, which checks for a newly spoiled reading or a device with no data for 2 minutes, and sends a push **once per event** (tracked in `alert_state`) to all subscribed devices — so alerts arrive even when no browser tab is open.

**Log flow**: firmware has a `logRemote()` helper that does both a local `Serial.println` and a fire-and-forget `POST` to `device_logs`. The dashboard **does not** subscribe to this table in real time — it fetches only when you press "View log", to feel like opening a Serial Monitor on demand. Old rows are auto-trimmed to the last 50 per device by a trigger.

### Running locally

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL & anon key
npm run dev
```

### Database & backend setup

See `supabase/schema.sql` for the cumulative reference schema (tables, triggers, RLS, Storage policies) and `supabase/functions/` for both Edge Functions' code. **Important**: `schema.sql` is cumulative documentation, not a script meant to be re-run as a whole — when adding a new feature later, run only the new SQL snippet in the SQL Editor, not the entire file.

After creating a new table, remember to enable **Realtime** for it via *Database → Publications → supabase_realtime*, toggled on per table.

### Security

This project uses the Supabase **anon key** on the client (bundled into the built JavaScript). That's **by Supabase's own design**, not a leaked credential — the anon key is meant to ship in public apps. What must never appear in frontend code is the **service_role key**; this project only uses it inside Edge Functions, via the env var Supabase injects automatically (never exposed to the browser).

Real security is enforced through **Row Level Security (RLS)** at the database level, not by hiding the key. The "allow all" policies currently in use are the loosest option, fine for a personal-scale project; `supabase/schema.sql` includes commented examples of tightening them with a `device_token` column if that's ever needed.

The OTA PIN gate is validated by the `check-ota-pin` Edge Function, not in the React code — so the real PIN never ends up in the JavaScript shipped to the browser.

### Deploying to Vercel

1. Push this repo to GitHub
2. Import the project at [vercel.com/new](https://vercel.com/new) and select this repo
3. Vercel auto-detects Vite — build command `vite build`, output `dist`
4. Add Environment Variables under Project Settings → Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY` (public key for push notifications)
5. Deploy

### Firmware

See `firmware/README.md` for wiring, required libraries, and upload steps per board.

- `esp32_sensor_fan.ino` — sensor + fan board (`device_id = 1`)
- `esp32cam_stream.ino` — ESP32-CAM board, snapshot-to-cloud (`device_id = 2`)

### Known limitations

- The "database usage" estimate is computed from row count × an estimated row size, not an official figure from Supabase's API
- The MS-1100 → ppm conversion is still a rough linear approximation, not precisely calibrated — see `firmware/README.md`
- The camera does not stream live video; what's available is periodic + on-demand snapshots, since the ESP32-CAM is typically not on the same network as the person viewing it

<div align="right"><a href="#freshray">↑ back to top</a></div>

---

<a id="bahasa-indonesia"></a>
## 🇮🇩 Bahasa Indonesia

Dashboard web untuk memantau dan mengendalikan kondisi lingkungan dalam sebuah box penyimpanan buah tertutup. Dua board ESP32 bekerja sama: satu board menangani sensor + kipas, satu board ESP32-CAM menangani dokumentasi visual — keduanya terhubung ke web lewat Supabase, bisa dipantau dan dikonfigurasi dari mana saja tanpa harus satu jaringan dengan perangkat.

### Teknologi yang dipakai

| Lapisan | Teknologi |
|---|---|
| Dashboard | React 18 + Vite, Tailwind CSS, Recharts, di-deploy ke Vercel |
| Backend | Supabase (Postgres, Realtime, Storage, Edge Functions, pg_cron) |
| Firmware | Arduino/ESP32 (C++), dua board independen |

### Fitur

**Monitoring**
- Suhu & kelembapan (DHT22) dan kadar VOC (MS-1100) real-time, dengan grafik tren yang menyorot rentang ideal dan auto-scaling sumbu Y
- Tegangan panel surya (voltage divider) — murni informasi, sengaja tanpa ambang, alert, maupun grafik
- Kekuatan sinyal WiFi (RSSI) masing-masing board
- Status online/offline tiap perangkat, waktu data terakhir masuk — perangkat dianggap **offline setelah 2 menit** tanpa data masuk

**Kendali**
- Kipas: mode otomatis (histeresis berbasis threshold) atau manual
- Threshold suhu/kelembapan/VOC yang bisa diatur sendiri lewat dual-range slider
- **Deteksi kebusukan buah**: status Segar / Mulai Busuk / Busuk dari kombinasi VOC, suhu, dan kelembapan, dengan ambang yang juga bisa diatur sendiri
- **Simpan rentang**: rentang ideal dan rentang kebusukan disimpan lewat tombol *Simpan*, jadi perangkat mana pun yang membuka dashboard melihat nilai yang sama (bukan kembali ke default). 5 penyimpanan terakhir tersimpan sebagai riwayat yang bisa dipakai lagi; yang lebih lama terhapus otomatis

**Kamera (ESP32-CAM)**
- Snapshot otomatis tiap 30 menit + tombol "Ambil sekarang" untuk capture on-demand
- Riwayat foto dengan filter rentang tanggal
- Retensi otomatis: foto lebih dari 7 hari terhapus sendiri di server
- Didesain untuk kondisi ESP32-CAM yang **tidak** satu jaringan dengan viewer — foto naik ke cloud, bukan streaming MJPEG langsung

**Operasional jarak jauh (tanpa USB, tanpa satu jaringan)**
- **OTA update** firmware untuk kedua board, digerbangi PIN yang divalidasi di server (bukan di kode frontend)
- **Konfigurasi ulang WiFi** dari dashboard: board polling kredensial baru, coba konek, dan **otomatis rollback** ke WiFi lama kalau yang baru gagal dalam 15 detik — plus riwayat 3 percobaan terakhir
- **Log perangkat**: pengganti ringan Serial Monitor, log terbaru ditarik dari server saat tombol "Lihat Log" ditekan, bukan auto-update terus-menerus

**Lainnya**
- Rekomendasi berbasis aturan yang membandingkan kondisi terkini vs threshold
- Banner peringatan untuk status "Busuk" dan perangkat offline, plus **notifikasi push yang jalan di iOS, Android, dan desktop** (bahkan saat halaman web ditutup). Di iPhone/iPad, pasang dulu ke Layar Utama (iOS 16.4+)
- Unduh data: CSV data sensor dan ZIP foto kamera, rentang tanggal bebas pilih, nama file & manifest yang manusiawi (bukan epoch mentah)
- Desain glassmorphism, responsif dari mobile sampai desktop

### Arsitektur

```
┌─────────────────────────┐        ┌──────────────────────────┐
│ ESP32 (Sensor + Kipas)    │        │ ESP32-CAM                 │
│ device_id = 1              │        │ device_id = 2              │
│                            │        │                             │
│ DHT22, MS-1100, relay      │        │ Kamera OV2640                │
│ voltage divider (panel)    │        │                             │
└─────────────┬───────────────┘        └──────────────┬──────────────┘
              │ HTTPS REST (apikey = anon key)         │ HTTPS REST + Storage PUT
              ▼                                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                              Supabase                                │
│                                                                       │
│  Postgres                              Storage (bucket public-read) │
│  ├─ sensor_readings (+rssi,            ├─ firmware/   (.bin OTA)    │
│  │  tegangan_panel)                    └─ snapshots/  (foto kamera) │
│  ├─ box_settings (mode kipas + threshold dibaca ESP32)              │
│  ├─ range_settings / range_history (rentang tersimpan, 5 terakhir)  │
│  ├─ push_subscriptions / alert_state (notifikasi push)              │
│  ├─ ota_firmware (versi per device)     Edge Functions               │
│  ├─ wifi_config (SSID/pass baru)        ├─ check-ota-pin             │
│  ├─ wifi_history (log, cap 3/device)    │    validasi PIN di server  │
│  ├─ device_logs (cap 50/device)         ├─ cleanup-old-snapshots     │
│  ├─ camera_snapshots                    │    hapus foto >7 hari      │
│  ├─ camera_command (trigger manual)          (dijadwalkan pg_cron)   │
│  └─ camera_status (heartbeat+rssi)      └─ send-alerts (web push/menit)│
│                                                                       │
│  Realtime (postgres_changes, per tabel lewat publication)            │
└────────────────────────────┬──────────────────────────────────────────┘
                              │ anon key (read + scoped write via RLS)
                              ▼
                   ┌───────────────────────────┐
                   │  Dashboard (React + Vite)   │
                   │  di-deploy ke Vercel          │
                   └───────────────────────────┘
```

**Alur data sensor**: ESP32 membaca DHT22 + MS-1100 + tegangan panel secara berkala → `POST` ke `sensor_readings` → dashboard menerima lewat Realtime subscription → tampil di ring gauge & grafik tanpa reload.

**Alur kontrol**: Dashboard menulis threshold/mode kipas ke `box_settings` → ESP32 polling tabel ini tiap beberapa detik dan menjalankan logika kipas **secara lokal** di firmware — tidak menunggu perintah langsung dari dashboard, jadi tetap jalan walau dashboard sedang tidak dibuka atau koneksi internet sempat putus.

**Alur kamera**: ESP32-CAM capture otomatis tiap 30 menit, atau segera setelah dashboard menulis timestamp baru ke `camera_command` (ditangkap di polling berikutnya). Foto diupload langsung ke Storage bucket `snapshots`, URL publiknya dicatat di `camera_snapshots`. Edge Function `cleanup-old-snapshots` dijalankan harian lewat `pg_cron` untuk menghapus foto dan baris yang lebih dari 7 hari.

**Alur OTA**: Dashboard upload file `.bin` ke bucket `firmware`, menyimpan versi target di `ota_firmware` — tapi baru tersimpan kalau PIN yang dimasukkan lolos validasi `check-ota-pin` (Edge Function; PIN asli tidak pernah ikut ter-bundle ke JavaScript). Tiap board polling tabel ini, bandingkan versi, dan jalankan `HTTPUpdate` kalau ada versi baru.

**Alur WiFi**: Dashboard menulis SSID/password baru ke `wifi_config`. Board polling, coba konek ke WiFi baru; kalau gagal tersambung dalam 15 detik, otomatis kembali ke WiFi sebelumnya (kredensial lama tetap tersimpan lewat `Preferences`/NVS). Hasil percobaan dicatat ke `wifi_history`, dibatasi otomatis ke 3 entri terakhir per device lewat trigger Postgres.

**Alur simpan rentang**: tombol *Simpan* menulis rentang ideal + rentang kebusukan ke `range_settings` (yang dimuat tiap perangkat saat dibuka), menambah baris ke `range_history` (trigger Postgres menyisakan 5 terbaru), dan memperbarui `box_settings` supaya logika kipas ESP32 memakai ambang baru. Tidak ada yang dikirim ke database selama slider hanya digeser, jadi perangkat kedua yang membuka dashboard tidak bisa menimpa nilai tersimpan dengan default.

**Alur notifikasi**: menekan lonceng mendaftarkan service worker (`public/sw.js`), meminta izin, dan menyimpan langganan Web Push perangkat itu di `push_subscriptions`. Tiap menit `pg_cron` memanggil Edge Function `send-alerts`, yang mengecek pembacaan baru yang busuk atau perangkat tanpa data selama 2 menit, lalu mengirim push **sekali per kejadian** (dicatat di `alert_state`) ke semua perangkat yang berlangganan — jadi peringatan tetap masuk walau tidak ada tab browser yang terbuka.

**Alur log**: Firmware punya helper `logRemote()` yang sekaligus `Serial.println` lokal dan POST fire-and-forget ke `device_logs`. Dashboard **tidak** subscribe realtime ke tabel ini — baru fetch saat tombol "Lihat Log" ditekan, supaya terasa seperti buka Serial Monitor manual. Baris lama dibatasi otomatis ke 50 per device lewat trigger.

### Menjalankan secara lokal

```bash
npm install
cp .env.example .env   # isi dengan URL & anon key project Supabase kamu
npm run dev
```

### Setup database & backend

Lihat `supabase/schema.sql` untuk skema referensi kumulatif (tabel, trigger, RLS, Storage policy) dan folder `supabase/functions/` untuk kode kedua Edge Function. **Catatan penting**: `schema.sql` adalah dokumentasi kumulatif, bukan skrip yang aman dijalankan ulang secara utuh — kalau menambah fitur baru di kemudian hari, jalankan hanya potongan SQL barunya saja di SQL Editor, jangan seluruh file.

Setelah membuat tabel baru, jangan lupa aktifkan **Realtime** untuk tabel yang relevan lewat *Database → Publications → supabase_realtime*, toggle per tabel satu per satu.

### Keamanan

Project ini memakai **anon key** Supabase di sisi client (ter-bundle di file JavaScript hasil build). Ini **sesuai desain resmi Supabase**, bukan kebocoran kredensial — anon key memang dibuat untuk dipasang di aplikasi publik. Yang tidak boleh pernah ada di kode frontend adalah **service_role key**; project ini hanya memakainya di dalam Edge Functions lewat env var yang otomatis disuntikkan Supabase, tidak pernah terekspos ke browser.

Keamanan ditegakkan lewat **Row Level Security (RLS)** di level database, bukan dengan menyembunyikan key. Policy "allow all" yang dipakai saat ini paling longgar dan cocok untuk skala proyek pribadi; `supabase/schema.sql` menyertakan contoh pengetatan lewat kolom `device_token` kalau suatu saat dibutuhkan.

Gerbang OTA (PIN) divalidasi di Edge Function `check-ota-pin`, bukan di kode React — jadi PIN asli tidak pernah ikut ter-bundle ke JavaScript yang dikirim ke browser.

### Deploy ke Vercel

1. Push repo ini ke GitHub
2. Import project di [vercel.com/new](https://vercel.com/new), pilih repo ini
3. Vercel otomatis mendeteksi Vite — build command `vite build`, output `dist`
4. Tambahkan Environment Variables di Project Settings → Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY` (kunci publik untuk notifikasi push)
5. Deploy

### Firmware

Lihat `firmware/README.md` untuk detail wiring, library yang dibutuhkan, dan langkah upload tiap board.

- `esp32_sensor_fan.ino` — board sensor + kipas (`device_id = 1`)
- `esp32cam_stream.ino` — board ESP32-CAM, snapshot ke cloud (`device_id = 2`)

### Batasan yang diketahui

- Estimasi "database terpakai" dihitung dari jumlah baris × perkiraan ukuran per baris, bukan angka resmi dari Supabase
- Konversi MS-1100 ke ppm masih konversi kasar (linear), belum dikalibrasi presisi — lihat `firmware/README.md`
- Kamera tidak streaming video langsung; yang tersedia adalah snapshot berkala + on-demand, karena ESP32-CAM umumnya tidak berada di jaringan yang sama dengan viewer

<div align="right"><a href="#freshray">↑ kembali ke atas</a></div>
