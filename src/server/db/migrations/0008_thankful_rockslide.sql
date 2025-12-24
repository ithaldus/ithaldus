CREATE TABLE `device_images` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`data` text NOT NULL,
	`mime_type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_device_images_device` ON `device_images` (`device_id`);