import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const monitors = sqliteTable(
  "monitors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull(),
    name: text("name").notNull(),
    frequencyMinutes: integer("frequency_minutes").notNull().default(1440),
    status: text("status", { enum: ["active", "paused"] })
      .notNull()
      .default("active"),
    lastCheckedAt: text("last_checked_at"),
    nextCheckAt: text("next_check_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_monitors_url").on(table.url),
    index("idx_monitors_next_check").on(table.status, table.nextCheckAt),
  ],
);

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monitorId: integer("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    visibleText: text("visible_text").notNull(),
    htmlSnapshot: text("html_snapshot").notNull(),
    capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_snapshots_monitor_captured").on(
      table.monitorId,
      table.capturedAt,
    ),
  ],
);

export const changes = sqliteTable(
  "changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monitorId: integer("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    fromSnapshotId: integer("from_snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    toSnapshotId: integer("to_snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    addedJson: text("added_json").notNull().default("[]"),
    removedJson: text("removed_json").notNull().default("[]"),
    changeScore: integer("change_score").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_changes_monitor_created").on(table.monitorId, table.createdAt),
  ],
);
