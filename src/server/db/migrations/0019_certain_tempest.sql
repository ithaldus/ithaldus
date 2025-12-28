ALTER TABLE `failed_credentials` ADD `service` text DEFAULT 'ssh';--> statement-breakpoint
ALTER TABLE `matched_devices` ADD `service` text DEFAULT 'ssh';