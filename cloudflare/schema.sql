CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE cart_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL CHECK(qty > 0),
  size TEXT NOT NULL DEFAULT '',
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id, size)
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  image TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE chat_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE, sender_type TEXT NOT NULL CHECK(sender_type IN ('customer','agent','system')), sender_id INTEGER, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE chat_threads (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), subject TEXT NOT NULL DEFAULT 'Customer support', status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE checkout_idempotency (key_hash TEXT PRIMARY KEY, request_hash TEXT NOT NULL DEFAULT '', response_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK(type IN ('percentage','fixed')),
  value INTEGER NOT NULL,                              -- percent or ₹
  min_order INTEGER NOT NULL DEFAULT 0,
  usage_limit INTEGER NOT NULL DEFAULT 1000,
  used_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE customer_addresses (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,label TEXT NOT NULL DEFAULT 'Home',name TEXT NOT NULL,phone TEXT NOT NULL,line1 TEXT NOT NULL,line2 TEXT DEFAULT '',city TEXT NOT NULL,state TEXT NOT NULL,pincode TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'India',is_default INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE gift_card_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL REFERENCES gift_cards(code),order_id INTEGER REFERENCES orders(id),amount INTEGER NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE gift_card_redemptions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL REFERENCES gift_cards(code), order_id INTEGER NOT NULL REFERENCES orders(id), amount INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(order_id,code)
);
CREATE TABLE gift_cards (code TEXT PRIMARY KEY,balance INTEGER NOT NULL CHECK(balance>=0),initial_value INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,expires_at TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE inventory_movements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, warehouse_id INTEGER NOT NULL REFERENCES seller_warehouses(id), product_id INTEGER NOT NULL REFERENCES products(id),
 delta INTEGER NOT NULL, reason TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', actor_user_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE loyalty_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),points INTEGER NOT NULL,reason TEXT NOT NULL,order_id INTEGER REFERENCES orders(id),created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE loyalty_redemptions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), order_id INTEGER NOT NULL REFERENCES orders(id), points INTEGER NOT NULL, rupees INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(order_id)
);
CREATE TABLE marketplace_tax_adjustments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, return_id INTEGER NOT NULL REFERENCES return_requests(id), seller_id INTEGER NOT NULL REFERENCES sellers(id),
 taxable_adjustment INTEGER NOT NULL, tcs_adjustment INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(return_id,seller_id)
);
CREATE TABLE marketplace_tax_ledger (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), seller_id INTEGER NOT NULL REFERENCES sellers(id),
 seller_suborder_id INTEGER REFERENCES seller_suborders(id), state_of_supply TEXT NOT NULL DEFAULT '', taxable_value INTEGER NOT NULL,
 tcs_rate REAL NOT NULL, tcs_amount INTEGER NOT NULL, tax_type TEXT NOT NULL CHECK(tax_type IN ('CGST+SGST','IGST')),
 status TEXT NOT NULL DEFAULT 'accrued', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(order_id,seller_id)
);
CREATE TABLE marketplace_tax_periods (
 id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT NOT NULL UNIQUE, gross_taxable INTEGER NOT NULL DEFAULT 0,
 returns_value INTEGER NOT NULL DEFAULT 0, net_taxable INTEGER NOT NULL DEFAULT 0, tcs_total INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'draft', exported_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE marketplace_tax_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), operator_gstin TEXT NOT NULL DEFAULT '', tcs_intra_rate REAL NOT NULL DEFAULT 0,
 tcs_inter_rate REAL NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 0, reviewed_by TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE newsletter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), locked_at TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '', sent_at TEXT NOT NULL DEFAULT '', provider_response TEXT NOT NULL DEFAULT '',
  UNIQUE(event_type, aggregate_id)
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  huid TEXT NOT NULL DEFAULT ''
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  shipping INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','shipped','out_for_delivery','delivered','cancelled','returned')),
  payment_method TEXT NOT NULL DEFAULT 'razorpay',
  payment_status TEXT NOT NULL DEFAULT 'created' CHECK(payment_status IN ('created','paid','failed','refunded')),
  payment_id TEXT,
  address TEXT NOT NULL DEFAULT '{}',                 -- JSON
  confirmation_token_hash TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, gateway_order_id TEXT DEFAULT '', tracking_number TEXT DEFAULT '', tracking_url TEXT DEFAULT '', shipping_provider TEXT DEFAULT '', shipped_at TEXT, delivered_at TEXT, shiprocket_shipment_id TEXT DEFAULT '', shiprocket_order_id TEXT DEFAULT '', shiprocket_state TEXT DEFAULT '');
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL DEFAULT 'razorpay_test',
  payment_id TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL DEFAULT 'upi',
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE product_embeddings (
 product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE, model TEXT NOT NULL, embedding_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE product_questions (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id),question TEXT NOT NULL,answer TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE product_sellers (product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,seller_id INTEGER NOT NULL REFERENCES sellers(id));
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_slug TEXT NOT NULL REFERENCES categories(slug),
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK(price >= 0),           -- paise-free ₹ rupees, integer
  compare_price INTEGER,
  images TEXT NOT NULL DEFAULT '[]',                  -- JSON array of paths
  huid TEXT NOT NULL DEFAULT '',                      -- 6-digit Hallmark Unique ID
  purity TEXT NOT NULL DEFAULT '925 Sterling Silver',
  weight TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  rating REAL NOT NULL DEFAULT 4.8,
  review_count INTEGER NOT NULL DEFAULT 0,
  badge TEXT,
  artisan TEXT NOT NULL DEFAULT '',
  artisan_story TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE refunds (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), gateway_refund_id TEXT UNIQUE, payment_id TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE return_fulfilment (
 id INTEGER PRIMARY KEY AUTOINCREMENT, return_id INTEGER NOT NULL REFERENCES return_requests(id), provider TEXT NOT NULL DEFAULT '', pickup_reference TEXT NOT NULL DEFAULT '', refund_reference TEXT NOT NULL DEFAULT '', pickup_status TEXT NOT NULL DEFAULT 'not_booked', refund_status TEXT NOT NULL DEFAULT 'not_eligible', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(return_id)
);
CREATE TABLE return_requests (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES orders(id),user_id INTEGER NOT NULL REFERENCES users(id),reason TEXT NOT NULL,details TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'requested',created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author TEXT NOT NULL DEFAULT 'Anonymous',
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE search_events (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,query TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor_user_id INTEGER,
  ip_hash TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE seller_bulk_jobs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id), source TEXT NOT NULL DEFAULT 'csv', total_rows INTEGER NOT NULL DEFAULT 0,
 created_count INTEGER NOT NULL DEFAULT 0, updated_count INTEGER NOT NULL DEFAULT 0, rejected_count INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'completed', report_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE seller_carrier_accounts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE, provider TEXT NOT NULL DEFAULT 'shiprocket',
 credential_cipher TEXT NOT NULL, credential_iv TEXT NOT NULL, credential_tag TEXT NOT NULL, pickup_location TEXT NOT NULL DEFAULT 'Primary',
 status TEXT NOT NULL DEFAULT 'connected', last_verified_at TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(seller_id,provider)
);
CREATE TABLE seller_disputes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id), order_line_id INTEGER NOT NULL REFERENCES seller_order_lines(id),
 reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','under_review','resolved','rejected')),
 resolution TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(seller_id,order_line_id)
);
CREATE TABLE seller_inquiries (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id), customer_user_id INTEGER REFERENCES users(id),
 product_id INTEGER REFERENCES products(id), subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
 created_at TEXT NOT NULL DEFAULT (datetime('now')), answered_at TEXT NOT NULL DEFAULT '', response_minutes INTEGER NOT NULL DEFAULT 0
