-- ═══════════════════════════════════════════════════════════════
-- KITBASE — ZABEZPIECZENIE LICYTACJI PO STRONIE BAZY
-- Odpal w Supabase SQL Editor, w całości, raz.
-- Bezpieczne do wielokrotnego uruchomienia.
--
-- Problem, który to naprawia: cała logika licytacji (minimalne
-- podbicie, blokada licytowania własnej koszulki, sprawdzanie czy
-- aukcja jest aktywna, "Kup Teraz") żyła WYŁĄCZNIE w kodzie JS na
-- froncie. Ktoś mógł to całkowicie ominąć wysyłając zapytanie
-- bezpośrednio do Supabase z konsoli przeglądarki — np. ustawić
-- sobie zwycięstwo w aukcji bez faktycznego podbicia.
--
-- Rozwiązanie: cała logika przenosi się do dwóch funkcji SQL
-- (place_bid, buy_now_auction) które są jedyną dozwoloną drogą do
-- zmiany ceny/zwycięzcy aukcji. Zwykły UPDATE na tabeli auctions
-- z pominięciem tych funkcji zostaje odrzucony przez RLS.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────
-- 1) Podstawowe reguły dostępu do tabel
-- ───────────────────────────────────────────
alter table auctions enable row level security;
drop policy if exists "public read auctions" on auctions;
drop policy if exists "users insert own auctions" on auctions;
drop policy if exists "owner update own auction" on auctions;
create policy "public read auctions" on auctions for select using (true);
create policy "users insert own auctions" on auctions for insert with check (auth.uid() = user_id);
-- Właściciel może aktualizować własną aukcję (potrzebne do anulowania).
-- Zmiana ceny/zwycięzcy przez licytujących NIE idzie tą drogą — patrz funkcje niżej.
create policy "owner update own auction" on auctions for update using (auth.uid() = user_id);

alter table bids enable row level security;
drop policy if exists "public read bids" on bids;
create policy "public read bids" on bids for select using (true);
-- CELOWO brak polityki INSERT dla zwykłych userów — jedyna droga dodania
-- oferty to funkcja place_bid() poniżej, która najpierw ją waliduje.

-- ───────────────────────────────────────────
-- 2) Złożenie oferty — cała logika z placeBid() w JS, przeniesiona tutaj
-- ───────────────────────────────────────────
create or replace function place_bid(p_auction_id uuid, p_amount numeric, p_bidder_nick text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction auctions%rowtype;
  v_min_bid numeric;
  v_new_ends_at timestamptz;
  v_secs_left numeric;
begin
  if auth.uid() is null then
    raise exception 'Musisz być zalogowany.';
  end if;

  select * into v_auction from auctions where id = p_auction_id for update;
  if not found then
    raise exception 'Licytacja nie istnieje.';
  end if;
  if v_auction.status <> 'active' then
    raise exception 'Licytacja zakończona.';
  end if;
  if v_auction.ends_at <= now() then
    raise exception 'Licytacja zakończona.';
  end if;
  if v_auction.user_id = auth.uid() then
    raise exception 'Nie możesz licytować własnej koszulki.';
  end if;

  v_min_bid := coalesce(v_auction.current_price,0) + coalesce(v_auction.min_bid_increment,1);
  if p_amount < v_min_bid then
    raise exception 'Minimalna oferta: % PLN', v_min_bid;
  end if;

  v_secs_left := extract(epoch from (v_auction.ends_at - now()));
  if v_secs_left <= coalesce(v_auction.extend_threshold_seconds,0) and coalesce(v_auction.extend_seconds,0) > 0 then
    v_new_ends_at := now() + (v_auction.extend_seconds || ' seconds')::interval;
  else
    v_new_ends_at := v_auction.ends_at;
  end if;

  insert into bids(auction_id, user_id, amount, bidder_nick)
  values (p_auction_id, auth.uid(), p_amount, p_bidder_nick);

  update auctions
  set current_price = p_amount,
      highest_bidder_id = auth.uid(),
      highest_bidder_nick = p_bidder_nick,
      ends_at = v_new_ends_at
  where id = p_auction_id;

  return jsonb_build_object(
    'success', true,
    'new_price', p_amount,
    'ends_at', v_new_ends_at,
    'previous_bidder_id', v_auction.highest_bidder_id,
    'seller_id', v_auction.user_id,
    'club', v_auction.club,
    'season', v_auction.season
  );
end;
$$;

-- ───────────────────────────────────────────
-- 3) Kup Teraz — cała logika z buyNow() w JS, przeniesiona tutaj
-- ───────────────────────────────────────────
create or replace function buy_now_auction(p_auction_id uuid, p_buyer_nick text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction auctions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Musisz być zalogowany.';
  end if;

  select * into v_auction from auctions where id = p_auction_id for update;
  if not found then
    raise exception 'Licytacja nie istnieje.';
  end if;
  if v_auction.status <> 'active' then
    raise exception 'Licytacja zakończona.';
  end if;
  if v_auction.buy_now_price is null then
    raise exception 'Ta licytacja nie ma opcji Kup Teraz.';
  end if;
  if v_auction.highest_bidder_id is not null then
    raise exception 'Są już oferty — nie można użyć Kup Teraz.';
  end if;
  if v_auction.user_id = auth.uid() then
    raise exception 'Nie możesz kupić własnej koszulki.';
  end if;

  update auctions
  set status = 'sold', winner_id = auth.uid(), winner_nick = p_buyer_nick, current_price = v_auction.buy_now_price
  where id = p_auction_id;

  return jsonb_build_object('success', true, 'seller_id', v_auction.user_id, 'price', v_auction.buy_now_price, 'club', v_auction.club, 'season', v_auction.season);
end;
$$;

grant execute on function place_bid(uuid, numeric, text) to authenticated;
grant execute on function buy_now_auction(uuid, text) to authenticated;
