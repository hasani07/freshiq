// Edge Function: send-alerts
// -----------------------------------------------------------------
// Dipanggil pg_cron tiap 1 menit. Mengecek kondisi di database, dan kalau ada
// kejadian BARU (buah busuk / perangkat offline >2 menit), kirim notifikasi push
// ke semua perangkat yang sudah menekan lonceng di dashboard (iOS, Android, Windows).
//
// Dedup: tabel alert_state mencatat alert mana yang sedang aktif, jadi notifikasi
// cuma dikirim SEKALI saat kejadian mulai (bukan tiap menit selama masih bermasalah).
//
// Secrets yang harus diisi (Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mis. mailto:emailkamu@gmail.com)
// SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY sudah otomatis tersedia.
// -----------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const OFFLINE_AFTER_MS = 120_000; // 2 menit tanpa data = offline
const DEFAULT_BUSUK_VOC_MAX = 500;

type Alert = { key: string; active: boolean; title: string; body: string; recovery?: { title: string; body: string } };

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!
  );

  const now = Date.now();

  // --- ambil data terkini ---
  const [{ data: sensorRows }, { data: camRow }, { data: rangeRow }] = await Promise.all([
    supabase.from("sensor_readings").select("voc,created_at").order("created_at", { ascending: false }).limit(1),
    supabase.from("camera_status").select("last_seen").eq("id", 1).maybeSingle(),
    supabase.from("range_settings").select("busuk_vocmax").eq("id", 1).maybeSingle(),
  ]);

  const latest = sensorRows?.[0];
  const sensorAge = latest ? now - new Date(latest.created_at).getTime() : null;
  const sensorFresh = sensorAge !== null && sensorAge < OFFLINE_AFTER_MS;
  const vocMax = rangeRow?.busuk_vocmax ?? DEFAULT_BUSUK_VOC_MAX;

  const alerts: Alert[] = [
    {
      key: "busuk",
      active: Boolean(sensorFresh && latest && latest.voc > vocMax),
      title: "Buah terdeteksi BUSUK",
      body: latest ? `VOC ${Math.round(latest.voc)} ppm sudah melewati ambang busuk (${vocMax} ppm).` : "",
    },
    {
      key: "device-offline",
      active: sensorAge !== null && sensorAge >= OFFLINE_AFTER_MS,
      title: "ESP32 (sensor + kipas) offline",
      body: "Tidak ada data masuk selama lebih dari 2 menit.",
      recovery: { title: "ESP32 kembali online", body: "Data sensor sudah masuk lagi." },
    },
    {
      key: "cam-offline",
      active: Boolean(camRow?.last_seen) && now - new Date(camRow!.last_seen).getTime() >= OFFLINE_AFTER_MS,
      title: "ESP32-CAM offline",
      body: "Tidak ada heartbeat selama lebih dari 2 menit.",
      recovery: { title: "ESP32-CAM kembali online", body: "Kamera sudah terhubung lagi." },
    },
  ];

  // --- bandingkan dengan state sebelumnya, tentukan notifikasi yang perlu dikirim ---
  const { data: stateRows } = await supabase.from("alert_state").select("key,active");
  const prev = new Map((stateRows ?? []).map((r) => [r.key, r.active as boolean]));

  const toSend: { title: string; body: string; tag: string }[] = [];
  for (const a of alerts) {
    const was = prev.get(a.key) ?? false;
    if (a.active && !was) toSend.push({ title: a.title, body: a.body, tag: a.key });
    if (!a.active && was && a.recovery) toSend.push({ ...a.recovery, tag: a.key });
  }

  await supabase
    .from("alert_state")
    .upsert(alerts.map((a) => ({ key: a.key, active: a.active, updated_at: new Date().toISOString() })));

  if (toSend.length === 0) {
    return Response.json({ sent: 0, note: "tidak ada kejadian baru" });
  }

  // --- kirim ke semua perangkat yang berlangganan ---
  const { data: subs } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth");
  let delivered = 0;
  const dead: number[] = [];

  for (const sub of subs ?? []) {
    for (const msg of toSend) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(msg),
          { TTL: 3600, urgency: "high" }
        );
        delivered++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          dead.push(sub.id); // langganan sudah tidak berlaku (app dihapus / izin dicabut)
          break;
        }
        console.error("push gagal", code, (err as Error).message);
      }
    }
  }

  if (dead.length) await supabase.from("push_subscriptions").delete().in("id", dead);

  return Response.json({ events: toSend.length, subscribers: subs?.length ?? 0, delivered, removed: dead.length });
});
