-- Add SmartZone enriched flag to devices table
-- Tracks whether device data came from SmartZone API vs direct device access
ALTER TABLE devices ADD COLUMN smartzone_enriched INTEGER DEFAULT 0 NOT NULL;
