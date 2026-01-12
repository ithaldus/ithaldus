-- Create floorplans table
CREATE TABLE floorplans (
  id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  svg_data TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_floorplans_network ON floorplans(network_id);

-- Create location_polygons table
CREATE TABLE location_polygons (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  floorplan_id TEXT NOT NULL REFERENCES floorplans(id) ON DELETE CASCADE,
  points TEXT NOT NULL,
  fill_color TEXT DEFAULT '#8b5cf6',
  fill_opacity REAL DEFAULT 0.3,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_location_polygons_location ON location_polygons(location_id);
CREATE INDEX idx_location_polygons_floorplan ON location_polygons(floorplan_id);
