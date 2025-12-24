CREATE TABLE `scan_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`device` text,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_scan_logs_scan` ON `scan_logs` (`scan_id`);