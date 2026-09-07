import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import {
  Thermometer,
  Droplets,
  Wind,
  Fan,
  Sparkles,
  RefreshCw,
  Settings2,
  ChevronRight,
  Database,
  Clock,
  Radio,
  TrendingUp,
  TrendingDown,
  Minus,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  Camera,
  RotateCw,
  ShieldAlert,
  Wifi,
  WifiOff,
  Bell,
  BellOff,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Konstanta & util
// ---------------------------------------------------------------------------

const METRICS = {
  suhu: {
    label: "Suhu",
    unit: "°C",
    icon: Thermometer,
    color: "#ff9466",
    glow: "rgba(255,148,102,0.35)",
    bounds: [10, 45],
    key: "suhu",
  },
  lembap: {
    label: "Kelembapan",
    unit: "%",
    icon: Droplets,
    color: "#5ec8d8",
    glow: "rgba(94,200,216,0.35)",
    bounds: [20, 95],
    key: "lembap",
  },
  voc: {
    label: "VOC (MS-1100)",
    unit: "ppm",
    icon: Wind,
    color: "#b79cff",
    glow: "rgba(183,156,255,0.35)",
    bounds: [0, 1000],
    key: "voc",
  },
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function nextWalk(value, bounds, step, excursionChance = 0.02) {
  let v = value + (Math.random() - 0.5) * step;
  if (Math.random() < excursionChance) {
    v += (Math.random() - 0.5) * step * 8;
  }
  return clamp(v, bounds[0], bounds[1]);
}

function statusOf(value, min, max) {
  if (value < min) return "rendah";
  if (value > max) return "tinggi";
  return "ideal";
}

const statusColor = {
  ideal: "#6ee7b7",
  rendah: "#5ec8d8",
  tinggi: "#fb7185",
};

const statusLabel = {
  ideal: "Ideal",
  rendah: "Di bawah target",
  tinggi: "Di atas target",
};

function formatClock(d) {
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatHM(d) {
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatFullDate(d) {
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatRelative(seconds) {
  if (seconds == null) return "belum ada data";
  if (seconds < 5) return "baru saja";
  if (seconds < 60) return `${seconds} detik lalu`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  return `${Math.floor(seconds / 3600)} jam lalu`;
}

// perkiraan kasar ukuran per baris (id + 3 kolom float8 + timestamp + overhead tuple Postgres).
// angka pasti tergantung index & TOAST, jadi ini hanya estimasi, bukan angka resmi dari Supabase.
const BYTES_PER_ROW_ESTIMATE = 140;

function formatBytes(rows) {
  if (rows == null) return null;
  const mb = (rows * BYTES_PER_ROW_ESTIMATE) / (1024 * 1024);
  if (mb < 0.01) return "< 0.01 MB";
  return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
}

// ---------------------------------------------------------------------------
// Sub-komponen: Ring gauge
// ---------------------------------------------------------------------------

function RingGauge({ value, min, max, boundsMin, boundsMax, color, size = 108 }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = clamp((value - boundsMin) / (boundsMax - boundsMin), 0, 1);
  const dash = pct * circumference;

  const rangeStartPct = clamp((min - boundsMin) / (boundsMax - boundsMin), 0, 1);
  const rangeEndPct = clamp((max - boundsMin) / (boundsMax - boundsMin), 0, 1);
  const rangeDash = (rangeEndPct - rangeStartPct) * circumference;
  const rangeOffset = -rangeStartPct * circumference;

  const filterId = `glow-${color.replace("#", "")}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      <defs>
        <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Rotasi -90° dilakukan di sini (koordinat SVG murni), BUKAN lewat CSS transform
          di elemen <svg>. Ini supaya titik pusat rotasi selalu pasti di (cx, cy), tidak
          tergantung cara browser menghitung transform-origin saat ada filter dengan
          area yang diperluas (kombinasi itu pernah bikin ring terlihat sedikit geser
          dari pusat di beberapa browser). */}
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {/* Arc nilai sengaja digambar SIMETRIS dari titik atas (bukan menyapu searah jarum jam):
            strokeDashoffset={dash/2} menggeser separuh panjang arc ke sisi berlawanan, jadi
            arc tumbuh ke kiri & kanan secara merata dari atas. */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(110,231,183,0.28)"
          strokeWidth={stroke}
          strokeDasharray={`${rangeDash} ${circumference - rangeDash}`}
          strokeDashoffset={rangeOffset}
          strokeLinecap="round"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={dash / 2}
          strokeLinecap="round"
          filter={`url(#${filterId})`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease" }}
        />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-komponen: dual range slider (dua thumb, satu track)
// ---------------------------------------------------------------------------

function DualRange({ boundsMin, boundsMax, min, max, color, onChange, step = 1 }) {
  const pctMin = ((min - boundsMin) / (boundsMax - boundsMin)) * 100;
  const pctMax = ((max - boundsMin) / (boundsMax - boundsMin)) * 100;

  return (
    <div className="relative h-5 select-none">
      <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{ left: `${pctMin}%`, right: `${100 - pctMax}%`, background: color, boxShadow: `0 0 10px ${color}` }}
      />
      <input
        type="range"
        min={boundsMin}
        max={boundsMax}
        step={step}
        value={min}
        onChange={(e) => onChange(Math.min(Number(e.target.value), max - step), max)}
        className="dual-thumb absolute w-full"
        style={{ "--thumb-color": color }}
      />
      <input
        type="range"
        min={boundsMin}
        max={boundsMax}
        step={step}
        value={max}
        onChange={(e) => onChange(min, Math.max(Number(e.target.value), min + step))}
        className="dual-thumb absolute w-full"
        style={{ "--thumb-color": color }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel wrapper (kaca)
// ---------------------------------------------------------------------------

function Glass({ children, className = "" }) {
  return (
    <div
      className={`relative rounded-[28px] border border-white/10 bg-white/[0.05] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.35)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-br from-white/[0.08] to-transparent" />
      <div className="relative">{children}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, sub, action }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 px-6 pt-5">
      <div className="flex items-center gap-2.5">
        {Icon && <Icon size={17} strokeWidth={2} className="text-white/60" />}
        <div>
          <h3 className="text-[15px] font-medium text-white/90" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {title}
          </h3>
          {sub && <p className="text-[12.5px] text-white/40 mt-0.5">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI insight generator (rule-based, gaya bahasa bervariasi)
// ---------------------------------------------------------------------------

function buildInsights(current, thresholds, fanOn, fanMode, seedTick) {
  const items = [];
  const s = statusOf(current.suhu, thresholds.suhuMin, thresholds.suhuMax);
  const l = statusOf(current.lembap, thresholds.lembapMin, thresholds.lembapMax);
  const v = statusOf(current.voc, thresholds.vocMin, thresholds.vocMax);
  const r = (arr) => arr[seedTick % arr.length];

  if (s === "tinggi") {
    items.push({
      tone: "tinggi",
      text: r([
        `Suhu ${current.suhu.toFixed(1)}°C melewati ambang atas ${thresholds.suhuMax}°C. ${fanMode === "auto" ? "Kipas otomatis sudah aktif untuk menurunkannya." : "Pertimbangkan menyalakan kipas secara manual."}`,
        `Box sedikit lebih panas dari target. Kalau tren ini berlanjut 10 menit lagi, cek ventilasi atau posisi box dari sumber panas.`,
      ]),
    });
  } else if (s === "rendah") {
    items.push({
      tone: "rendah",
      text: `Suhu ${current.suhu.toFixed(1)}°C berada di bawah ambang bawah ${thresholds.suhuMin}°C. Kipas sebaiknya nonaktif dulu agar suhu naik ke rentang ideal.`,
    });
  }

  if (v === "tinggi") {
    items.push({
      tone: "tinggi",
      text: r([
        `Kadar VOC ${Math.round(current.voc)} ppm di atas batas ${thresholds.vocMax} ppm. Sirkulasi udara perlu ditingkatkan, kipas jadi prioritas meski suhu masih normal.`,
        `Udara dalam box mulai pekat (${Math.round(current.voc)} ppm). Ini bisa dipicu kelembapan tinggi atau bahan organik di dalam — cek isi box.`,
      ]),
    });
  }

  if (l === "tinggi" && v !== "tinggi") {
    items.push({
      tone: "tinggi",
      text: `Kelembapan ${current.lembap.toFixed(0)}% di atas target. Kelembapan tinggi berkepanjangan sering memicu lonjakan VOC — pantau grafik VOC beberapa menit ke depan.`,
    });
  } else if (l === "rendah") {
    items.push({
      tone: "rendah",
      text: `Kelembapan ${current.lembap.toFixed(0)}% di bawah target ${thresholds.lembapMin}%. Kalau box menyimpan bahan yang sensitif terhadap udara kering, pertimbangkan menambah sumber kelembapan.`,
    });
  }

  if (items.length === 0) {
    items.push({
      tone: "ideal",
      text: r([
        "Semua parameter berada dalam rentang ideal. Tidak ada tindakan yang perlu diambil sekarang.",
        "Kondisi box stabil selama beberapa menit terakhir — konfigurasi threshold saat ini sudah cocok.",
      ]),
    });
  }

  items.push({
    tone: "info",
    text: `Kipas saat ini ${fanOn ? "menyala" : "mati"} (mode ${fanMode === "auto" ? "otomatis" : "manual"}).`,
  });

  return items;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const HISTORY_LEN = 40;

const DEFAULT_THRESHOLDS = {
  suhuMin: 22,
  suhuMax: 30,
  lembapMin: 40,
  lembapMax: 70,
  vocMin: 0,
  vocMax: 400,
};

export default function App() {
  const [now, setNow] = useState(new Date());
  const [current, setCurrent] = useState({ suhu: 26.5, lembap: 58, voc: 180 });
  const [history, setHistory] = useState(() => {
    const arr = [];
    let s = 26.5,
      l = 58,
      v = 180;
    const nowMs = Date.now();
    for (let i = 0; i < HISTORY_LEN; i++) {
      s = nextWalk(s, METRICS.suhu.bounds, 1.2, 0.01);
      l = nextWalk(l, METRICS.lembap.bounds, 2.5, 0.01);
      v = nextWalk(v, METRICS.voc.bounds, 25, 0.02);
      arr.push({ t: i, time: nowMs - (HISTORY_LEN - 1 - i) * 2200, suhu: s, lembap: l, voc: v });
    }
    return arr;
  });

  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  const [fanMode, setFanMode] = useState("auto"); // auto | manual
  const [fanManualOn, setFanManualOn] = useState(false);
  const fanOnRef = useRef(false);
  const [fanOn, setFanOn] = useState(false);

  const [activeTab, setActiveTab] = useState("suhu");

  const [tick, setTick] = useState(0);
  const [insights, setInsights] = useState([]);

  const [lastUpdate, setLastUpdate] = useState(null);
  const [rowCount, setRowCount] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // ticker 1 detik untuk teks waktu relatif ("12 detik lalu") dan cek status online/offline
  useEffect(() => {
    const id = setInterval(() => {
      setNowTick(Date.now());
      setNow(new Date());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const secondsSinceUpdate = lastUpdate ? Math.floor((nowTick - lastUpdate.getTime()) / 1000) : null;

  // konfigurasi Supabase. Default diambil dari env (.env / Environment Variables Vercel),
  // tapi tetap bisa ditimpa manual dari panel pengaturan di topbar.
  const [supaOpen, setSupaOpen] = useState(false);
  const [supaUrl, setSupaUrl] = useState(import.meta.env.VITE_SUPABASE_URL || "");
  const [supaKey, setSupaKey] = useState(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
  const [supaStatus, setSupaStatus] = useState("idle"); // idle | ok | error
  const supaConfigured = Boolean(supaUrl.trim() && supaKey.trim());

  const supabase = useMemo(
    () => (supaConfigured ? createClient(supaUrl.trim(), supaKey.trim()) : null),
    [supaConfigured, supaUrl, supaKey]
  );

  // ------ OTA firmware ------
  // Dua device beda punya baris masing-masing di tabel ota_firmware, supaya
  // firmware satu board gak nyasar coba di-flash ke board yang lain.
  const OTA_TARGETS = {
    sensor: { id: 1, label: "ESP32 (Sensor + Kipas)", storagePath: "firmware-sensor.bin" },
    cam: { id: 2, label: "ESP32-CAM", storagePath: "firmware-cam.bin" },
  };
  const [otaTarget, setOtaTarget] = useState("sensor");
  const [otaInfo, setOtaInfo] = useState(null); // { version, url, notes, uploaded_at }
  const [otaFile, setOtaFile] = useState(null);
  const [otaVersion, setOtaVersion] = useState("");
  const [otaNotes, setOtaNotes] = useState("");
  const [otaStatus, setOtaStatus] = useState("idle"); // idle | uploading | success | error
  const [otaError, setOtaError] = useState("");

  // gerbang PIN sebelum panel upload OTA bisa dipakai. Pengecekan PIN dilakukan
  // di Edge Function Supabase (server), BUKAN di sini — jadi PIN aslinya tidak
  // pernah dikirim ke atau tersimpan di kode frontend/browser.
  const [otaUnlocked, setOtaUnlocked] = useState(false);
  const [otaPinInput, setOtaPinInput] = useState("");
  const [otaPinError, setOtaPinError] = useState(false);
  const [otaChecking, setOtaChecking] = useState(false);

  const handleUnlockOta = async () => {
    if (!supabase || !otaPinInput.trim()) return;
    setOtaChecking(true);
    setOtaPinError(false);
    try {
      const { data, error } = await supabase.functions.invoke("check-ota-pin", {
        body: { pin: otaPinInput.trim() },
      });
      if (!error && data?.ok) {
        setOtaUnlocked(true);
      } else {
        setOtaPinError(true);
      }
    } catch {
      setOtaPinError(true);
    } finally {
      setOtaChecking(false);
    }
  };

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setOtaInfo(null);
    supabase
      .from("ota_firmware")
      .select("version,url,notes,uploaded_at")
      .eq("id", OTA_TARGETS[otaTarget].id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setOtaInfo(data);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, otaStatus, otaTarget]);

  const handleOtaUpload = async () => {
    if (!supabase || !otaFile || !otaVersion.trim()) return;
    setOtaStatus("uploading");
    setOtaError("");
    try {
      const target = OTA_TARGETS[otaTarget];
      const { error: uploadError } = await supabase.storage
        .from("firmware")
        .upload(target.storagePath, otaFile, { upsert: true, contentType: "application/octet-stream" });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from("firmware").getPublicUrl(target.storagePath);
      const { error: dbError } = await supabase.from("ota_firmware").upsert({
        id: target.id,
        version: otaVersion.trim(),
        url: `${pub.publicUrl}?t=${Date.now()}`, // cache-bust supaya ESP32 selalu ambil versi terbaru
        notes: otaNotes.trim(),
        uploaded_at: new Date().toISOString(),
      });
      if (dbError) throw dbError;

      setOtaStatus("success");
      setOtaFile(null);
      setOtaVersion("");
      setOtaNotes("");
    } catch (err) {
      setOtaStatus("error");
      setOtaError(err.message || "Gagal upload firmware");
    }
  };

  // ------ Update WiFi jarak jauh ------
  // Sama seperti OTA: satu baris per device di wifi_config (id=1 sensor, id=2 cam).
  // Device polling tabel ini sendiri; dashboard cuma menulis, tidak pernah menampilkan
  // password yang tersimpan kembali ke layar (write-only dari sisi UI).
  const WIFI_TARGETS = {
    sensor: { id: 1, label: "ESP32 (Sensor + Kipas)" },
    cam: { id: 2, label: "ESP32-CAM" },
  };
  const [wifiTarget, setWifiTarget] = useState("sensor");
  const [wifiInfo, setWifiInfo] = useState(null); // { ssid, updated_at } — password sengaja tidak diambil
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiStatus, setWifiStatus] = useState("idle"); // idle | saving | success | error
  const [wifiError, setWifiError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setWifiInfo(null);
    supabase
      .from("wifi_config")
      .select("ssid,updated_at")
      .eq("id", WIFI_TARGETS[wifiTarget].id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setWifiInfo(data);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, wifiStatus, wifiTarget]);

  const handleWifiSave = async () => {
    if (!supabase || !wifiSsid.trim() || !wifiPassword.trim()) return;
    setWifiStatus("saving");
    setWifiError("");
    try {
      const { error } = await supabase.from("wifi_config").upsert({
        id: WIFI_TARGETS[wifiTarget].id,
        ssid: wifiSsid.trim(),
        password: wifiPassword,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setWifiStatus("success");
      setWifiSsid("");
      setWifiPassword("");
    } catch (err) {
      setWifiStatus("error");
      setWifiError(err.message || "Gagal menyimpan konfigurasi WiFi");
    }
  };

  // riwayat percobaan ganti WiFi (berhasil/gagal-rollback), per device yang dipilih di tab
  const [wifiHistory, setWifiHistory] = useState([]);

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from("wifi_history")
      .select("ssid_dicoba,berhasil,ssid_aktif,created_at")
      .eq("device_id", WIFI_TARGETS[wifiTarget].id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setWifiHistory(data || []));

    const channel = supabase
      .channel("wifi-history-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wifi_history" },
        (payload) => {
          if (payload.new.device_id === WIFI_TARGETS[wifiTarget].id) {
            setWifiHistory((h) => [payload.new, ...h].slice(0, 5));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, wifiTarget]);

  // ------ Status online/offline ESP32-CAM (heartbeat tiap 10 detik) ------
  const [camLastSeen, setCamLastSeen] = useState(null);
  const CAM_ONLINE_THRESHOLD_SEC = 30; // heartbeat tiap 10 detik, kasih margin 3x lipat

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from("camera_status")
      .select("last_seen")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.last_seen) setCamLastSeen(new Date(data.last_seen));
      });

    const channel = supabase
      .channel("camera-status-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "camera_status" },
        (payload) => {
          if (payload.new?.last_seen) setCamLastSeen(new Date(payload.new.last_seen));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const camOnline =
    supaConfigured && camLastSeen ? (nowTick - camLastSeen.getTime()) / 1000 < CAM_ONLINE_THRESHOLD_SEC : false;

  // ------ Snapshot kamera (akses dari mana saja, tanpa port forwarding/Tailscale) ------
  const [latestSnapshot, setLatestSnapshot] = useState(null); // { url, source, captured_at }
  const [snapshotHistory, setSnapshotHistory] = useState([]); // hasil filter saat ini, terbaru dulu
  const [snapshotWaiting, setSnapshotWaiting] = useState(false);
  const [snapshotTimedOut, setSnapshotTimedOut] = useState(false);
  const [snapshotViewing, setSnapshotViewing] = useState(null); // snapshot yang lagi dilihat gede
  const snapshotRequestedAtRef = useRef(null);

  const SNAPSHOT_HISTORY_LIMIT = 16; // dipakai kalau filter = "latest" (tanpa rentang tanggal)

  // filter riwayat: "latest" (16 terakhir) | "1"/"3"/"7" (n hari terakhir) | "date" (tanggal tertentu)
  const [snapshotFilterMode, setSnapshotFilterMode] = useState("latest");
  const [snapshotFilterDate, setSnapshotFilterDate] = useState("");

  const snapshotInCurrentFilter = useCallback(
    (item) => {
      const t = new Date(item.captured_at).getTime();
      if (snapshotFilterMode === "latest") return true;
      if (snapshotFilterMode === "date") {
        if (!snapshotFilterDate) return false;
        const d = new Date(item.captured_at);
        const [y, m, dd] = snapshotFilterDate.split("-").map(Number);
        return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === dd;
      }
      const days = Number(snapshotFilterMode);
      return Date.now() - t <= days * 24 * 60 * 60 * 1000;
    },
    [snapshotFilterMode, snapshotFilterDate]
  );

  const fetchSnapshotHistory = useCallback(async () => {
    if (!supabase) return;
    let query = supabase
      .from("camera_snapshots")
      .select("url,source,captured_at")
      .order("captured_at", { ascending: false });

    if (snapshotFilterMode === "date" && snapshotFilterDate) {
      const start = `${snapshotFilterDate}T00:00:00`;
      const end = `${snapshotFilterDate}T23:59:59.999`;
      query = query.gte("captured_at", start).lte("captured_at", end);
    } else if (snapshotFilterMode !== "latest") {
      const days = Number(snapshotFilterMode);
      const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("captured_at", start).limit(300);
    } else {
      query = query.limit(SNAPSHOT_HISTORY_LIMIT);
    }

    const { data } = await query;
    setSnapshotHistory(data || []);
  }, [supabase, snapshotFilterMode, snapshotFilterDate]);

  useEffect(() => {
    fetchSnapshotHistory();
  }, [fetchSnapshotHistory]);

  useEffect(() => {
    if (!supabase) return;

    // ambil foto TERBARU secara umum (independen dari filter), untuk tampilan utama
    supabase
      .from("camera_snapshots")
      .select("url,source,captured_at")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setLatestSnapshot(data);
      });

    const channel = supabase
      .channel("camera-snapshots-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "camera_snapshots" },
        (payload) => {
          setLatestSnapshot(payload.new);
          if (snapshotInCurrentFilter(payload.new)) {
            const cap = snapshotFilterMode === "latest" ? SNAPSHOT_HISTORY_LIMIT : 300;
            setSnapshotHistory((h) => [payload.new, ...h].slice(0, cap));
          }
          setSnapshotWaiting(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, snapshotInCurrentFilter, snapshotFilterMode]);

  const handleCaptureNow = async () => {
    if (!supabase) return;
    const requestTime = new Date().toISOString();
    snapshotRequestedAtRef.current = requestTime;
    setSnapshotWaiting(true);
    setSnapshotTimedOut(false);
    await supabase.from("camera_command").upsert({ id: 1, capture_requested_at: requestTime });
  };

  useEffect(() => {
    if (!snapshotWaiting) return;
    const id = setTimeout(() => {
      setSnapshotWaiting(false);
      setSnapshotTimedOut(true);
    }, 60000); // 1 menit — kalau ESP32-CAM offline/gak sempat polling, jangan stuck loading terus
    return () => clearTimeout(id);
  }, [snapshotWaiting]);

  // simulasi data real-time (dipakai saat Supabase belum dikonfigurasi)
  useEffect(() => {
    if (supaConfigured) return;
    const id = setInterval(() => {
      setNow(new Date());
      setCurrent((prev) => {
        const next = {
          suhu: nextWalk(prev.suhu, METRICS.suhu.bounds, 1.1, 0.02),
          lembap: nextWalk(prev.lembap, METRICS.lembap.bounds, 2.2, 0.02),
          voc: nextWalk(prev.voc, METRICS.voc.bounds, 22, 0.025),
        };

        // logika kipas: histeresis sederhana berbasis suhu & VOC
        setThresholds((th) => {
          setFanOn((prevFanOn) => {
            if (fanMode === "manual") return fanManualOn;
            const shouldOn = next.suhu > th.suhuMax || next.voc > th.vocMax;
            const shouldOff = next.suhu < th.suhuMax - 1.2 && next.voc < th.vocMax - 40;
            if (shouldOn) return true;
            if (shouldOff) return false;
            return prevFanOn;
          });
          return th;
        });

        setHistory((h) => {
          const point = { t: h[h.length - 1].t + 1, time: Date.now(), ...next };
          return [...h.slice(1), point];
        });
        return next;
      });
      setLastUpdate(new Date());
      setTick((t) => t + 1);
    }, 2200);
    return () => clearInterval(id);
  }, [fanMode, fanManualOn, supaConfigured]);

  // ambil histori awal + berlangganan perubahan realtime dari Supabase
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    async function loadHistory() {
      const { data, error } = await supabase
        .from("sensor_readings")
        .select("suhu,lembap,voc,created_at")
        .order("created_at", { ascending: false })
        .limit(HISTORY_LEN);

      if (cancelled) return;
      if (error || !data?.length) {
        setSupaStatus(error ? "error" : "idle");
        return;
      }
      const ordered = [...data].reverse();
      setHistory(
        ordered.map((r, i) => ({ t: i, time: new Date(r.created_at).getTime(), suhu: r.suhu, lembap: r.lembap, voc: r.voc }))
      );
      setCurrent(ordered[ordered.length - 1]);
      setLastUpdate(new Date(ordered[ordered.length - 1].created_at));
      setSupaStatus("ok");
    }
    loadHistory();

    // realtime: dorong langsung ke UI setiap ESP32 insert baris baru, tanpa polling
    const channel = supabase
      .channel("sensor-readings-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_readings" },
        (payload) => {
          const next = payload.new;
          setNow(new Date());
          setCurrent(next);
          setLastUpdate(new Date(next.created_at));
          setHistory((h) => {
            const last = h[h.length - 1];
            const point = {
              t: (last?.t ?? 0) + 1,
              time: new Date(next.created_at).getTime(),
              suhu: next.suhu,
              lembap: next.lembap,
              voc: next.voc,
            };
            return [...h.slice(1), point];
          });
          setThresholds((th) => {
            setFanOn((prevFanOn) => {
              if (fanMode === "manual") return fanManualOn;
              const shouldOn = next.suhu > th.suhuMax || next.voc > th.vocMax;
              const shouldOff = next.suhu < th.suhuMax - 1.2 && next.voc < th.vocMax - 40;
              if (shouldOn) return true;
              if (shouldOff) return false;
              return prevFanOn;
            });
            return th;
          });
          setSupaStatus("ok");
          setTick((t) => t + 1);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSupaStatus("error");
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, fanMode, fanManualOn]);

  // kirim threshold & mode kipas ke tabel box_settings, supaya ESP32 bisa membacanya
  // dan menjalankan kipas secara lokal (tidak bergantung pada koneksi internet saat itu juga)
  useEffect(() => {
    if (!supabase) return;
    const id = setTimeout(() => {
      supabase
        .from("box_settings")
        .upsert({
          id: 1,
          suhumin: thresholds.suhuMin,
          suhumax: thresholds.suhuMax,
          lembapmin: thresholds.lembapMin,
          lembapmax: thresholds.lembapMax,
          vocmin: thresholds.vocMin,
          vocmax: thresholds.vocMax,
          fan_mode: fanMode,
          fan_manual_on: fanManualOn,
        })
        .then(({ error }) => {
          if (error) setSupaStatus("error");
        });
    }, 500);
    return () => clearTimeout(id);
  }, [supabase, thresholds, fanMode, fanManualOn]);

  // rekomendasi AI mengikuti data & threshold
  useEffect(() => {
    setInsights(buildInsights(current, thresholds, fanOn, fanMode, tick));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(current.suhu * 2), Math.round(current.lembap), Math.round(current.voc / 5), thresholds, fanOn, fanMode]);

  const refreshInsights = useCallback(() => {
    setInsights(buildInsights(current, thresholds, fanOn, fanMode, tick + Math.floor(Math.random() * 5)));
  }, [current, thresholds, fanOn, fanMode, tick]);

  // hitung jumlah baris di sensor_readings untuk memperkirakan pemakaian database
  useEffect(() => {
    if (!supabase) {
      setRowCount(null);
      return;
    }
    let cancelled = false;

    async function fetchCount() {
      const { count, error } = await supabase
        .from("sensor_readings")
        .select("*", { count: "exact", head: true });
      if (!cancelled && !error && typeof count === "number") setRowCount(count);
    }
    fetchCount();
    const id = setInterval(fetchCount, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [supabase]);

  // status online/offline: demo selalu online (disimulasikan lokal),
  // sedangkan mode Supabase dianggap offline kalau tidak ada data baru > 30 detik
  const deviceOnline = supaConfigured
    ? supaStatus !== "error" && secondsSinceUpdate !== null && secondsSinceUpdate < 30
    : true;

  const setThreshold = (patch) => setThresholds((t) => ({ ...t, ...patch }));

  // ------ Deteksi kebusukan buah (VOC = indikator utama, suhu & kelembapan = faktor pemicu) ------
  // Pakai rentang aman (min-max) per parameter — di luar rentang = jadi faktor risiko.
  const [busukThresholds, setBusukThresholds] = useState({
    vocMin: 0,
    vocMax: 500,
    suhuMin: 15,
    suhuMax: 30,
    lembapMin: 50,
    lembapMax: 85,
  });

  const BUSUK_COLOR = { ideal: "#6ee7b7", waspada: "#facc15", tinggi: "#fb7185" };

  const busukStatus = useMemo(() => {
    const { voc, suhu, lembap } = current;
    const { vocMax, suhuMin, suhuMax, lembapMin, lembapMax } = busukThresholds;

    if (voc > vocMax) {
      return { level: "tinggi", label: "Busuk", reason: `VOC ${Math.round(voc)} ppm sudah melewati ambang busuk (${vocMax} ppm).` };
    }
    const suhuDiluar = suhu < suhuMin || suhu > suhuMax;
    const lembapDiluar = lembap < lembapMin || lembap > lembapMax;
    if (suhuDiluar || lembapDiluar) {
      const sebab = [
        suhuDiluar ? `suhu ${suhu.toFixed(1)}°C di luar rentang ${suhuMin}–${suhuMax}°C` : null,
        lembapDiluar ? `kelembapan ${lembap.toFixed(0)}% di luar rentang ${lembapMin}–${lembapMax}%` : null,
      ].filter(Boolean).join(" dan ");
      return { level: "waspada", label: "Mulai Busuk", reason: `Kondisi mempercepat pembusukan: ${sebab}.` };
    }
    return { level: "ideal", label: "Segar", reason: "VOC, suhu, dan kelembapan masih dalam kondisi aman." };
  }, [current, busukThresholds]);

  const activeMetric = METRICS[activeTab];
  const activeMin = thresholds[`${activeTab}Min`];
  const activeMax = thresholds[`${activeTab}Max`];

  const chartData = useMemo(
    () => history.map((h) => ({ ...h, value: h[activeTab] })),
    [history, activeTab]
  );

  // Sumbu Y grafik dibuat menyesuaikan data yang benar-benar tampil (bukan dipatok ke
  // batas maksimal sensor), supaya naik-turun kecil tetap kelihatan jelas. Tetap
  // menyertakan rentang ideal (activeMin/activeMax) biar pita hijaunya selalu utuh
  // terlihat, dan dikunci di dalam batas fisik sensor (activeMetric.bounds).
  const yDomain = useMemo(() => {
    const values = chartData.map((d) => d.value).filter((v) => typeof v === "number" && !isNaN(v));
    if (values.length === 0) return activeMetric.bounds;

    const rawMin = Math.min(...values, activeMin);
    const rawMax = Math.max(...values, activeMax);
    const span = rawMax - rawMin;
    const pad = span > 0 ? span * 0.2 : Math.max(rawMax * 0.1, 5);

    const min = Math.max(activeMetric.bounds[0], Math.floor(rawMin - pad));
    const max = Math.min(activeMetric.bounds[1], Math.ceil(rawMax + pad));
    return min < max ? [min, max] : activeMetric.bounds;
  }, [chartData, activeMin, activeMax, activeMetric]);

  // ------ Peringatan: buah busuk / device offline ------
  const alerts = useMemo(() => {
    const list = [];
    if (busukStatus.level === "tinggi") {
      list.push({ key: "busuk", text: `Buah terdeteksi BUSUK — ${busukStatus.reason}` });
    }
    if (supaConfigured && !deviceOnline) {
      list.push({ key: "device-offline", text: "ESP32 (sensor + kipas) offline — tidak ada data baru." });
    }
    if (supaConfigured && camLastSeen && !camOnline) {
      list.push({ key: "cam-offline", text: "ESP32-CAM offline — heartbeat terakhir terlalu lama." });
    }
    return list;
  }, [busukStatus, supaConfigured, deviceOnline, camOnline, camLastSeen]);

  // notifikasi browser (opsional) — sekali per kejadian, bukan tiap render
  const [notifEnabled, setNotifEnabled] = useState(false);
  const notifiedRef = useRef(new Set());

  useEffect(() => {
    if (!notifEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    alerts.forEach((a) => {
      if (!notifiedRef.current.has(a.key)) {
        notifiedRef.current.add(a.key);
        new Notification("FreshRay", { body: a.text });
      }
    });
    // hapus tanda kalau alert sudah tidak aktif lagi, biar bisa notif ulang kalau kejadian lagi nanti
    const activeKeys = new Set(alerts.map((a) => a.key));
    notifiedRef.current.forEach((k) => {
      if (!activeKeys.has(k)) notifiedRef.current.delete(k);
    });
  }, [alerts, notifEnabled]);

  const handleEnableNotif = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifEnabled(perm === "granted");
  };

  return (
    <div
      className="min-h-screen w-full text-white pb-16"
      style={{
        fontFamily: "'Inter', sans-serif",
        background:
          "radial-gradient(1200px 600px at 15% -10%, rgba(94,200,216,0.16), transparent 60%), radial-gradient(1000px 700px at 100% 0%, rgba(183,156,255,0.14), transparent 55%), linear-gradient(180deg, #070b14 0%, #0a1220 45%, #0b1626 100%)",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

        input.dual-thumb {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          height: 20px;
          margin: 0;
          pointer-events: none;
        }
        input.dual-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--thumb-color, #fff);
          border: 2px solid rgba(8,12,20,0.9);
          box-shadow: 0 0 8px var(--thumb-color, #fff);
          cursor: pointer;
          margin-top: 0;
        }
        input.dual-thumb::-moz-range-thumb {
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--thumb-color, #fff);
          border: 2px solid rgba(8,12,20,0.9);
          box-shadow: 0 0 8px var(--thumb-color, #fff);
          cursor: pointer;
        }
        input.dual-thumb::-webkit-slider-runnable-track { background: transparent; }
        input.dual-thumb::-moz-range-track { background: transparent; }

        input.single-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.1);
        }
        input.single-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--thumb-color, #fff);
          border: 2px solid rgba(8,12,20,0.9);
          box-shadow: 0 0 8px var(--thumb-color, #fff);
          cursor: pointer;
          margin-top: -5px;
        }
        input.single-thumb::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--thumb-color, #fff);
          border: 2px solid rgba(8,12,20,0.9);
          box-shadow: 0 0 8px var(--thumb-color, #fff);
          cursor: pointer;
        }
        input.single-thumb::-moz-range-track { background: transparent; }

        .tabular { font-variant-numeric: tabular-nums; }
      `}</style>

      {/* topbar */}
      <div className="mx-auto max-w-[1360px] px-6 pt-6">
        <Glass className="px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-cyan-300/40 to-violet-400/40 border border-white/15 flex items-center justify-center">
                <Sparkles size={16} className="text-white/85" />
              </div>
              <div>
                <div className="text-[16px] font-semibold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  FreshRay
                </div>
                <div className="text-[12px] text-white/40 -mt-0.5">Kendali iklim box · ESP32</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[13px] text-white/55 flex-wrap justify-end">
              {supaConfigured ? (
                <div
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 border"
                  style={{
                    color: supaStatus === "error" ? "#fb7185" : "#6ee7b7",
                    borderColor: supaStatus === "error" ? "rgba(251,113,133,0.25)" : "rgba(110,231,183,0.2)",
                    background: supaStatus === "error" ? "rgba(251,113,133,0.08)" : "rgba(110,231,183,0.08)",
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                  {supaStatus === "error" ? "Gagal menghubungi Supabase" : "Tersambung ke Supabase"}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-white/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  Mode demo (data simulasi)
                </div>
              )}
              <button
                onClick={handleEnableNotif}
                className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
                title={notifEnabled ? "Notifikasi browser aktif" : "Aktifkan notifikasi browser"}
              >
                {notifEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              </button>
              <button
                onClick={() => setSupaOpen((v) => !v)}
                className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
                title="Sumber data"
              >
                <Settings2 size={14} />
              </button>
              <div className="hidden sm:block text-right leading-tight">
                <div className="text-[13px] text-white/70">{formatFullDate(now)}</div>
                <div className="tabular text-[12px] text-white/40">{formatClock(now)}</div>
              </div>
            </div>
          </div>

          {supaOpen && (
            <div className="mt-4 pt-4 border-t border-white/10 grid sm:grid-cols-[1fr_1fr_auto] gap-2.5">
              <input
                value={supaUrl}
                onChange={(e) => setSupaUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-cyan-300/40"
              />
              <input
                value={supaKey}
                onChange={(e) => setSupaKey(e.target.value)}
                placeholder="Supabase anon key"
                type="password"
                className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-cyan-300/40"
              />
              <button
                onClick={() => setSupaOpen(false)}
                className="px-4 rounded-xl bg-white/10 border border-white/15 text-white/80 text-[13px] hover:bg-white/15 transition-colors"
              >
                Simpan
              </button>
              <p className="sm:col-span-3 text-[11.5px] text-white/30 leading-relaxed">
                Kosongkan untuk tetap memakai data simulasi. Kredensial ini cuma dipakai di sesi browser ini, tidak disimpan permanen.
              </p>
            </div>
          )}
        </Glass>
      </div>

      {/* peringatan busuk / device offline */}
      {alerts.length > 0 && (
        <div className="mx-auto max-w-[1360px] px-6 mt-5 flex flex-col gap-2.5">
          {alerts.map((a) => (
            <div
              key={a.key}
              className="flex items-center gap-2.5 rounded-2xl border px-5 py-3.5"
              style={{ borderColor: "rgba(251,113,133,0.3)", background: "rgba(251,113,133,0.1)" }}
            >
              <AlertTriangle size={16} className="text-rose-300 shrink-0" />
              <span className="text-[13px] text-rose-200">{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* status sistem */}
      <div className="mx-auto max-w-[1360px] px-6 mt-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Glass className="px-5 py-4 flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-2xl flex items-center justify-center border shrink-0"
            style={{
              borderColor: deviceOnline ? "rgba(110,231,183,0.3)" : "rgba(251,113,133,0.3)",
              background: deviceOnline ? "rgba(110,231,183,0.1)" : "rgba(251,113,133,0.1)",
            }}
          >
            <Radio size={16} style={{ color: deviceOnline ? "#6ee7b7" : "#fb7185" }} />
          </div>
          <div>
            <div className="text-[13px] text-white/45">Perangkat</div>
            <div className="text-[14.5px] font-medium" style={{ color: deviceOnline ? "#6ee7b7" : "#fb7185" }}>
              {deviceOnline ? "Online" : "Offline"}
            </div>
          </div>
        </Glass>

        <Glass className="px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 shrink-0">
            <Clock size={16} className="text-white/50" />
          </div>
          <div>
            <div className="text-[13px] text-white/45">Data terakhir masuk</div>
            <div className="text-[14.5px] font-medium text-white/85 tabular">
              {lastUpdate ? formatHM(lastUpdate) : "—"}
              <span className="text-white/35 font-normal ml-2 text-[12.5px]">
                {formatRelative(secondsSinceUpdate)}
              </span>
            </div>
          </div>
        </Glass>

        <Glass className="px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 shrink-0">
            <Database size={16} className="text-white/50" />
          </div>
          <div>
            <div className="text-[13px] text-white/45">Database terpakai</div>
            <div className="text-[14.5px] font-medium text-white/85 tabular">
              {supaConfigured
                ? rowCount != null
                  ? `± ${formatBytes(rowCount)} · ${rowCount.toLocaleString("id-ID")} baris`
                  : "menghitung…"
                : "— (mode demo)"}
            </div>
          </div>
        </Glass>
      </div>

      {/* hero metrics */}
      <div className="mx-auto max-w-[1360px] px-6 mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
        {Object.values(METRICS).map((m) => {
          const val = current[m.key];
          const min = thresholds[`${m.key}Min`];
          const max = thresholds[`${m.key}Max`];
          const st = statusOf(val, min, max);
          const Icon = m.icon;
          const decimals = m.key === "voc" ? 0 : 1;

          return (
            <Glass key={m.key} className="p-6 text-center">
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/50 text-[13px]">
                  <Icon size={15} />
                  {m.label}
                </div>
                <span
                  className="text-[11.5px] px-2.5 py-1 rounded-full border"
                  style={{
                    color: statusColor[st],
                    borderColor: `${statusColor[st]}40`,
                    background: `${statusColor[st]}14`,
                  }}
                >
                  {statusLabel[st]}
                </span>
              </div>

              <div className="relative mt-5 mx-auto w-[148px] h-[148px]">
                <RingGauge
                  value={val}
                  min={min}
                  max={max}
                  boundsMin={m.bounds[0]}
                  boundsMax={m.bounds[1]}
                  color={m.color}
                  size={148}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div
                    className="text-[30px] leading-none font-semibold tabular"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {val.toFixed(decimals)}
                  </div>
                  <div className="text-[12.5px] text-white/40 mt-1">{m.unit}</div>
                </div>
              </div>

              <div className="mt-5 text-[12.5px] text-white/40">
                Rentang ideal <span className="text-white/65 tabular">{min}–{max} {m.unit}</span>
              </div>
            </Glass>
          );
        })}
      </div>

      {/* chart + ai */}
      <div className="mx-auto max-w-[1360px] px-6 mt-5 grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
        <Glass>
          <SectionTitle
            title="Tren sensor"
            sub="Pembacaan langsung dengan pita rentang ideal"
            action={
              <div className="flex gap-1 rounded-full bg-white/5 border border-white/10 p-1">
                {Object.values(METRICS).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setActiveTab(m.key)}
                    className="px-3 py-1.5 rounded-full text-[12.5px] transition-colors"
                    style={{
                      background: activeTab === m.key ? `${m.color}22` : "transparent",
                      color: activeTab === m.key ? m.color : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {m.label.split(" ")[0]}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-4 pb-5 pt-3 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 18, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillMetric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeMetric.color} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={activeMetric.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  tickFormatter={(t) => formatHM(new Date(t))}
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  allowDecimals={false}
                />
                <ReferenceArea y1={activeMin} y2={activeMax} fill="#6ee7b7" fillOpacity={0.07} stroke="none" />
                <Tooltip
                  contentStyle={{
                    background: "rgba(10,16,28,0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    fontSize: 12.5,
                  }}
                  labelFormatter={(label) => formatClock(new Date(label))}
                  formatter={(v) => [`${v.toFixed(1)} ${activeMetric.unit}`, activeMetric.label]}
                />
                <Area type="monotone" dataKey="value" stroke={activeMetric.color} strokeWidth={2.2} fill="url(#fillMetric)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Glass>

        <Glass>
          <SectionTitle
            icon={Sparkles}
            title="Rekomendasi AI"
            sub="Analisis kondisi box saat ini"
            action={
              <button
                onClick={refreshInsights}
                className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
                title="Segarkan analisis"
              >
                <RefreshCw size={14} />
              </button>
            }
          />
          <div className="px-6 py-5 flex flex-col gap-3">
            {insights.map((it, i) => (
              <div key={i} className="flex gap-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] px-4 py-3">
                <span
                  className="mt-1 h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: it.tone === "info" ? "rgba(255,255,255,0.35)" : statusColor[it.tone] || "#6ee7b7" }}
                />
                <p className="text-[13.5px] leading-relaxed text-white/75">{it.text}</p>
              </div>
            ))}
          </div>
        </Glass>
      </div>

      {/* deteksi kebusukan buah + fan + threshold */}
      <div className="mx-auto max-w-[1360px] px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* deteksi kebusukan buah */}
        <Glass>
          <SectionTitle
            icon={ShieldAlert}
            title="Deteksi kebusukan buah"
            sub="Gabungan VOC, suhu & kelembapan"
          />
          <div className="px-6 pb-6 pt-3">
            <div
              className="rounded-2xl border px-5 py-6 text-center"
              style={{
                borderColor: `${BUSUK_COLOR[busukStatus.level]}40`,
                background: `${BUSUK_COLOR[busukStatus.level]}12`,
              }}
            >
              <div
                className="text-[22px] font-semibold"
                style={{ color: BUSUK_COLOR[busukStatus.level], fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {busukStatus.label}
              </div>
              <p className="text-[12.5px] text-white/50 mt-1.5">{busukStatus.reason}</p>
            </div>

            <div className="mt-5 flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[13px] text-white/70 flex items-center gap-2">
                    <Wind size={13} style={{ color: "#b79cff" }} />
                    Rentang VOC aman
                  </span>
                  <span className="text-[12.5px] text-white/45 tabular">
                    {busukThresholds.vocMin} – {busukThresholds.vocMax} ppm
                  </span>
                </div>
                <DualRange
                  boundsMin={0}
                  boundsMax={1000}
                  min={busukThresholds.vocMin}
                  max={busukThresholds.vocMax}
                  color="#b79cff"
                  step={10}
                  onChange={(newMin, newMax) => setBusukThresholds((t) => ({ ...t, vocMin: newMin, vocMax: newMax }))}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[13px] text-white/70 flex items-center gap-2">
                    <Thermometer size={13} style={{ color: "#ff9466" }} />
                    Rentang suhu aman
                  </span>
                  <span className="text-[12.5px] text-white/45 tabular">
                    {busukThresholds.suhuMin} – {busukThresholds.suhuMax} °C
                  </span>
                </div>
                <DualRange
                  boundsMin={10}
                  boundsMax={45}
                  min={busukThresholds.suhuMin}
                  max={busukThresholds.suhuMax}
                  color="#ff9466"
                  step={1}
                  onChange={(newMin, newMax) => setBusukThresholds((t) => ({ ...t, suhuMin: newMin, suhuMax: newMax }))}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[13px] text-white/70 flex items-center gap-2">
                    <Droplets size={13} style={{ color: "#5ec8d8" }} />
                    Rentang kelembapan aman
                  </span>
                  <span className="text-[12.5px] text-white/45 tabular">
                    {busukThresholds.lembapMin} – {busukThresholds.lembapMax} %
                  </span>
                </div>
                <DualRange
                  boundsMin={20}
                  boundsMax={95}
                  min={busukThresholds.lembapMin}
                  max={busukThresholds.lembapMax}
                  color="#5ec8d8"
                  step={1}
                  onChange={(newMin, newMax) => setBusukThresholds((t) => ({ ...t, lembapMin: newMin, lembapMax: newMax }))}
                />
              </div>
            </div>

            <p className="text-[11.5px] text-white/30 mt-4 leading-relaxed">
              VOC adalah indikator utama gas hasil pembusukan. Suhu dan kelembapan di luar rentang aman
              jadi faktor yang mempercepat proses itu — status "Mulai Busuk" muncul kalau suhu atau
              kelembapan keluar dari rentangnya, dan "Busuk" kalau VOC melewati batas atas rentangnya.
            </p>
          </div>
        </Glass>

        {/* fan */}
        <Glass>
          <SectionTitle icon={Fan} title="Kipas" sub="Kendali suhu box" />
          <div className="px-6 pb-6 pt-3">
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-11 w-11 rounded-full flex items-center justify-center border"
                  style={{
                    borderColor: fanOn ? "rgba(110,231,183,0.4)" : "rgba(255,255,255,0.1)",
                    background: fanOn ? "rgba(110,231,183,0.12)" : "transparent",
                  }}
                >
                  <Fan
                    size={20}
                    style={{
                      color: fanOn ? "#6ee7b7" : "rgba(255,255,255,0.35)",
                      animation: fanOn ? "spin 1.4s linear infinite" : "none",
                    }}
                  />
                </div>
                <div>
                  <div className="text-[14px] font-medium">{fanOn ? "Menyala" : "Mati"}</div>
                  <div className="text-[12px] text-white/40">
                    Mode {fanMode === "auto" ? "otomatis" : "manual"}
                  </div>
                </div>
              </div>
              {fanMode === "manual" && (
                <button
                  onClick={() => setFanManualOn((v) => !v)}
                  className="h-7 w-12 rounded-full relative transition-colors"
                  style={{ background: fanManualOn ? "rgba(110,231,183,0.35)" : "rgba(255,255,255,0.1)" }}
                >
                  <span
                    className="absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all"
                    style={{ left: fanManualOn ? "calc(100% - 26px)" : "2px" }}
                  />
                </button>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              {["auto", "manual"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFanMode(mode)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] border transition-colors"
                  style={{
                    background: fanMode === mode ? "rgba(255,255,255,0.08)" : "transparent",
                    borderColor: fanMode === mode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
                    color: fanMode === mode ? "white" : "rgba(255,255,255,0.45)",
                  }}
                >
                  {mode === "auto" ? "Otomatis" : "Manual"}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-white/30 mt-3 leading-relaxed">
              Pada mode otomatis, kipas menyala saat suhu melewati {thresholds.suhuMax}°C atau VOC melewati {thresholds.vocMax} ppm, dan mati setelah kembali ke rentang aman.
            </p>
          </div>
        </Glass>

        {/* threshold */}
        <Glass>
          <SectionTitle
            icon={Settings2}
            title="Rentang ideal"
            sub="Atur ambang tiap sensor"
            action={
              <button
                onClick={() => setThresholds(DEFAULT_THRESHOLDS)}
                className="h-8 px-3 rounded-full border border-white/10 bg-white/5 flex items-center gap-1.5 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors text-[12px]"
                title="Kembalikan ke rentang default"
              >
                <RefreshCw size={13} />
                Reset
              </button>
            }
          />
          <div className="px-6 pb-6 pt-3 flex flex-col gap-6">
            {Object.values(METRICS).map((m) => {
              const min = thresholds[`${m.key}Min`];
              const max = thresholds[`${m.key}Max`];
              return (
                <div key={m.key}>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[13px] text-white/70 flex items-center gap-2">
                      <m.icon size={13} style={{ color: m.color }} />
                      {m.label}
                    </span>
                    <span className="text-[12.5px] text-white/45 tabular">
                      {min} – {max} {m.unit}
                    </span>
                  </div>
                  <DualRange
                    boundsMin={m.bounds[0]}
                    boundsMax={m.bounds[1]}
                    min={min}
                    max={max}
                    color={m.color}
                    step={m.key === "voc" ? 10 : 1}
                    onChange={(newMin, newMax) =>
                      setThreshold({ [`${m.key}Min`]: newMin, [`${m.key}Max`]: newMax })
                    }
                  />
                </div>
              );
            })}
            <div className="flex items-center gap-1.5 text-[11.5px] text-white/30 pt-1">
              <ChevronRight size={13} />
              Perubahan diterapkan langsung ke logika kipas dan grafik
            </div>
          </div>
        </Glass>
      </div>

      {/* snapshot kamera (akses dari mana saja) */}
      <div className="mx-auto max-w-[1360px] px-6 mt-5">
        <Glass>
          <SectionTitle
            icon={Camera}
            title="Snapshot kamera"
            sub="Foto berkala tiap 30 menit — bisa diakses dari mana saja, tanpa port forwarding"
            action={
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-[11.5px]"
                  style={{
                    color: camOnline ? "#6ee7b7" : "#fb7185",
                    borderColor: camOnline ? "rgba(110,231,183,0.25)" : "rgba(251,113,133,0.25)",
                    background: camOnline ? "rgba(110,231,183,0.08)" : "rgba(251,113,133,0.08)",
                  }}
                  title={camLastSeen ? `Heartbeat terakhir ${formatClock(camLastSeen)}` : "Belum ada heartbeat"}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                  ESP32-CAM {camOnline ? "online" : "offline"}
                </div>
                <button
                  onClick={handleCaptureNow}
                  disabled={!supaConfigured || snapshotWaiting}
                  className="h-8 px-3 rounded-full border border-cyan-300/25 bg-cyan-300/15 flex items-center gap-1.5 text-cyan-200 hover:bg-cyan-300/25 transition-colors text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCw size={13} className={snapshotWaiting ? "animate-spin" : ""} />
                  {snapshotWaiting ? "Menunggu ESP32-CAM…" : "Ambil sekarang"}
                </button>
              </div>
            }
          />
          <div className="px-6 pb-6 pt-3">
            <div className="aspect-video rounded-2xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
              {snapshotViewing || latestSnapshot ? (
                <img
                  src={(snapshotViewing || latestSnapshot).url}
                  alt="Snapshot box"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center text-white/35 text-[13px] px-6">
                  <Camera size={26} className="mx-auto mb-2 opacity-60" />
                  {supaConfigured ? "Belum ada snapshot yang masuk." : "Sambungkan Supabase dulu untuk pakai fitur ini."}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[12.5px] text-white/40">
              <span>
                {snapshotViewing || latestSnapshot
                  ? `${formatClock(new Date((snapshotViewing || latestSnapshot).captured_at))} · ${
                      (snapshotViewing || latestSnapshot).source === "manual" ? "manual" : "otomatis"
                    }${snapshotViewing && latestSnapshot && snapshotViewing.captured_at !== latestSnapshot.captured_at ? " · sedang lihat riwayat" : ""}`
                  : "—"}
              </span>
              <div className="flex items-center gap-2">
                {snapshotTimedOut && <span className="text-rose-300">ESP32-CAM tidak merespons, coba lagi.</span>}
                {snapshotViewing && (
                  <button
                    onClick={() => setSnapshotViewing(null)}
                    className="text-cyan-300 hover:text-cyan-200 transition-colors"
                  >
                    Kembali ke terbaru
                  </button>
                )}
              </div>
            </div>

            {supaConfigured && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[
                  { key: "latest", label: "Terbaru" },
                  { key: "1", label: "1 hari" },
                  { key: "3", label: "3 hari" },
                  { key: "7", label: "7 hari" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setSnapshotFilterMode(f.key);
                      setSnapshotFilterDate("");
                    }}
                    className="px-3 py-1.5 rounded-full text-[12px] transition-colors"
                    style={{
                      background: snapshotFilterMode === f.key ? "rgba(94,200,216,0.18)" : "rgba(255,255,255,0.05)",
                      color: snapshotFilterMode === f.key ? "#5ec8d8" : "rgba(255,255,255,0.5)",
                      border: `1px solid ${snapshotFilterMode === f.key ? "rgba(94,200,216,0.3)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={snapshotFilterDate}
                  onChange={(e) => {
                    setSnapshotFilterDate(e.target.value);
                    setSnapshotFilterMode("date");
                  }}
                  className="px-3 py-1.5 rounded-full text-[12px] bg-white/5 border border-white/10 text-white/70 outline-none focus:border-cyan-300/40"
                  style={{ colorScheme: "dark" }}
                />
              </div>
            )}

            {snapshotHistory.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {snapshotHistory.map((snap, i) => (
                  <button
                    key={snap.captured_at + i}
                    onClick={() => setSnapshotViewing(snap)}
                    className="shrink-0 h-14 w-20 rounded-lg overflow-hidden border-2 transition-colors"
                    style={{
                      borderColor:
                        (snapshotViewing || latestSnapshot)?.captured_at === snap.captured_at
                          ? "rgba(94,200,216,0.8)"
                          : "rgba(255,255,255,0.1)",
                    }}
                    title={formatClock(new Date(snap.captured_at))}
                  >
                    <img src={snap.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : snapshotFilterMode !== "latest" ? (
              <div className="mt-3 text-[12.5px] text-white/30">Tidak ada snapshot pada rentang/tanggal ini.</div>
            ) : null}

            <p className="text-[11.5px] text-white/30 mt-2.5 leading-relaxed">
              ESP32-CAM ambil foto otomatis tiap 30 menit dan upload ke Supabase — jalan lewat internet
              biasa, tidak butuh port forwarding, Tailscale, atau berada di jaringan yang sama. Tombol
              "Ambil sekarang" minta ESP32-CAM memotret di luar jadwal itu. Klik salah satu thumbnail di
              bawah untuk lihat riwayat {SNAPSHOT_HISTORY_LIMIT} foto terakhir.
            </p>
          </div>
        </Glass>
      </div>

      {/* OTA firmware */}
      <div className="mx-auto max-w-[1360px] px-6 mt-5">
        <Glass>
          <SectionTitle
            icon={UploadCloud}
            title="Firmware ESP32 (OTA)"
            sub="Upload .bin, ESP32 mengambilnya sendiri lewat Supabase"
            action={
              <div className="flex gap-1 rounded-full bg-white/5 border border-white/10 p-1">
                {Object.entries(OTA_TARGETS).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => setOtaTarget(key)}
                    className="px-3 py-1.5 rounded-full text-[12px] transition-colors"
                    style={{
                      background: otaTarget === key ? "rgba(255,255,255,0.1)" : "transparent",
                      color: otaTarget === key ? "white" : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-6 pb-6 pt-3 grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-[12.5px] text-white/40 mb-1.5">
                Firmware aktif tercatat — {OTA_TARGETS[otaTarget].label}
              </div>
              {otaInfo ? (
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-4 py-3">
                  <div className="text-[14px] font-medium text-white/85">v{otaInfo.version}</div>
                  <div className="text-[12px] text-white/40 mt-0.5">
                    Diupload {otaInfo.uploaded_at ? formatHM(new Date(otaInfo.uploaded_at)) : "-"}
                  </div>
                  {otaInfo.notes && <div className="text-[12.5px] text-white/55 mt-2">{otaInfo.notes}</div>}
                </div>
              ) : (
                <div className="text-[13px] text-white/30">
                  {supaConfigured ? "Belum ada firmware yang pernah diupload untuk device ini." : "Sambungkan Supabase dulu untuk pakai fitur ini."}
                </div>
              )}
              <p className="text-[11.5px] text-white/30 mt-3 leading-relaxed">
                Ini cuma <b>catatan versi terbaru</b> di Supabase — bukan status firmware yang
                benar-benar jalan di device. Tiap device mengecek baris masing-masing (bukan saling
                ketuker), lalu download &amp; flash sendiri kalau versinya beda dari sketch yang jalan.
              </p>
            </div>

            <div>
              {!otaUnlocked ? (
                <div className="h-full flex flex-col items-center justify-center text-center rounded-2xl bg-white/[0.04] border border-white/[0.06] px-5 py-8">
                  <div className="h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                    <Lock size={16} className="text-white/50" />
                  </div>
                  <div className="text-[13px] text-white/70 mb-3">Masukkan PIN untuk membuka panel upload</div>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={otaPinInput}
                    onChange={(e) => {
                      setOtaPinInput(e.target.value);
                      setOtaPinError(false);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleUnlockOta()}
                    placeholder="PIN"
                    className="w-full max-w-[160px] text-center tracking-[0.3em] rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[15px] text-white/85 placeholder-white/25 outline-none focus:border-cyan-300/40"
                  />
                  <button
                    onClick={handleUnlockOta}
                    disabled={!supaConfigured || otaChecking || !otaPinInput.trim()}
                    className="mt-3 px-4 py-2 rounded-xl bg-cyan-300/15 border border-cyan-300/25 text-cyan-200 text-[13px] hover:bg-cyan-300/25 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Unlock size={13} />
                    {otaChecking ? "Memeriksa…" : "Buka"}
                  </button>
                  {otaPinError && (
                    <div className="mt-2.5 text-[12px] text-rose-300">PIN salah, coba lagi.</div>
                  )}
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept=".bin"
                    onChange={(e) => setOtaFile(e.target.files?.[0] || null)}
                    className="w-full text-[13px] text-white/70 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-white/10 file:text-white/80 file:text-[12.5px] hover:file:bg-white/15 rounded-xl bg-white/5 border border-white/10 px-3 py-2"
                  />
                  <input
                    value={otaVersion}
                    onChange={(e) => setOtaVersion(e.target.value)}
                    placeholder="Nomor versi, mis. 1.0.1"
                    className="w-full mt-2.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-cyan-300/40"
                  />
                  <textarea
                    value={otaNotes}
                    onChange={(e) => setOtaNotes(e.target.value)}
                    placeholder="Catatan perubahan (opsional)"
                    rows={2}
                    className="w-full mt-2.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-cyan-300/40 resize-none"
                  />
                  <button
                    onClick={handleOtaUpload}
                    disabled={!supaConfigured || !otaFile || !otaVersion.trim() || otaStatus === "uploading"}
                    className="mt-2.5 w-full py-2.5 rounded-xl bg-cyan-300/15 border border-cyan-300/25 text-cyan-200 text-[13px] hover:bg-cyan-300/25 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <UploadCloud size={14} />
                    {otaStatus === "uploading" ? "Mengupload…" : "Upload firmware"}
                  </button>

                  {otaStatus === "success" && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-emerald-300">
                      <CheckCircle2 size={13} /> Berhasil diupload, ESP32 akan mengambilnya di siklus cek berikutnya.
                    </div>
                  )}
                  {otaStatus === "error" && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-rose-300">
                      <AlertCircle size={13} /> {otaError}
                    </div>
                  )}
                  <p className="text-[11.5px] text-white/30 mt-2.5 leading-relaxed">
                    Naikkan <code>FIRMWARE_VERSION</code> di sketch ESP32 sebelum compile file .bin
                    yang mau diupload, supaya device bisa membedakan ini firmware baru atau bukan.
                  </p>
                </>
              )}
            </div>
          </div>
        </Glass>
      </div>

      {/* WiFi perangkat */}
      <div className="mx-auto max-w-[1360px] px-6 mt-5">
        <Glass>
          <SectionTitle
            icon={Wifi}
            title="WiFi perangkat"
            sub="Ganti SSID/password ESP32 dari jarak jauh"
            action={
              <div className="flex gap-1 rounded-full bg-white/5 border border-white/10 p-1">
                {Object.entries(WIFI_TARGETS).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => setWifiTarget(key)}
                    className="px-3 py-1.5 rounded-full text-[12px] transition-colors"
                    style={{
                      background: wifiTarget === key ? "rgba(255,255,255,0.1)" : "transparent",
                      color: wifiTarget === key ? "white" : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-6 pb-6 pt-3 grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-[12.5px] text-white/40 mb-1.5">
                WiFi tercatat sekarang — {WIFI_TARGETS[wifiTarget].label}
              </div>
              {wifiInfo ? (
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-4 py-3">
                  <div className="text-[14px] font-medium text-white/85">{wifiInfo.ssid}</div>
                  <div className="text-[12px] text-white/40 mt-0.5">
                    Diubah {wifiInfo.updated_at ? formatHM(new Date(wifiInfo.updated_at)) : "-"}
                  </div>
                </div>
              ) : (
                <div className="text-[13px] text-white/30">
                  {supaConfigured ? "Belum pernah diganti dari dashboard (masih pakai yang tertanam di sketch)." : "Sambungkan Supabase dulu untuk pakai fitur ini."}
                </div>
              )}
              <p className="text-[11.5px] text-white/30 mt-3 leading-relaxed">
                Password tidak ditampilkan di sini setelah tersimpan (write-only dari dashboard). Device
                mengecek tabel ini secara berkala; kalau ada SSID baru, device otomatis coba sambung —
                dan balik ke WiFi lama otomatis kalau yang baru gagal terhubung dalam 15 detik.
              </p>

              {wifiHistory.length > 0 && (
                <div className="mt-4">
                  <div className="text-[12.5px] text-white/40 mb-1.5">Riwayat percobaan terakhir</div>
                  <div className="flex flex-col gap-1.5">
                    {wifiHistory.map((h, i) => (
                      <div
                        key={h.created_at + i}
                        className="flex items-start gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[12px]"
                      >
                        {h.berhasil ? (
                          <CheckCircle2 size={13} className="text-emerald-300 mt-0.5 shrink-0" />
                        ) : (
                          <AlertCircle size={13} className="text-rose-300 mt-0.5 shrink-0" />
                        )}
                        <div className="text-white/60">
                          {h.berhasil ? (
                            <>Berhasil tersambung ke SSID baru <b className="text-white/85">{h.ssid_dicoba}</b></>
                          ) : (
                            <>
                              Gagal ke SSID <b className="text-white/85">{h.ssid_dicoba}</b>, tetap tersambung
                              ke SSID lama <b className="text-white/85">{h.ssid_aktif}</b>
                            </>
                          )}
                          <span className="text-white/30"> · {formatHM(new Date(h.created_at))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              {!otaUnlocked ? (
                <div className="h-full flex flex-col items-center justify-center text-center rounded-2xl bg-white/[0.04] border border-white/[0.06] px-5 py-8">
                  <Lock size={16} className="text-white/40 mb-2" />
                  <p className="text-[13px] text-white/50">
                    Buka dulu panel <b>Firmware ESP32 (OTA)</b> di atas pakai PIN — panel ini pakai gerbang yang sama.
                  </p>
                </div>
              ) : (
                <>
                  <input
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    placeholder="Nama WiFi (SSID) baru"
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-cyan-300/40"
                  />
                  <input
                    type="password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    placeholder="Password WiFi baru"
                    className="w-full mt-2.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-cyan-300/40"
                  />
                  <button
                    onClick={handleWifiSave}
                    disabled={!supaConfigured || !wifiSsid.trim() || !wifiPassword.trim() || wifiStatus === "saving"}
                    className="mt-2.5 w-full py-2.5 rounded-xl bg-cyan-300/15 border border-cyan-300/25 text-cyan-200 text-[13px] hover:bg-cyan-300/25 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Wifi size={14} />
                    {wifiStatus === "saving" ? "Menyimpan…" : "Kirim ke device"}
                  </button>

                  {wifiStatus === "success" && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-emerald-300">
                      <CheckCircle2 size={13} /> Tersimpan. Device akan mencoba sambung di siklus cek berikutnya.
                    </div>
                  )}
                  {wifiStatus === "error" && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-rose-300">
                      <AlertCircle size={13} /> {wifiError}
                    </div>
                  )}
                  <p className="text-[11.5px] text-white/30 mt-2.5 leading-relaxed">
                    Pastikan SSID dan password benar — device baru bisa dihubungi lagi lewat dashboard
                    ini kalau berhasil konek ke WiFi yang kamu masukkan.
                  </p>
                </>
              )}
            </div>
          </div>
        </Glass>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