, response_message TEXT NOT NULL DEFAULT '');
CREATE TABLE seller_ledger (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id), order_line_id INTEGER REFERENCES seller_order_lines(id),
 payout_id INTEGER REFERENCES seller_payouts(id), amount INTEGER NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE seller_order_lines (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), seller_id INTEGER NOT NULL REFERENCES sellers(id),
 product_id INTEGER REFERENCES products(id), qty INTEGER NOT NULL, gross_amount INTEGER NOT NULL, commission_amount INTEGER NOT NULL,
 seller_amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now'))
, defect_flag INTEGER NOT NULL DEFAULT 0);
CREATE TABLE seller_payouts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id), amount INTEGER NOT NULL CHECK(amount>0),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','processing','paid','rejected')),
 reference TEXT NOT NULL DEFAULT '', admin_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE seller_policy_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id), rule_id INTEGER NOT NULL DEFAULT 1,
 event_type TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'warning', metric_value REAL NOT NULL DEFAULT 0, threshold_value REAL NOT NULL DEFAULT 0,
 action_taken TEXT NOT NULL DEFAULT 'none', details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE seller_policy_rules (
 id INTEGER PRIMARY KEY CHECK(id=1), lookback_days INTEGER NOT NULL DEFAULT 30, dispatch_sla_hours INTEGER NOT NULL DEFAULT 48,
 max_late_dispatch_rate REAL NOT NULL DEFAULT 10, max_cancellation_rate REAL NOT NULL DEFAULT 5, max_defect_rate REAL NOT NULL DEFAULT 2,
 min_response_rate REAL NOT NULL DEFAULT 80, min_sample_size INTEGER NOT NULL DEFAULT 5, action TEXT NOT NULL DEFAULT 'warning', enabled INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE seller_products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id), product_id INTEGER NOT NULL REFERENCES products(id),
 seller_sku TEXT NOT NULL DEFAULT '', price_override INTEGER, stock_override INTEGER, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected','paused')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(seller_id,product_id)
);
CREATE TABLE seller_profiles (
 seller_id INTEGER PRIMARY KEY REFERENCES sellers(id) ON DELETE CASCADE,
 legal_name TEXT NOT NULL DEFAULT '', business_type TEXT NOT NULL DEFAULT '', gstin TEXT NOT NULL DEFAULT '', pan_last4 TEXT NOT NULL DEFAULT '',
 kyc_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK(kyc_status IN ('not_submitted','submitted','under_review','verified','rejected')),
 kyc_reference TEXT NOT NULL DEFAULT '', bank_status TEXT NOT NULL DEFAULT 'not_submitted', payout_hold INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, provider_account_id TEXT NOT NULL DEFAULT '', provider_kyc_url TEXT NOT NULL DEFAULT '', provider_kyc_status TEXT NOT NULL DEFAULT 'not_started', bank_account_token TEXT NOT NULL DEFAULT '', bank_verified_at TEXT NOT NULL DEFAULT '');
