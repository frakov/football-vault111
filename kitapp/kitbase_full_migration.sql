-- ═══════════════════════════════════════════════════════════════
-- KITBASE — KOMPLETNY SKRYPT MIGRACJI
-- Odpal to CAŁE w Supabase SQL Editor, w jednym zapytaniu, RAZ.
-- Bezpieczne do wielokrotnego uruchomienia (wszystko z "if not exists").
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────
-- 1) OFERTY NA KOSZULKACH (to naprawia błąd "accepts_offers" który blokuje zapis)
-- ───────────────────────────────────────────
alter table shirts add column if not exists accepts_offers boolean default true;
alter table shirts add column if not exists min_offer numeric;

alter table market_listings add column if not exists accepts_offers boolean default true;
alter table market_listings add column if not exists min_offer numeric;
alter table market_listings add column if not exists views integer default 0;

-- ───────────────────────────────────────────
-- 2) POLUBIENIA KOSZULEK
-- ───────────────────────────────────────────
create table if not exists shirt_likes (
  id uuid primary key default gen_random_uuid(),
  shirt_id text not null,
  user_id uuid references auth.users(id) not null,
  created_at timestamptz default now(),
  unique(shirt_id, user_id)
);
alter table shirt_likes enable row level security;
drop policy if exists "public read likes" on shirt_likes;
drop policy if exists "users insert own likes" on shirt_likes;
drop policy if exists "users delete own likes" on shirt_likes;
create policy "public read likes" on shirt_likes for select using (true);
create policy "users insert own likes" on shirt_likes for insert with check (auth.uid() = user_id);
create policy "users delete own likes" on shirt_likes for delete using (auth.uid() = user_id);

-- ───────────────────────────────────────────
-- 3) WERYFIKACJA UŻYTKOWNIKÓW (niebieska plakietka przy nicku)
-- ───────────────────────────────────────────
alter table profiles add column if not exists is_verified boolean default false;
alter table profiles add column if not exists is_admin boolean default false;

-- ───────────────────────────────────────────
-- 4) ZGŁOSZENIA OGŁOSZEŃ (moderacja Marketplace)
-- ───────────────────────────────────────────
create table if not exists listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null,
  reporter_id uuid references auth.users(id),
  reason text,
  created_at timestamptz default now()
);
alter table listing_reports enable row level security;
drop policy if exists "insert own reports" on listing_reports;
drop policy if exists "admin read reports" on listing_reports;
create policy "insert own reports" on listing_reports for insert with check (auth.uid() = reporter_id);
create policy "admin read reports" on listing_reports for select using (auth.uid() in (select user_id from profiles where is_admin = true));

drop policy if exists "admin delete listings" on market_listings;
create policy "admin delete listings" on market_listings
  for delete using (auth.uid() in (select user_id from profiles where is_admin = true));

-- ───────────────────────────────────────────
-- 5) SPRZEDAJ KOSZULKĘ BEZ KONTA (formularz leadowy)
-- ───────────────────────────────────────────
create table if not exists sell_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  description text,
  photos text[] default '{}',
  status text default 'new',
  created_at timestamptz default now()
);
alter table sell_leads enable row level security;
drop policy if exists "public insert sell leads" on sell_leads;
drop policy if exists "admin read sell leads" on sell_leads;
create policy "public insert sell leads" on sell_leads for insert with check (true);
create policy "admin read sell leads" on sell_leads for select using (auth.uid() in (select user_id from profiles where is_admin = true));

drop policy if exists "public insert lead photos" on storage.objects;
create policy "public insert lead photos" on storage.objects
  for insert with check (bucket_id = 'shirt-photos' and name like 'leads/%');

-- ───────────────────────────────────────────
-- 6) LEGITCHECK — weryfikacja autentyczności koszulek
-- ───────────────────────────────────────────
alter table shirts add column if not exists legit_status text default null; -- null | pending | approved | rejected
alter table market_listings add column if not exists legit_status text default null;

create table if not exists legit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  shirt_id text not null,
  notes text,
  status text default 'pending', -- pending | approved | rejected
  admin_notes text,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);
alter table legit_checks enable row level security;
drop policy if exists "users insert own legit checks" on legit_checks;
drop policy if exists "users read own legit checks" on legit_checks;
drop policy if exists "admin read all legit checks" on legit_checks;
drop policy if exists "admin update legit checks" on legit_checks;
create policy "users insert own legit checks" on legit_checks for insert with check (auth.uid() = user_id);
create policy "users read own legit checks" on legit_checks for select using (auth.uid() = user_id);
create policy "admin read all legit checks" on legit_checks for select using (auth.uid() in (select user_id from profiles where is_admin = true));
create policy "admin update legit checks" on legit_checks for update using (auth.uid() in (select user_id from profiles where is_admin = true));

-- ───────────────────────────────────────────
-- 7) USUWANIE CZATU TYLKO U SIEBIE (nie kasuje u drugiej osoby)
-- ───────────────────────────────────────────
alter table conversations add column if not exists hidden_for_user1 boolean default false;
alter table conversations add column if not exists hidden_for_user2 boolean default false;

-- ───────────────────────────────────────────
-- 8) TWOJE KONTO ADMINA (podmień jeśli to nie Twój user_id)
-- ───────────────────────────────────────────
update profiles set is_admin = true where user_id = '831cadfc-b6f2-4826-a64a-00bd174300e1';
