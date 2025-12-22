import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

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

// Credentials table
export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  password: text('password').notNull(),
  networkId: text('network_id').references(() => networks.id, { onDelete: 'cascade' }),
})

// Matched devices (credential-device associations)
export const matchedDevices = sqliteTable('matched_devices', {
  id: text('id').primaryKey(),
  credentialId: text('credential_id').references(() => credentials.id, { onDelete: 'cascade' }),
  mac: text('mac').notNull(),
  hostname: text('hostname'),
  ip: text('ip'),
})

// Interfaces table (ports on devices)
export const interfaces = sqliteTable('interfaces', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  name: text('name').notNull(),
  ip: text('ip'),
  bridge: text('bridge'),
  vlan: text('vlan'),
  poeWatts: real('poe_watts'),
  poeStandard: text('poe_standard'),
}, (table) => [
  index('idx_interfaces_device').on(table.deviceId),
])

// Devices table (global by MAC, current topology position)
export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  mac: text('mac').notNull().unique(),
  // Current topology position
  parentInterfaceId: text('parent_interface_id').references(() => interfaces.id),
  networkId: text('network_id').references(() => networks.id),
  upstreamInterface: text('upstream_interface'),
  // Device info (updated on each scan)
  hostname: text('hostname'),
  ip: text('ip'),
  vendor: text('vendor'),
  model: text('model'),
  firmwareVersion: text('firmware_version'),
  type: text('type', { enum: ['router', 'switch', 'access-point', 'end-device'] }),
  accessible: integer('accessible', { mode: 'boolean' }),
  openPorts: text('open_ports'),
  driver: text('driver'),
  // Metadata (user-managed)
  comment: text('comment'),
  nomad: integer('nomad', { mode: 'boolean' }).notNull().default(false),
  userType: text('user_type', { enum: ['router', 'switch', 'access-point', 'server', 'computer', 'phone', 'tv', 'tablet', 'printer', 'camera', 'iot'] }),
  lastSeenAt: text('last_seen_at').notNull(),
}, (table) => [
  index('idx_devices_mac').on(table.mac),
  index('idx_devices_network').on(table.networkId),
  index('idx_devices_parent').on(table.parentInterfaceId),
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

// DHCP leases table (stores leases from root device for hostname resolution)
export const dhcpLeases = sqliteTable('dhcp_leases', {
  id: text('id').primaryKey(),
  networkId: text('network_id').notNull().references(() => networks.id, { onDelete: 'cascade' }),
  mac: text('mac').notNull(),
  ip: text('ip'),
  hostname: text('hostname'),
  lastSeenAt: text('last_seen_at').notNull(),
}, (table) => [
  index('idx_dhcp_leases_network').on(table.networkId),
  index('idx_dhcp_leases_mac').on(table.mac),
])

// Type exports for use in application
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Network = typeof networks.$inferSelect
export type NewNetwork = typeof networks.$inferInsert
export type Credential = typeof credentials.$inferSelect
export type NewCredential = typeof credentials.$inferInsert
export type MatchedDevice = typeof matchedDevices.$inferSelect
export type NewMatchedDevice = typeof matchedDevices.$inferInsert
export type Interface = typeof interfaces.$inferSelect
export type NewInterface = typeof interfaces.$inferInsert
export type Device = typeof devices.$inferSelect
export type NewDevice = typeof devices.$inferInsert
export type Scan = typeof scans.$inferSelect
export type NewScan = typeof scans.$inferInsert
export type DhcpLease = typeof dhcpLeases.$inferSelect
export type NewDhcpLease = typeof dhcpLeases.$inferInsert
