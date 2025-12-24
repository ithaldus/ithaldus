CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`network_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`network_id`) REFERENCES `networks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_locations_network` ON `locations` (`network_id`);--> statement-breakpoint
ALTER TABLE `devices` ADD `location_id` text REFERENCES locations(id);--> statement-breakpoint
CREATE INDEX `idx_devices_location` ON `devices` (`location_id`);