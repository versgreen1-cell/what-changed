CREATE TABLE `changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`from_snapshot_id` integer NOT NULL,
	`to_snapshot_id` integer NOT NULL,
	`summary` text NOT NULL,
	`added_json` text DEFAULT '[]' NOT NULL,
	`removed_json` text DEFAULT '[]' NOT NULL,
	`change_score` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_changes_monitor_created` ON `changes` (`monitor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`frequency_minutes` integer DEFAULT 1440 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_checked_at` text,
	`next_check_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monitors_url` ON `monitors` (`url`);--> statement-breakpoint
CREATE INDEX `idx_monitors_next_check` ON `monitors` (`status`,`next_check_at`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`content_hash` text NOT NULL,
	`visible_text` text NOT NULL,
	`html_snapshot` text NOT NULL,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_monitor_captured` ON `snapshots` (`monitor_id`,`captured_at`);