CREATE TABLE seller_provider_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE, seller_id INTEGER,
 event_type TEXT NOT NULL, payload_hash TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE seller_quality_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id), suborder_id INTEGER NOT NULL REFERENCES seller_suborders(id), order_id INTEGER NOT NULL REFERENCES orders(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('defect','seller_cancellation')), reason TEXT NOT NULL, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(suborder_id,event_type)
);
CREATE TABLE seller_shipments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id), suborder_id INTEGER NOT NULL REFERENCES seller_suborders(id),
 provider TEXT NOT NULL DEFAULT 'Shiprocket', provider_order_id TEXT NOT NULL DEFAULT '', shipment_id TEXT NOT NULL DEFAULT '', awb TEXT NOT NULL DEFAULT '',
 courier_name TEXT NOT NULL DEFAULT '', label_url TEXT NOT NULL DEFAULT '', tracking_url TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'creating',
 payload_hash TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(suborder_id)
);
CREATE TABLE seller_suborders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 seller_id INTEGER NOT NULL REFERENCES sellers(id), warehouse_id INTEGER, status TEXT NOT NULL DEFAULT 'pending',
 gross_amount INTEGER NOT NULL DEFAULT 0, commission_amount INTEGER NOT NULL DEFAULT 0, seller_amount INTEGER NOT NULL DEFAULT 0,
 tax_tcs_amount INTEGER NOT NULL DEFAULT 0, payout_transfer_id TEXT NOT NULL DEFAULT '', payout_eligible_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')), dispatched_at TEXT NOT NULL DEFAULT '', dispatch_due_at TEXT NOT NULL DEFAULT '', cancelled_at TEXT NOT NULL DEFAULT '', fulfilment_status TEXT NOT NULL DEFAULT 'unfulfilled', UNIQUE(order_id,seller_id)
);
CREATE TABLE seller_warehouses (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
 name TEXT NOT NULL, contact_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address_json TEXT NOT NULL DEFAULT '{}',
 is_default INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sellers (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER REFERENCES users(id),name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'pending',commission_rate REAL NOT NULL DEFAULT 10,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE stock_releases (order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE store_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE support_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER REFERENCES users(id),email TEXT NOT NULL,subject TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE visual_search_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, descriptor_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE warehouse_inventory (
 warehouse_id INTEGER NOT NULL REFERENCES seller_warehouses(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id),
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(warehouse_id,product_id)
);
CREATE TABLE webhook_events (event_id TEXT PRIMARY KEY, event TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','processed','failed')), attempts INTEGER NOT NULL DEFAULT 0, processing_started_at TEXT NOT NULL DEFAULT '', processed_at TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE wishlists (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_slug);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
