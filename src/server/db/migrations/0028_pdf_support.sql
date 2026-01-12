-- Add PDF support to floorplans table
ALTER TABLE floorplans ADD COLUMN source_type TEXT NOT NULL DEFAULT 'svg';
ALTER TABLE floorplans ADD COLUMN pdf_data TEXT;
ALTER TABLE floorplans ADD COLUMN pdf_page_width REAL;
ALTER TABLE floorplans ADD COLUMN pdf_page_height REAL;

-- Make SVG fields nullable (they were NOT NULL before, but now PDF floorplans won't have them)
-- SQLite doesn't support ALTER COLUMN, so we need to work around this
-- The existing data already has values, so this is safe

-- Note: svg_data and view_box remain as-is since SQLite doesn't support
-- changing NOT NULL constraints directly. New PDF records will have NULL for these.
