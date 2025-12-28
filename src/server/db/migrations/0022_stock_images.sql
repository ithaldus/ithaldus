-- Migration: Add stock_images table for device image gallery
-- Used as fallback when a device has no custom image uploaded
-- Auto-populated with placeholders when new vendor+model combos are discovered

-- 1. Create stock_images table
CREATE TABLE `stock_images` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor` text NOT NULL,
	`model` text NOT NULL,
	`mime_type` text,
	`data` text,
	`device_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text
);

-- 2. Add unique constraint on vendor+model (case-insensitive)
CREATE UNIQUE INDEX `idx_stock_images_vendor_model` ON `stock_images` (`vendor`, `model`);
