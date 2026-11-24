-- Supabase/PostgreSQL core schema for a future application adapter cutover.
-- This is NOT currently wired to the SQLite runtime. Keep RLS enabled and use
-- server-side service credentials only in the backend (never browser code).
create extension if not exists pgcrypto;
create table if not exists categories (
 id bigint generated always as identity primary key, name text not null, slug text not null unique,
 image text not null default '', sort_order integer not null default 0
);
create table if not exists products (
 id bigint generated always as identity primary key, slug text not null unique, name text not null,
 category_slug text not null references categories(slug), description text not null default '',
 price integer not null check(price >= 0), compare_price integer check(compare_price is null or compare_price >= 0),
 images jsonb not null default '[]'::jsonb, huid text not null default '', purity text not null default '925 Sterling Silver',
 weight text not null default '', stock integer not null default 0 check(stock >= 0), rating numeric(3,2) not null default 4.8,
 review_count integer not null default 0, badge text, artisan text not null default '', artisan_story text not null default '',
 is_active boolean not null default true, created_at timestamptz not null default now()
);
create index if not exists products_category_active_idx on products(category_slug,is_active);
create index if not exists products_name_idx on products(name);
create table if not exists customers (
 id bigint generated always as identity primary key, name text not null, email text not null unique,
 phone text not null default '', password_hash text not null, role text not null default 'customer' check(role in ('customer','admin')),
 created_at timestamptz not null default now()
);
create table if not exists customer_sessions (
 token_hash text primary key, customer_id bigint not null references customers(id) on delete cascade,
 created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table if not exists orders (
 id bigint generated always as identity primary key, customer_id bigint references customers(id) on delete set null,
 email text not null, phone text not null, subtotal integer not null check(subtotal>=0), discount integer not null default 0 check(discount>=0),
 shipping integer not null default 0 check(shipping>=0), total integer not null check(total>=0), coupon_code text,
 status text not null default 'pending', payment_method text not null default 'razorpay',
 payment_status text not null default 'created', payment_id text, address jsonb not null default '{}'::jsonb,
 confirmation_token_hash text unique, gateway_order_id text, tracking_number text not null default '', tracking_url text not null default '',
 shipping_provider text not null default '', shipped_at timestamptz, delivered_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists orders_customer_idx on orders(customer_id);
create index if not exists orders_created_idx on orders(created_at desc);
create table if not exists order_items (
 id bigint generated always as identity primary key, order_id bigint not null references orders(id) on delete cascade,
 product_id bigint references products(id) on delete set null, name text not null, image text not null default '',
 price integer not null check(price>=0), qty integer not null check(qty>0), size text not null default '', huid text not null default ''
);
create table if not exists cart_items (
 customer_id bigint not null references customers(id) on delete cascade, product_id bigint not null references products(id) on delete cascade,
 qty integer not null check(qty>0), size text not null default '', added_at timestamptz not null default now(), primary key(customer_id,product_id,size)
);
create table if not exists wishlists (
 customer_id bigint not null references customers(id) on delete cascade, product_id bigint not null references products(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(customer_id,product_id)
);
create table if not exists coupons (
 id bigint generated always as identity primary key, code text not null unique, type text not null check(type in ('percentage','fixed')),
 value integer not null check(value>=0), min_order integer not null default 0, usage_limit integer not null default 1000,
 used_count integer not null default 0, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists reviews (
 id bigint generated always as identity primary key, product_id bigint not null references products(id) on delete cascade,
 customer_id bigint references customers(id) on delete set null, author text not null default 'Anonymous',
 rating integer not null check(rating between 1 and 5), title text not null default '', body text not null default '', created_at timestamptz not null default now()
);
create table if not exists newsletter (id bigint generated always as identity primary key,email text not null unique,created_at timestamptz not null default now());
create table if not exists contacts (id bigint generated always as identity primary key,name text not null,email text not null,subject text not null default '',message text not null,created_at timestamptz not null default now());
create table if not exists store_settings (key text primary key,value text not null,updated_at timestamptz not null default now());
create table if not exists admin_audit_log (id bigint generated always as identity primary key,customer_id bigint,action text not null,entity text not null,entity_id text,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create table if not exists payments (id bigint generated always as identity primary key,order_id bigint not null references orders(id) on delete cascade,gateway text not null,payment_id text not null unique,method text not null,amount integer not null check(amount>=0),status text not null,signature text not null,created_at timestamptz not null default now());
create table if not exists webhook_events (event_id text primary key,event text not null,payload jsonb not null,created_at timestamptz not null default now());
create table if not exists stock_releases (order_id bigint primary key references orders(id) on delete cascade,reason text not null,created_at timestamptz not null default now());
create table if not exists refunds (id bigint generated always as identity primary key,order_id bigint not null references orders(id),gateway_refund_id text unique,payment_id text not null,amount integer not null check(amount>0),status text not null,created_at timestamptz not null default now());
-- Deny client-side access by default. API service-role requests bypass RLS.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['categories','products','customers','customer_sessions','orders','order_items','cart_items','wishlists','coupons','reviews','newsletter','contacts','store_settings','admin_audit_log','payments','webhook_events','stock_releases','refunds'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
