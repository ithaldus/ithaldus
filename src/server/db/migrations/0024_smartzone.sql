-- Add SmartZone integration fields to networks table
ALTER TABLE networks ADD COLUMN smartzone_host TEXT;
ALTER TABLE networks ADD COLUMN smartzone_port INTEGER DEFAULT 8443;
ALTER TABLE networks ADD COLUMN smartzone_username TEXT;
ALTER TABLE networks ADD COLUMN smartzone_password TEXT;
