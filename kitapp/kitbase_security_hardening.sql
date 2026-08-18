-- ═══════════════════════════════════════════════════════════════
-- KITBASE — ZABEZPIECZENIE PRZED UDOSTĘPNIENIEM KODU
-- Odpal w Supabase SQL Editor, w całości, raz.
-- Bezpieczne do wielokrotnego uruchomienia.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────
-- 1) NAJWAŻNIEJSZE: blokada samo-nadawania sobie uprawnień admina.
-- Bez tego ktoś zalogowany mógłby (z konsoli przeglądarki, pomijając
-- Twój kod całkowicie) wysłać zapytanie ustawiające sobie is_admin=true.
-- Ten trigger to blokuje niezależnie od tego, co wysyła klient.
-- ───────────────────────────────────────────
create or replace function prevent_self_admin_escalation()
returns trigger as $$
begin
  if not (auth.uid() in (select user_id from profiles where is_admin = true)) then
    new.is_admin := old.is_admin;
    new.is_verified := old.is_verified;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_self_admin_escalation on profiles;
create trigger trg_prevent_self_admin_escalation
  before update on profiles
  for each row execute function prevent_self_admin_escalation();

-- ───────────────────────────────────────────
-- 2) Admin musi móc aktualizować WIERSZE INNYCH użytkowników
-- (weryfikacja sprzedających, LegitCheck na cudzych koszulkach).
-- Bez tego te funkcje w panelu admina ciche zawodzą (RLS odrzuca zapis).
-- ───────────────────────────────────────────
drop policy if exists "admin update any profile" on profiles;
create policy "admin update any profile" on profiles
  for update using (auth.uid() in (select user_id from profiles where is_admin = true));

drop policy if exists "admin update shirts" on shirts;
create policy "admin update shirts" on shirts
  for update using (auth.uid() in (select user_id from profiles where is_admin = true));

drop policy if exists "admin update listings" on market_listings;
create policy "admin update listings" on market_listings
  for update using (auth.uid() in (select user_id from profiles where is_admin = true));

-- ───────────────────────────────────────────
-- 3) Treści strony głównej (site_content) — czytać może każdy
-- (strona musi się wczytać bez logowania), ale zapisywać tylko admin.
-- ───────────────────────────────────────────
alter table site_content enable row level security;
drop policy if exists "public read site content" on site_content;
drop policy if exists "admin insert site content" on site_content;
drop policy if exists "admin update site content" on site_content;
create policy "public read site content" on site_content for select using (true);
create policy "admin insert site content" on site_content for insert with check (auth.uid() in (select user_id from profiles where is_admin = true));
create policy "admin update site content" on site_content for update using (auth.uid() in (select user_id from profiles where is_admin = true));

-- ───────────────────────────────────────────
-- 4) Prywatność kolekcji — Twoje koszulki widzisz tylko Ty (i admin, wyżej).
-- Marketplace ma osobną, publicznie czytelną tabelę (market_listings),
-- więc shirts NIE powinno być publicznie czytelne.
-- ───────────────────────────────────────────
alter table shirts enable row level security;
drop policy if exists "users manage own shirts" on shirts;
create policy "users manage own shirts" on shirts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────────────────────
-- 5) Marketplace musi być czytelny publicznie (przeglądanie bez konta),
-- ale wystawiać/edytować może tylko właściciel ogłoszenia (+ admin, wyżej).
-- ───────────────────────────────────────────
alter table market_listings enable row level security;
drop policy if exists "public read listings" on market_listings;
drop policy if exists "users manage own listings" on market_listings;
create policy "public read listings" on market_listings for select using (true);
create policy "users manage own listings" on market_listings
  for insert with check (auth.uid() = user_id);
drop policy if exists "users delete own listings" on market_listings;
create policy "users delete own listings" on market_listings
  for delete using (auth.uid() = user_id);
