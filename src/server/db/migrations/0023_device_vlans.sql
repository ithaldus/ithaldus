-- Add vlans column to devices table for tracking VLAN membership
ALTER TABLE devices ADD COLUMN vlans TEXT;
