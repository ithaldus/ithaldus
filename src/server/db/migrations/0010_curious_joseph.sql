ALTER TABLE `matched_devices` ADD `network_id` text REFERENCES networks(id);--> statement-breakpoint
CREATE INDEX `idx_matched_devices_network` ON `matched_devices` (`network_id`);