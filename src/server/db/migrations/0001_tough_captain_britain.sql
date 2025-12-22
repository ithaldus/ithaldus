CREATE TABLE `dhcp_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`network_id` text NOT NULL,
	`mac` text NOT NULL,
	`ip` text,
	`hostname` text,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`network_id`) REFERENCES `networks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_dhcp_leases_network` ON `dhcp_leases` (`network_id`);--> statement-breakpoint
CREATE INDEX `idx_dhcp_leases_mac` ON `dhcp_leases` (`mac`);