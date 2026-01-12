-- Add viewBox column to floorplans table
ALTER TABLE floorplans ADD COLUMN view_box TEXT NOT NULL DEFAULT '0 0 800 600';
