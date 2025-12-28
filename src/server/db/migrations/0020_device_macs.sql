-- Migration: Add device_macs table for 1:many MAC-device relationship
-- This allows a single device to have multiple MAC addresses (one per interface)

-- 1. Create device_macs table with constraints
CREATE TABLE `device_macs` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`mac` text NOT NULL,
	`source` text DEFAULT 'ssh' NOT NULL,
	`interface_name` text,
	`is_primary` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);

-- 2. Add unique constraint on MAC (globally unique across all devices)
CREATE UNIQUE INDEX `device_macs_mac_unique` ON `device_macs` (`mac`);

-- 3. Add indexes for performance
CREATE INDEX `idx_device_macs_device` ON `device_macs` (`device_id`);
CREATE INDEX `idx_device_macs_mac` ON `device_macs` (`mac`);

-- 4. Trigger: When inserting a primary MAC, demote existing primary
CREATE TRIGGER ensure_single_primary_mac
BEFORE INSERT ON device_macs
WHEN NEW.is_primary = 1
BEGIN
  UPDATE device_macs SET is_primary = 0 WHERE device_id = NEW.device_id AND is_primary = 1;
END;

-- 5. Trigger: Auto-set first MAC as primary
CREATE TRIGGER set_first_mac_primary
AFTER INSERT ON device_macs
WHEN (SELECT COUNT(*) FROM device_macs WHERE device_id = NEW.device_id) = 1
BEGIN
  UPDATE device_macs SET is_primary = 1 WHERE id = NEW.id;
END;

-- 6. Trigger: Ensure device always has a primary MAC after delete
CREATE TRIGGER ensure_primary_after_delete
AFTER DELETE ON device_macs
WHEN NOT EXISTS (SELECT 1 FROM device_macs WHERE device_id = OLD.device_id AND is_primary = 1)
  AND EXISTS (SELECT 1 FROM device_macs WHERE device_id = OLD.device_id)
BEGIN
  UPDATE device_macs
  SET is_primary = 1
  WHERE id = (SELECT id FROM device_macs WHERE device_id = OLD.device_id ORDER BY created_at ASC LIMIT 1);
END;

-- 7. CHECK constraint on source enum (SQLite supports CHECK)
-- Note: Drizzle doesn't auto-generate CHECK, so we add it manually
-- This is enforced at insert time

-- 8. Migrate existing devices - copy MAC to device_macs table
INSERT INTO `device_macs` (`id`, `device_id`, `mac`, `source`, `is_primary`, `created_at`)
SELECT
  lower(hex(randomblob(10))) || lower(hex(randomblob(1))),
  id,
  mac,
  'ssh',
  1,
  COALESCE(last_seen_at, datetime('now'))
FROM devices
WHERE mac IS NOT NULL AND mac NOT LIKE 'UNKNOWN-%';

-- 9. Add mac column to interfaces table (for tracking interface MACs)
ALTER TABLE `interfaces` ADD COLUMN `mac` text;

-- 10. Add device_id to matched_devices table
ALTER TABLE `matched_devices` ADD COLUMN `device_id` text REFERENCES `devices`(`id`) ON DELETE cascade;
CREATE INDEX `idx_matched_devices_device` ON `matched_devices` (`device_id`);

-- 11. Populate device_id in matched_devices from MAC lookup
UPDATE `matched_devices` SET `device_id` = (
  SELECT dm.device_id FROM device_macs dm WHERE dm.mac = matched_devices.mac LIMIT 1
) WHERE mac IS NOT NULL;

-- 12. Add device_id to failed_credentials table
ALTER TABLE `failed_credentials` ADD COLUMN `device_id` text REFERENCES `devices`(`id`) ON DELETE cascade;
CREATE INDEX `idx_failed_credentials_device` ON `failed_credentials` (`device_id`);

-- 13. Populate device_id in failed_credentials from MAC lookup
UPDATE `failed_credentials` SET `device_id` = (
  SELECT dm.device_id FROM device_macs dm WHERE dm.mac = failed_credentials.mac LIMIT 1
) WHERE mac IS NOT NULL;

-- 14. Rename devices.mac to devices.primary_mac
-- SQLite doesn't support RENAME COLUMN in older versions, so we use the newer syntax
ALTER TABLE `devices` RENAME COLUMN `mac` TO `primary_mac`;

-- 15. Drop the old unique index on mac and create new index on primary_mac
DROP INDEX IF EXISTS `devices_mac_unique`;
DROP INDEX IF EXISTS `idx_devices_mac`;
CREATE INDEX `idx_devices_primary_mac` ON `devices` (`primary_mac`);
