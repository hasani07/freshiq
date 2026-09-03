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
  Video,
  VideoOff,
  Sparkles,
  RefreshCw,
  Settings2,
  Wifi,
  WifiOff,
  ChevronRight,
  Database,
  Clock,
  Radio,
  TrendingUp,
  TrendingDown,
  Minus,
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
    <div className="flex items-center justify-between px-6 pt-5">
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
  const [streamUrl, setStreamUrl] = useState("");
  const [connectedUrl, setConnectedUrl] = useState("");
  const [streamError, setStreamError] = useState(false);

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

  const activeMetric = METRICS[activeTab];
  const activeMin = thresholds[`${activeTab}Min`];
  const activeMax = thresholds[`${activeTab}Max`];

  const chartData = useMemo(
    () => history.map((h) => ({ ...h, value: h[activeTab] })),
    [history, activeTab]
  );

  const handleConnectStream = () => {
    setStreamError(false);
    setConnectedUrl(streamUrl.trim());
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
                  FreshIQ
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

              <div className="relative mt-5">
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
              <AreaChart data={chartData} margin={{ top: 8, right: 18, left: -12, bottom: 0 }}>
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
                  domain={activeMetric.bounds}
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
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

      {/* camera + fan + threshold */}
      <div className="mx-auto max-w-[1360px] px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* camera */}
        <Glass>
          <SectionTitle
            icon={connectedUrl && !streamError ? Video : VideoOff}
            title="Kamera box"
            sub="Streaming MJPEG dari ESP32-CAM"
          />
          <div className="px-6 pb-6 pt-3">
            <div className="aspect-video rounded-2xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
              {connectedUrl && !streamError ? (
                <img
                  src={connectedUrl}
                  alt="Stream ESP32-CAM"
                  className="w-full h-full object-cover"
                  onError={() => setStreamError(true)}
                />
              ) : (
                <div className="text-center text-white/35 text-[13px] px-6">
                  <VideoOff size={26} className="mx-auto mb-2 opacity-60" />
                  {streamError
                    ? "Tidak bisa memuat stream. Periksa alamat dan pastikan berada di jaringan yang sama."
                    : "Belum tersambung ke kamera"}
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="http://192.168.1.20:81/stream"
                className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-cyan-300/40"
              />
              <button
                onClick={handleConnectStream}
                className="px-4 py-2 sm:py-0 rounded-xl bg-cyan-300/15 border border-cyan-300/25 text-cyan-200 text-[13px] hover:bg-cyan-300/25 transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                {connectedUrl && !streamError ? <Wifi size={14} /> : <WifiOff size={14} />}
                Hubungkan
              </button>
            </div>
            <p className="text-[11.5px] text-white/30 mt-2 leading-relaxed">
              Alamat ini adalah endpoint stream ESP32-CAM di jaringan lokal. Perangkat yang membuka dashboard harus berada di jaringan yang sama dengan box.
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
