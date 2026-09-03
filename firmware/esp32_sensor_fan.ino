/*
  FreshIQ — Firmware ESP32 (sensor + kipas)
  ------------------------------------------------------------
  Tugas board ini:
  1. Baca DHT22 (suhu & kelembapan) dan MS-1100 (VOC/kualitas udara)
  2. Kirim pembacaan ke Supabase (tabel sensor_readings) secara berkala
  3. Ambil threshold & mode kipas terbaru dari Supabase (tabel box_settings)
  4. Jalankan kipas secara LOKAL berdasarkan threshold itu (histeresis),
     supaya kipas tetap bekerja walau koneksi internet putus sesaat

  Library yang perlu diinstall lewat Library Manager Arduino IDE:
  - "DHT sensor library" by Adafruit (dan dependensinya "Adafruit Unified Sensor")
  - "ArduinoJson" by Benoit Blanchon

  Board: pilih "ESP32 Dev Module" (atau sesuai board ESP32 yang kamu pakai)
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// =====================================================================
// KONFIGURASI — GANTI BAGIAN INI SESUAI PUNYAMU
// =====================================================================

const char* WIFI_SSID     = "NAMA_WIFI_KAMU";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_KAMU";

const char* SUPABASE_URL      = "https://xnqbsaxmdruxtmqxnmoq.supabase.co";
const char* SUPABASE_ANON_KEY = "GANTI_DENGAN_ANON_KEY_KAMU";

// Pin
#define DHTPIN      4        // pin data DHT22
#define DHTTYPE     DHT22
#define MS1100_PIN   34       // pin analog (ADC) untuk MS-1100, harus pin ADC1 (32-39)
#define FAN_PIN     26       // pin relay/MOSFET untuk kipas

// Interval waktu (milidetik)
const unsigned long KIRIM_DATA_INTERVAL   = 5000;   // kirim data sensor tiap 5 detik
const unsigned long AMBIL_SETTING_INTERVAL = 10000; // ambil threshold tiap 10 detik

// =====================================================================
// VARIABEL GLOBAL
// =====================================================================

DHT dht(DHTPIN, DHTTYPE);

unsigned long lastKirimData = 0;
unsigned long lastAmbilSetting = 0;

// Threshold & mode kipas, defaultnya dulu sebelum berhasil ambil dari Supabase
float suhuMin = 22, suhuMax = 30;
float lembapMin = 40, lembapMax = 70;
float vocMin = 0, vocMax = 400;
String fanMode = "auto";     // "auto" atau "manual"
bool fanManualOn = false;

bool fanState = false;       // status kipas saat ini (hasil logika histeresis)

// =====================================================================
// SETUP
// =====================================================================

void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(FAN_PIN, OUTPUT);
  digitalWrite(FAN_PIN, LOW);

  sambungkanWiFi();
}

// =====================================================================
// LOOP UTAMA (non-blocking, pakai millis bukan delay)
// =====================================================================

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    sambungkanWiFi();
  }

  unsigned long now = millis();

  if (now - lastKirimData >= KIRIM_DATA_INTERVAL) {
    lastKirimData = now;
    bacaSensorDanKirim();
  }

  if (now - lastAmbilSetting >= AMBIL_SETTING_INTERVAL) {
    lastAmbilSetting = now;
    ambilBoxSettings();
  }

  jalankanLogikaKipas();
}

// =====================================================================
// KONEKSI WIFI
// =====================================================================

void sambungkanWiFi() {
  Serial.print("Menyambungkan ke WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int percobaan = 0;
  while (WiFi.status() != WL_CONNECTED && percobaan < 40) {
    delay(500);
    Serial.print(".");
    percobaan++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi tersambung, IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nGagal konek WiFi, akan dicoba lagi di loop berikutnya.");
  }
}

// =====================================================================
// BACA SENSOR & KIRIM KE SUPABASE
// =====================================================================

void bacaSensorDanKirim() {
  float suhu   = dht.readTemperature();
  float lembap = dht.readHumidity();

  if (isnan(suhu) || isnan(lembap)) {
    Serial.println("Gagal membaca DHT22, lewati siklus ini.");
    return;
  }

  // MS-1100: pembacaan analog mentah (0-4095 di ESP32) diubah ke perkiraan ppm.
  // CATATAN: MS-1100 perlu pemanasan (preheat) 3-5 menit sebelum pembacaan stabil,
  // dan tegangan di udara bersih normalnya < 1V. Rumus di bawah masih linear sederhana;
  // untuk hasil lebih presisi, ukur dulu nilai analogRead() di udara bersih sebagai baseline,
  // lalu sesuaikan rentang map() berdasarkan baseline itu.
  int rawMS1100 = analogRead(MS1100_PIN);
  float voc = map(rawMS1100, 0, 4095, 0, 1000); // sesuaikan lagi setelah kalibrasi

  Serial.printf("Suhu: %.1f C | Lembap: %.1f %% | VOC: %.0f ppm\n", suhu, lembap, voc);

  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/sensor_readings";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  StaticJsonDocument<200> doc;
  doc["suhu"] = suhu;
  doc["lembap"] = lembap;
  doc["voc"] = voc;

  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);
  if (httpCode <= 0) {
    Serial.println("Gagal kirim data: " + http.errorToString(httpCode));
  } else if (httpCode >= 300) {
    Serial.printf("Supabase menolak data, HTTP %d: %s\n", httpCode, http.getString().c_str());
  }
  http.end();
}

// =====================================================================
// AMBIL THRESHOLD & MODE KIPAS TERBARU DARI SUPABASE
// =====================================================================

void ambilBoxSettings() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/box_settings?id=eq.1&select=*";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();

    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, payload);

    if (!err && doc.is<JsonArray>() && doc.size() > 0) {
      JsonObject setting = doc[0];

      if (!setting["suhumin"].isNull())    suhuMin    = setting["suhumin"];
      if (!setting["suhumax"].isNull())    suhuMax    = setting["suhumax"];
      if (!setting["lembapmin"].isNull())  lembapMin  = setting["lembapmin"];
      if (!setting["lembapmax"].isNull())  lembapMax  = setting["lembapmax"];
      if (!setting["vocmin"].isNull())     vocMin     = setting["vocmin"];
      if (!setting["vocmax"].isNull())     vocMax     = setting["vocmax"];
      if (!setting["fan_mode"].isNull())   fanMode    = setting["fan_mode"].as<String>();
      if (!setting["fan_manual_on"].isNull()) fanManualOn = setting["fan_manual_on"];

      Serial.printf("Setting terbaru -> suhuMax:%.1f vocMax:%.0f mode:%s\n",
                    suhuMax, vocMax, fanMode.c_str());
    }
  } else {
    Serial.printf("Gagal ambil box_settings, HTTP %d\n", httpCode);
  }
  http.end();
}

// =====================================================================
// LOGIKA KIPAS (histeresis, sama seperti di dashboard)
// =====================================================================

void jalankanLogikaKipas() {
  if (fanMode == "manual") {
    fanState = fanManualOn;
  } else {
    float suhu   = dht.readTemperature();
    int rawMS1100 = analogRead(MS1100_PIN);
    float voc    = map(rawMS1100, 0, 4095, 0, 1000);

    if (isnan(suhu)) return;

    bool haruNyala = (suhu > suhuMax) || (voc > vocMax);
    bool haruMati  = (suhu < suhuMax - 1.2) && (voc < vocMax - 40);

    if (haruNyala) fanState = true;
    else if (haruMati) fanState = false;
    // kalau di antara dua kondisi itu, biarkan fanState seperti sebelumnya (histeresis)
  }

  digitalWrite(FAN_PIN, fanState ? HIGH : LOW);
}
