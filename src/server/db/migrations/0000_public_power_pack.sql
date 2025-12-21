CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`network_id` text,
	FOREIGN KEY (`network_id`) REFERENCES `networks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`mac` text NOT NULL,
	`parent_interface_id` text,
	`network_id` text,
	`upstream_interface` text,
	`hostname` text,
	`ip` text,
	`vendor` text,
	`model` text,
	`firmware_version` text,
	`type` text,
	`accessible` integer,
	`open_ports` text,
	`driver` text,
	`comment` text,
	`nomad` integer DEFAULT false NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`parent_interface_id`) REFERENCES `interfaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`network_id`) REFERENCES `networks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_mac_unique` ON `devices` (`mac`);--> statement-breakpoint
CREATE INDEX `idx_devices_mac` ON `devices` (`mac`);--> statement-breakpoint
CREATE INDEX `idx_devices_network` ON `devices` (`network_id`);--> statement-breakpoint
CREATE INDEX `idx_devices_parent` ON `devices` (`parent_interface_id`);--> statement-breakpoint
CREATE TABLE `interfaces` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`name` text NOT NULL,
	`ip` text,
	`bridge` text,
	`vlan` text,
	`poe_watts` real,
	`poe_standard` text
);
--> statement-breakpoint
CREATE INDEX `idx_interfaces_device` ON `interfaces` (`device_id`);--> statement-breakpoint
CREATE TABLE `matched_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text,
	`mac` text NOT NULL,
	`hostname` text,
	`ip` text,
	FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `networks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`root_ip` text NOT NULL,
	`root_username` text NOT NULL,
	`root_password` text NOT NULL,
	`created_at` text NOT NULL,
	`last_scanned_at` text,
	`device_count` integer,
	`is_online` integer
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`network_id` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`root_ip` text NOT NULL,
	`device_count` integer,
	FOREIGN KEY (`network_id`) REFERENCES `networks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);