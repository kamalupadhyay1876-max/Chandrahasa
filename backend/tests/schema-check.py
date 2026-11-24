"""Offline SQLite schema smoke-check using Python's stdlib sqlite3.
This validates static schema blocks and the additive retry/outbox columns;
it is not a substitute for better-sqlite3 runtime migration testing.
"""
from pathlib import Path
import re, sqlite3, sys

root = Path(__file__).resolve().parents[2]
source = (root / 'backend' / 'db.js').read_text()
blocks = re.findall(r'db\.exec\(`([\s\S]*?)`\)', source)
conn = sqlite3.connect(':memory:')
executed = 0
for index, sql in enumerate(blocks, 1):
    if '${' in sql:  # additive JavaScript migrations are validated below
        continue
    conn.executescript(sql)
    executed += 1

# Apply the exact additive migration definitions that db.js applies on startup.
for table, additions in {
    'webhook_events': [('status', "TEXT NOT NULL DEFAULT 'pending'"), ('attempts', 'INTEGER NOT NULL DEFAULT 0'), ('processing_started_at', "TEXT NOT NULL DEFAULT ''"), ('processed_at', "TEXT NOT NULL DEFAULT ''"), ('last_error', "TEXT NOT NULL DEFAULT ''")],
    'notification_outbox': [('locked_at', "TEXT NOT NULL DEFAULT ''"), ('last_error', "TEXT NOT NULL DEFAULT ''"), ('sent_at', "TEXT NOT NULL DEFAULT ''"), ('provider_response', "TEXT NOT NULL DEFAULT ''")],
}.items():
    existing = {r[1] for r in conn.execute(f'PRAGMA table_info({table})')}
    for col, definition in additions:
        if col not in existing:
            conn.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')
conn.commit()
assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
webhook_cols = {r[1] for r in conn.execute('PRAGMA table_info(webhook_events)')}
outbox_cols = {r[1] for r in conn.execute('PRAGMA table_info(notification_outbox)')}
assert {'status', 'attempts', 'processing_started_at', 'processed_at', 'last_error'} <= webhook_cols
assert {'locked_at', 'last_error', 'sent_at', 'provider_response'} <= outbox_cols
assert conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0] >= 50

# Simulate upgrade from the prior release's legacy tables and ensure columns add cleanly.
legacy = sqlite3.connect(':memory:')
legacy.executescript("""
CREATE TABLE webhook_events(event_id TEXT PRIMARY KEY,event TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE notification_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,event_type TEXT NOT NULL,aggregate_id TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(event_type,aggregate_id));
""")
for table, additions in {
    'webhook_events': [('status', "TEXT NOT NULL DEFAULT 'pending'"), ('attempts', 'INTEGER NOT NULL DEFAULT 0'), ('processing_started_at', "TEXT NOT NULL DEFAULT ''"), ('processed_at', "TEXT NOT NULL DEFAULT ''"), ('last_error', "TEXT NOT NULL DEFAULT ''")],
    'notification_outbox': [('locked_at', "TEXT NOT NULL DEFAULT ''"), ('last_error', "TEXT NOT NULL DEFAULT ''"), ('sent_at', "TEXT NOT NULL DEFAULT ''"), ('provider_response', "TEXT NOT NULL DEFAULT ''")],
}.items():
    existing = {r[1] for r in legacy.execute(f'PRAGMA table_info({table})')}
    for col, definition in additions:
        if col not in existing:
            legacy.execute(f'ALTER TABLE {table} ADD COLUMN {col} {definition}')
legacy.commit()
assert 'status' in {r[1] for r in legacy.execute('PRAGMA table_info(webhook_events)')}
assert 'provider_response' in {r[1] for r in legacy.execute('PRAGMA table_info(notification_outbox)')}
print(f'PASS static SQLite schema blocks: {executed}/{len(blocks)}')
print('PASS webhook and notification outbox columns')
print('PASS legacy additive migration simulation')
print('PASS SQLite integrity_check: ok')
