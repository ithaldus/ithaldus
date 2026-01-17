-- ============================================================================
-- IT Haldus Database Schema
-- Organization IT Management Tool
-- Database: SQLite
-- ============================================================================

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

-- Users table: Application users who can log in and manage networks
-- Roles: 'admin' has full access, 'user' has limited access
CREATE TABLE users (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    email TEXT NOT NULL UNIQUE,                    -- User's email address (used for login)
    name TEXT NOT NULL,                            -- Display name
    role TEXT NOT NULL DEFAULT 'user'              -- 'admin' or 'user'
        CHECK (role IN ('admin', 'user')),
    created_at TEXT NOT NULL,                      -- ISO timestamp of account creation
    last_login_at TEXT                             -- ISO timestamp of last login (nullable)
);

-- Sessions table: Database-backed session storage for authentication
-- Sessions are tied to users and have expiration times
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,                           -- Session token
    user_id TEXT NOT NULL                          -- Owner of this session
        REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,                      -- When session was created
    expires_at TEXT NOT NULL                       -- When session expires
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ============================================================================
-- NETWORKS & LOCATIONS
-- ============================================================================

-- Networks table: Represents a network to be scanned
-- Each network has a root device (gateway/router) that serves as entry point
CREATE TABLE networks (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    name TEXT NOT NULL,                            -- Human-friendly network name
    root_ip TEXT NOT NULL,                         -- IP address of the root/gateway device
    root_username TEXT NOT NULL,                   -- SSH username for root device
    root_password TEXT NOT NULL,                   -- SSH password for root device
    created_at TEXT NOT NULL,                      -- When this network was added
    last_scanned_at TEXT,                          -- When last scan completed
    device_count INTEGER,                          -- Cached count of devices in network
    is_online INTEGER                              -- Boolean: is root device reachable?
);

-- Locations table: Physical locations within a network
-- Used to organize devices by physical placement (e.g., "Server Room", "Floor 2")
CREATE TABLE locations (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    network_id TEXT NOT NULL                       -- Which network this location belongs to
        REFERENCES networks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                            -- Location name
    created_at TEXT NOT NULL                       -- When this location was created
);
CREATE INDEX idx_locations_network ON locations(network_id);

-- ============================================================================
-- CREDENTIALS
-- ============================================================================

-- Credentials table: SSH credentials for accessing network devices
-- Can be global (networkId=NULL) or network-specific
CREATE TABLE credentials (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    username TEXT NOT NULL,                        -- SSH username
    password TEXT NOT NULL,                        -- SSH password
    network_id TEXT                                -- Optional: limit to specific network
        REFERENCES networks(id) ON DELETE CASCADE
);

-- Matched devices: Tracks which credentials work for which devices
-- Used to remember successful credential-device pairings
CREATE TABLE matched_devices (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    credential_id TEXT                             -- Which credential was successful
        REFERENCES credentials(id) ON DELETE CASCADE,
    mac TEXT NOT NULL,                             -- Device MAC address (identifier)
    hostname TEXT,                                 -- Device hostname at time of match
    ip TEXT                                        -- Device IP at time of match
);

-- ============================================================================
-- DEVICES & INTERFACES
-- ============================================================================

-- Interfaces table: Network ports/interfaces on devices
-- Each device can have multiple interfaces (ethernet ports, WiFi, etc.)
CREATE TABLE interfaces (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    device_id TEXT NOT NULL,                       -- Which device this interface belongs to
    name TEXT NOT NULL,                            -- Interface name (e.g., "ether1", "wlan0")
    ip TEXT,                                       -- IP address assigned to this interface
    bridge TEXT,                                   -- Bridge group this interface belongs to
    vlan TEXT,                                     -- VLAN ID if applicable
    poe_watts REAL,                                -- PoE power consumption in watts
    poe_standard TEXT                              -- PoE standard (e.g., "af", "at", "bt")
);
CREATE INDEX idx_interfaces_device ON interfaces(device_id);

