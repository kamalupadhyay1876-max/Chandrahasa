-- PostgreSQL/Supabase commerce-integrity primitives (migration scaffold).
-- Not a replacement for the current SQLite db.js adapter yet.
create extension if not exists pgcrypto;
create table if not exists commerce_event_ledger (
  event_id text primary key, event_type text not null, payload jsonb not null,
  received_at timestamptz not null default now(), processed_at timestamptz, outcome text
);
create table if not exists inventory_reservations (
  id uuid primary key default gen_random_uuid(), order_id bigint not null,
  product_id bigint not null, quantity integer not null check(quantity > 0),
  state text not null check(state in ('reserved','released','consumed','exception')),
  expires_at timestamptz not null, created_at timestamptz not null default now(),
  released_at timestamptz, consumed_at timestamptz,
  unique(order_id,product_id)
);
create index if not exists inventory_reservations_expiry_idx on inventory_reservations(state,expires_at);
create table if not exists payment_ledger (
  id uuid primary key default gen_random_uuid(), order_id bigint not null,
  gateway_payment_id text unique, gateway_order_id text not null,
  amount_minor bigint not null check(amount_minor >= 0), currency text not null default 'INR',
  state text not null check(state in ('created','authorized','captured','failed','refund_pending','refunded','exception')),
  updated_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table if not exists refund_ledger (
  id uuid primary key default gen_random_uuid(), order_id bigint not null,
  gateway_refund_id text unique, gateway_payment_id text not null,
  amount_minor bigint not null check(amount_minor > 0),
  state text not null check(state in ('requested','pending','processed','failed','exception')),
  idempotency_key text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists commerce_outbox (
  id uuid primary key default gen_random_uuid(), event_type text not null,
  aggregate_id text not null, payload jsonb not null,
  state text not null default 'queued' check(state in ('queued','processing','done','retry','dead')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists commerce_outbox_dispatch_idx on commerce_outbox(state,next_attempt_at);
-- Atomic stock decrement helper. Caller must verify return row count.
create or replace function reserve_stock(p_product_id bigint,p_quantity integer)
returns boolean language plpgsql as $$
declare affected integer;
begin
 if p_quantity <= 0 then return false; end if;
 update products set stock=stock-p_quantity where id=p_product_id and stock>=p_quantity;
 get diagnostics affected = row_count;
 return affected = 1;
end $$;
