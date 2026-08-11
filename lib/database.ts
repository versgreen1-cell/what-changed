let schemaReady = false;

export async function ensureSchema(db: D1Database) {
  if (schemaReady) return;

  await db.batch([
    db.prepare("PRAGMA foreign_keys = ON"),
    db.prepare(`CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      name TEXT NOT NULL,
      frequency_minutes INTEGER NOT NULL DEFAULT 1440,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
      last_checked_at TEXT,
      next_check_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      content_hash TEXT NOT NULL,
      visible_text TEXT NOT NULL,
      html_snapshot TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      from_snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      to_snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      added_json TEXT NOT NULL DEFAULT '[]',
      removed_json TEXT NOT NULL DEFAULT '[]',
      change_score INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_monitors_url ON monitors(url)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_monitors_next_check ON monitors(status, next_check_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_snapshots_monitor_captured ON snapshots(monitor_id, captured_at DESC)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_changes_monitor_created ON changes(monitor_id, created_at DESC)",
    ),
  ]);
  await db.prepare("PRAGMA optimize").run();
  schemaReady = true;
}
