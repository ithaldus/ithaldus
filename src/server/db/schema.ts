import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  createdAt: text('created_at').notNull(),
  lastLoginAt: text('last_login_at'),
})

// Sessions table (database-backed sessions)
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
}, (table) => [
  index('idx_sessions_user').on(table.userId),
])

// Networks table
export const networks = sqliteTable('networks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rootIp: text('root_ip').notNull(),
  rootUsername: text('root_username').notNull(),
  rootPassword: text('root_password').notNull(),
  createdAt: text('created_at').notNull(),
  lastScannedAt: text('last_scanned_at'),
  deviceCount: integer('device_count'),
  isOnline: integer('is_online', { mode: 'boolean' }),
})

// Locations table (physical locations within a network)
export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  networkId: text('network_id').notNull().references(() => networks.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_locations_network').on(table.networkId),
])

// Credentials table
export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  password: text('password').notNull(),
  networkId: text('network_id').references(() => networks.id, { onDelete: 'cascade' }),
  isRoot: integer('is_root', { mode: 'boolean' }).notNull().default(false),
})
// Note: unique index is created manually in migration with COALESCE for NULL handling:
// CREATE UNIQUE INDEX idx_credentials_unique ON credentials (username, password, COALESCE(network_id, ''))

// Matched devices (credential-device associations)
export const matchedDevices = sqliteTable('matched_devices', {
  id: text('id').primaryKey(),
  credentialId: text('credential_id').references(() => credentials.id, { onDelete: 'cascade' }),
  networkId: text('network_id').references(() => networks.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }),  // FK to device
  mac: text('mac'),  // Kept for backwards compatibility, may be null for new records
  hostname: text('hostname'),
  ip: text('ip'),
  service: text('service').default('ssh'),  // Service type: ssh, api, web, etc.
}, (table) => [
  index('idx_matched_devices_network').on(table.networkId),
  index('idx_matched_devices_device').on(table.deviceId),
])

// Interfaces table (ports on devices)
export const interfaces = sqliteTable('interfaces', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  name: text('name').notNull(),
  mac: text('mac'),  // Interface MAC address (if known)
  ip: text('ip'),
  bridge: text('bridge'),
  vlan: text('vlan'),
  poeWatts: real('poe_watts'),
  poeStandard: text('poe_standard'),
  comment: text('comment'),  // Interface description/comment from device
  linkUp: integer('link_up', { mode: 'boolean' }),  // Interface link status
}, (table) => [
  index('idx_interfaces_device').on(table.deviceId),
])

// Devices table (global by MAC, current topology position)
export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  primaryMac: text('primary_mac').notNull(),  // Primary MAC address (for display, not unique - uniqueness in deviceMacs)
  // Current topology position
  parentInterfaceId: text('parent_interface_id').references(() => interfaces.id),
  networkId: text('network_id').references(() => networks.id),
  upstreamInterface: text('upstream_interface'),
  ownUpstreamInterface: text('own_upstream_interface'),  // The device's own physical upstream port
  // Device info (updated on each scan)
  hostname: text('hostname'),
  ip: text('ip'),
  vendor: text('vendor'),
  model: text('model'),
  serialNumber: text('serial_number'),
  firmwareVersion: text('firmware_version'),
  type: text('type', { enum: ['router', 'switch', 'access-point', 'end-device', 'server', 'computer', 'phone', 'desktop-phone', 'tv', 'tablet', 'printer', 'camera', 'iot'] }),
  accessible: integer('accessible', { mode: 'boolean' }),
  openPorts: text('open_ports'),
  warningPorts: text('warning_ports'),  // Ports that should be highlighted as warnings (e.g., insecure HTTP, telnet)
  driver: text('driver'),
  // Metadata (user-managed)
  comment: text('comment'),
  locationId: text('location_id').references(() => locations.id, { onDelete: 'set null' }),
  assetTag: text('asset_tag'),
  nomad: integer('nomad', { mode: 'boolean' }).notNull().default(false),
  skipLogin: integer('skip_login', { mode: 'boolean' }).notNull().default(false),
  lastSeenAt: text('last_seen_at').notNull(),
}, (table) => [
  index('idx_devices_primary_mac').on(table.primaryMac),
  index('idx_devices_network').on(table.networkId),
  index('idx_devices_parent').on(table.parentInterfaceId),
  index('idx_devices_location').on(table.locationId),
])

// Device MACs table (multiple MACs per device)
// A single physical device can have multiple MAC addresses (one per interface)
export const deviceMacs = sqliteTable('device_macs', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  mac: text('mac').notNull().unique(),  // MAC is globally unique across all devices
  source: text('source', { enum: ['ssh', 'arp', 'dhcp', 'mndp', 'cdp', 'lldp', 'bridge-host'] }).notNull(),
  interfaceName: text('interface_name'),  // Which interface this MAC belongs to (if known)
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_device_macs_device').on(table.deviceId),
  index('idx_device_macs_mac').on(table.mac),
])

