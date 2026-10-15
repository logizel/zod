-- Cold-ledger DDL (D-11, T-1-05): tombstone_ledger + taste_rules.
--
-- Idempotent by construction: every CREATE carries IF NOT EXISTS and every
-- write path uses INSERT OR IGNORE, so rebuild reruns never duplicate ledger
-- rows and the taste seed stays empty. Applied by the rebuild script
-- (plan 01-04 owns infra); no statement here removes ledger rows.

CREATE TABLE IF NOT EXISTS tombstone_ledger (
  url_hash TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  terminal_status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  decided_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tombstone_fingerprint ON tombstone_ledger(fingerprint);

CREATE TABLE IF NOT EXISTS taste_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  rule TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_taste_kind ON taste_rules(kind);
