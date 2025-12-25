CREATE TABLE `failed_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`mac` text NOT NULL,
	`failed_at` text NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_failed_credentials_credential` ON `failed_credentials` (`credential_id`);--> statement-breakpoint
CREATE INDEX `idx_failed_credentials_mac` ON `failed_credentials` (`mac`);