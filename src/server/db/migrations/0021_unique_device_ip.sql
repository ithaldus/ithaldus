-- Migration: Add unique constraint on (network_id, ip) for devices
-- This prevents duplicate devices with the same IP in the same network

-- Step 1: For each (network_id, ip) combination with duplicates,
-- keep the IP only on the most recently seen device.
-- Set IP to NULL for older devices (preserving the device records).
UPDATE devices
SET ip = NULL
WHERE id IN (
  SELECT d1.id
  FROM devices d1
  WHERE d1.ip IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM devices d2
      WHERE d2.ip = d1.ip
        AND COALESCE(d2.network_id, '') = COALESCE(d1.network_id, '')
        AND d2.last_seen_at > d1.last_seen_at
    )
);

-- Step 2: Create unique index on (network_id, ip) for non-NULL IPs
-- This allows multiple devices with NULL IPs but only one device per IP per network
CREATE UNIQUE INDEX idx_devices_network_ip
ON devices (network_id, ip)
WHERE ip IS NOT NULL;
