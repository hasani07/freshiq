# FreshIQ — Dashboard Monitoring & Kendali Iklim Box

Dashboard web untuk memantau dan mengendalikan kondisi lingkungan dalam sebuah box tertutup, menggunakan ESP32 sebagai akuisisi data.

## Fitur

- **Monitoring real-time**: suhu (DHT22), kelembapan (DHT22), dan kadar VOC (MQ-135)
- **Kendali kipas**: mode otomatis (histeresis berbasis threshold) atau manual
- **Threshold yang bisa diatur**: rentang ideal suhu, kelembapan, dan VOC lewat dual-range slider
- **Grafik tren** dengan pita rentang ideal
- **Rekomendasi berbasis aturan** yang membaca kondisi terkini vs threshold
- **Live streaming kamera** dari ESP32-CAM (MJPEG)
- **Status sistem**: perangkat online/offline, waktu data terakhir masuk, estimasi pemakaian database
- Desain glassmorphism, responsif dari mobile sampai desktop

## Arsitektur

```
ESP32 (DHT22 + MQ-135) ──insert──▶ Supabase (Postgres + Realtime)
                                          │
                                          │ realtime channel
                                          ▼
                              Dashboard (React + Vite, di Vercel)
                                          │
                                          │ upsert box_settings
                                          ▼
ESP32 ◀────poll setiap beberapa detik──── Supabase (box_settings)
   │
   └─▶ menjalankan logika kipas secara LOKAL berdasarkan threshold
       yang terakhir disinkronkan (tidak bergantung koneksi internet
       saat itu juga)

ESP32-CAM ──MJPEG stream──▶ dibuka langsung dari dashboard
                             lewat Tailscale (VPN), terpisah dari
                             jalur data sensor di atas
```

Video streaming sengaja **tidak** lewat Supabase — MJPEG langsung dari ESP32-CAM ke browser (via Tailscale untuk akses dari luar jaringan lokal) supaya latensinya tetap rendah.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env   # isi dengan URL & anon key project Supabase kamu
npm run dev
```

Kalau `.env` tidak diisi, dashboard tetap jalan pakai data simulasi (mode demo) — berguna untuk melihat tampilan tanpa perangkat fisik.

## Skema database (Supabase)

```sql
create table sensor_readings (
  id bigint generated always as identity primary key,
  suhu float8,
  lembap float8,
  voc float8,
  created_at timestamptz default now()
);

create table box_settings (
  id int primary key,
  suhumin float8, suhumax float8,
  lembapmin float8, lembapmax float8,
  vocmin float8, vocmax float8,
  fan_mode text,
  fan_manual_on boolean
);

alter table sensor_readings enable row level security;
alter table box_settings enable row level security;

-- lihat bagian "Keamanan" sebelum memakai policy contoh di bawah ini di production
create policy "allow read" on sensor_readings for select using (true);
create policy "allow insert" on sensor_readings for insert with check (true);
create policy "allow all" on box_settings for all using (true) with check (true);
```

Aktifkan juga **Realtime** untuk tabel `sensor_readings` lewat Database → Replication di dashboard Supabase, supaya `postgres_changes` yang dipakai di `src/App.jsx` bisa menerima event insert.

## Firmware ESP32 (ringkas)

```cpp
// kirim pembacaan sensor
HTTPClient http;
http.begin("https://xxxx.supabase.co/rest/v1/sensor_readings");
http.addHeader("apikey", ANON_KEY);
http.addHeader("Authorization", "Bearer " + String(ANON_KEY));
http.addHeader("Content-Type", "application/json");
http.POST("{\"suhu\":" + String(suhu) + ",\"lembap\":" + String(lembap) + ",\"voc\":" + String(voc) + "}");
```

ESP32 juga sebaiknya polling tabel `box_settings` tiap beberapa detik untuk membaca threshold terbaru, lalu menjalankan histeresis kipas secara lokal di firmware — bukan menunggu perintah dari dashboard.

## Keamanan

Project ini memakai **anon key** Supabase di sisi client (ter-bundle di file JavaScript hasil build). Ini **sesuai desain resmi Supabase**, bukan kebocoran kredensial — anon key memang dibuat untuk dipasang di aplikasi publik. Yang tidak boleh pernah ada di kode frontend adalah **service_role key**, dan project ini tidak memakainya sama sekali.

Keamanan sesungguhnya diatur lewat **Row Level Security (RLS)** di level database, bukan dengan menyembunyikan key. Policy contoh di atas ("allow all") paling longgar dan cocok untuk pengembangan awal; untuk dipakai jangka panjang, disarankan memperketat, misalnya:

- Insert ke `sensor_readings` hanya diizinkan kalau request menyertakan token perangkat tertentu (disimpan di firmware ESP32, bukan anon key)
- Atau taruh Edge Function Supabase di antara ESP32 dan database, sehingga anon key publik tidak pernah punya akses tulis langsung

## Deploy ke Vercel

1. Push repo ini ke GitHub
2. Import project di [vercel.com/new](https://vercel.com/new), pilih repo ini
3. Vercel otomatis mendeteksi Vite — build command `vite build`, output `dist`
4. Tambahkan Environment Variables di Project Settings → Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy

## Batasan yang diketahui

- Estimasi "database terpakai" dihitung dari jumlah baris × perkiraan ukuran per baris, bukan angka resmi dari Supabase (Supabase belum expose metrik itu lewat REST API publik)
- Kamera memerlukan ESP32-CAM dan viewer berada di jaringan yang sama, atau sama-sama tersambung lewat VPN seperti Tailscale
