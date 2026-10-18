-- =========================================================
-- FreshRay — Tambahan: simpan rentang + riwayat, dan notifikasi push
-- Jalankan di Supabase Dashboard > SQL Editor > New query
-- (Ini potongan BARU saja — jangan jalankan ulang schema.sql utuh)
-- =========================================================

-- ---------- 1. Rentang ideal + rentang kebusukan (tersimpan, dipakai semua perangkat) ----------
create table if not exists range_settings (
  id int primary key,
  suhumin float8, suhumax float8,
  lembapmin float8, lembapmax float8,
  vocmin float8, vocmax float8,
  busuk_vocmin float8, busuk_vocmax float8,
  busuk_suhumin float8, busuk_suhumax float8,
  busuk_lembapmin float8, busuk_lembapmax float8,
  updated_at timestamptz default now()
);

-- Riwayat: tiap klik Simpan menambah 1 baris; yang lebih dari 5 terakhir dihapus otomatis
create table if not exists range_history (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  suhumin float8, suhumax float8,
  lembapmin float8, lembapmax float8,
  vocmin float8, vocmax float8,
  busuk_vocmin float8, busuk_vocmax float8,
  busuk_suhumin float8, busuk_suhumax float8,
  busuk_lembapmin float8, busuk_lembapmax float8
);

create or replace function batasi_range_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from range_history
  where id not in (select id from range_history order by id desc limit 5);
  return null;
end;
$$;

drop trigger if exists trg_batasi_range_history on range_history;
create trigger trg_batasi_range_history
  after insert on range_history
  for each statement execute function batasi_range_history();

alter table range_settings enable row level security;
alter table range_history enable row level security;
create policy "allow all range_settings" on range_settings for all using (true) with check (true);
create policy "allow all range_history" on range_history for all using (true) with check (true);

-- ---------- 2. Notifikasi push (iOS/Android/Windows, tetap masuk walau web ditutup) ----------
-- Menyimpan "alamat" tiap perangkat yang mengaktifkan notifikasi
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

-- Mencatat alert mana yang sedang aktif, supaya notifikasi cuma dikirim SEKALI saat kejadian mulai
create table if not exists alert_state (
  key text primary key,
  active boolean default false,
  updated_at timestamptz default now()
);

alter table push_subscriptions enable row level security;
alter table alert_state enable row level security;
create policy "allow all push_subscriptions" on push_subscriptions for all using (true) with check (true);
-- alert_state hanya dipakai Edge Function (service role), tidak perlu policy untuk anon.

-- ---------- 3. Jadwalkan pengecekan alert tiap 1 menit ----------
-- GANTI GANTI_DENGAN_ANON_KEY_KAMU dengan anon key project-mu (sama seperti yang dipakai cleanup harian)
select cron.schedule(
  'send-alerts-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://xnqbsaxmdruxtmqxnmoq.supabase.co/functions/v1/send-alerts',
    headers := jsonb_build_object('Authorization', 'Bearer GANTI_DENGAN_ANON_KEY_KAMU')
  );
  $$
);