-- Devices table: Network devices discovered during scans
-- Devices are globally unique by MAC address and track current topology position
CREATE TABLE devices (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    mac TEXT NOT NULL UNIQUE,                      -- MAC address (globally unique identifier)

    -- Current topology position (where device is connected)
    parent_interface_id TEXT                       -- Interface this device is connected to
        REFERENCES interfaces(id),
    network_id TEXT                                -- Which network this device belongs to
        REFERENCES networks(id),
    upstream_interface TEXT,                       -- Name of interface facing upstream

    -- Device information (updated on each scan)
    hostname TEXT,                                 -- Device hostname
    ip TEXT,                                       -- Current IP address
    vendor TEXT,                                   -- Manufacturer (e.g., "MikroTik", "Ubiquiti")
    model TEXT,                                    -- Device model (e.g., "CRS328-4C-20S-4S+RM")
    serial_number TEXT,                            -- Hardware serial number
    firmware_version TEXT,                         -- Current firmware/software version
    type TEXT                                      -- Detected device type
        CHECK (type IN ('router', 'switch', 'access-point', 'end-device')),
    accessible INTEGER,                            -- Boolean: can we SSH into this device?
    open_ports TEXT,                               -- Comma-separated list of open ports
    driver TEXT,                                   -- Which driver was used to query device

    -- User-managed metadata
    comment TEXT,                                  -- User notes about this device
    location_id TEXT                               -- Physical location of device
        REFERENCES locations(id) ON DELETE SET NULL,
    asset_tag TEXT,                                -- Asset management tag/label
    nomad INTEGER NOT NULL DEFAULT 0,              -- Boolean: device moves between locations
    skip_login INTEGER NOT NULL DEFAULT 0,         -- Boolean: don't attempt SSH during scan
    user_type TEXT                                 -- User-override of device type
        CHECK (user_type IN ('router', 'switch', 'access-point', 'server',
               'computer', 'phone', 'desktop-phone', 'tv', 'tablet',
               'printer', 'camera', 'iot')),
    last_seen_at TEXT NOT NULL                     -- When device was last seen in a scan
);
CREATE INDEX idx_devices_mac ON devices(mac);
CREATE INDEX idx_devices_network ON devices(network_id);
CREATE INDEX idx_devices_parent ON devices(parent_interface_id);
CREATE INDEX idx_devices_location ON devices(location_id);

-- Device images: Photos of physical devices
-- Stored as base64-encoded data for simplicity
CREATE TABLE device_images (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    device_id TEXT NOT NULL                        -- Which device this image shows
        REFERENCES devices(id) ON DELETE CASCADE,
    data TEXT NOT NULL,                            -- Base64-encoded image data
    mime_type TEXT NOT NULL,                       -- MIME type (e.g., 'image/jpeg')
    created_at TEXT NOT NULL                       -- When image was uploaded
);
CREATE INDEX idx_device_images_device ON device_images(device_id);

-- ============================================================================
-- SCANNING & LOGS
-- ============================================================================

-- Scans table: History of network scans
-- Each scan discovers/updates devices in a network
CREATE TABLE scans (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    network_id TEXT NOT NULL                       -- Which network was scanned
        REFERENCES networks(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,                      -- When scan started
    completed_at TEXT,                             -- When scan finished (null if running)
    status TEXT NOT NULL                           -- Current scan status
        CHECK (status IN ('running', 'completed', 'failed')),
    root_ip TEXT NOT NULL,                         -- Root device IP used for this scan
    device_count INTEGER                           -- Number of devices found
);

-- Scan logs: Detailed log messages from scans
-- Persisted for debugging and audit purposes
CREATE TABLE scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,          -- Auto-incrementing log ID
    scan_id TEXT NOT NULL                          -- Which scan this log belongs to
        REFERENCES scans(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,                       -- ISO timestamp of log entry
    level TEXT NOT NULL                            -- Log level
        CHECK (level IN ('info', 'success', 'warn', 'error')),
    message TEXT NOT NULL,                         -- Log message content
    device TEXT                                    -- Optional: related device hostname/IP
);
CREATE INDEX idx_scan_logs_scan ON scan_logs(scan_id);

-- ============================================================================
-- DHCP
-- ============================================================================

-- DHCP leases: Cached DHCP lease information from root device
-- Used for hostname resolution when devices don't report their own hostname
CREATE TABLE dhcp_leases (
    id TEXT PRIMARY KEY,                           -- Unique identifier (nanoid)
    network_id TEXT NOT NULL                       -- Which network this lease is from
        REFERENCES networks(id) ON DELETE CASCADE,
    mac TEXT NOT NULL,                             -- Client MAC address
    ip TEXT,                                       -- Assigned IP address
    hostname TEXT,                                 -- Client-reported hostname
    last_seen_at TEXT NOT NULL                     -- When this lease was last seen
);
CREATE INDEX idx_dhcp_leases_network ON dhcp_leases(network_id);
CREATE INDEX idx_dhcp_leases_mac ON dhcp_leases(mac);