// Scans table (scan history per network)
export const scans = sqliteTable('scans', {
  id: text('id').primaryKey(),
  networkId: text('network_id').notNull().references(() => networks.id, { onDelete: 'cascade' }),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
  rootIp: text('root_ip').notNull(),
  deviceCount: integer('device_count'),
})

// Scan logs table (persisted log messages)
export const scanLogs = sqliteTable('scan_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  timestamp: text('timestamp').notNull(),
  level: text('level', { enum: ['info', 'success', 'warn', 'error'] }).notNull(),
  message: text('message').notNull(),
  device: text('device'),  // Optional device hostname/IP for context
}, (table) => [
  index('idx_scan_logs_scan').on(table.scanId),
])

// DHCP leases table (stores leases from root device for hostname resolution)
export const dhcpLeases = sqliteTable('dhcp_leases', {
  id: text('id').primaryKey(),
  networkId: text('network_id').notNull().references(() => networks.id, { onDelete: 'cascade' }),
  mac: text('mac').notNull(),
  ip: text('ip'),
  hostname: text('hostname'),
  comment: text('comment'),  // Comment from static DHCP lease (can be used for device identification)
  lastSeenAt: text('last_seen_at').notNull(),
}, (table) => [
  index('idx_dhcp_leases_network').on(table.networkId),
  index('idx_dhcp_leases_mac').on(table.mac),
])

// Device images table (stores device photos)
export const deviceImages = sqliteTable('device_images', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  data: text('data').notNull(),  // Base64-encoded image data
  mimeType: text('mime_type').notNull(),  // e.g., 'image/jpeg', 'image/png'
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_device_images_device').on(table.deviceId),
])

// Stock images table (gallery of device photos by vendor+model)
// Used as fallback when a device has no custom image uploaded
export const stockImages = sqliteTable('stock_images', {
  id: text('id').primaryKey(),
  vendor: text('vendor').notNull(),
  model: text('model').notNull(),
  mimeType: text('mime_type'),  // NULL for placeholders (no image yet)
  data: text('data'),  // NULL for placeholders, base64-encoded when set
  deviceCount: integer('device_count').notNull().default(0),  // Approximate count of devices using this model
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
}, (table) => [
  // Unique constraint: one entry per vendor+model combo
  uniqueIndex('idx_stock_images_vendor_model').on(table.vendor, table.model),
])

// Failed credentials (credential-device pairs that failed SSH login)
// Used to skip known-bad credentials on future scans
export const failedCredentials = sqliteTable('failed_credentials', {
  id: text('id').primaryKey(),
  credentialId: text('credential_id').notNull().references(() => credentials.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }),  // FK to device
  mac: text('mac'),  // Kept for backwards compatibility, may be null for new records
  service: text('service').default('ssh'),  // Service type: ssh, api, web, etc.
  failedAt: text('failed_at').notNull(),
}, (table) => [
  index('idx_failed_credentials_credential').on(table.credentialId),
  index('idx_failed_credentials_device').on(table.deviceId),
  index('idx_failed_credentials_mac').on(table.mac),
])

// Type exports for use in application
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Network = typeof networks.$inferSelect
export type NewNetwork = typeof networks.$inferInsert
export type Location = typeof locations.$inferSelect
export type NewLocation = typeof locations.$inferInsert
export type Credential = typeof credentials.$inferSelect
export type NewCredential = typeof credentials.$inferInsert
export type MatchedDevice = typeof matchedDevices.$inferSelect
export type NewMatchedDevice = typeof matchedDevices.$inferInsert
export type Interface = typeof interfaces.$inferSelect
export type NewInterface = typeof interfaces.$inferInsert
export type Device = typeof devices.$inferSelect
export type NewDevice = typeof devices.$inferInsert
export type DeviceMac = typeof deviceMacs.$inferSelect
export type NewDeviceMac = typeof deviceMacs.$inferInsert
export type Scan = typeof scans.$inferSelect
export type NewScan = typeof scans.$inferInsert
export type DhcpLease = typeof dhcpLeases.$inferSelect
export type NewDhcpLease = typeof dhcpLeases.$inferInsert
export type ScanLog = typeof scanLogs.$inferSelect
export type NewScanLog = typeof scanLogs.$inferInsert
export type DeviceImage = typeof deviceImages.$inferSelect
export type NewDeviceImage = typeof deviceImages.$inferInsert
export type StockImage = typeof stockImages.$inferSelect
export type NewStockImage = typeof stockImages.$inferInsert
export type FailedCredential = typeof failedCredentials.$inferSelect
export type NewFailedCredential = typeof failedCredentials.$inferInsert
