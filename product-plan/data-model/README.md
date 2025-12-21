# Data Model

## Overview

TopoGraph's data model centers around network topology discovery. The core entities support multi-network management, device discovery, credential storage, and user access control.

## Core Entities

### User
Application users with email whitelist and role-based access.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| email | string | Email address (used for OAuth verification) |
| name | string | Display name |
| role | 'admin' \| 'user' | Access level |
| createdAt | string (ISO) | When user was added |
| lastLoginAt | string \| null | Last successful login |

### Network
Standalone network environments with root device credentials.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| name | string | Network name (e.g., "Tõrva Gümnaasium") |
| rootIp | string | Root router IP address |
| rootUsername | string | SSH username for root device |
| rootPassword | string | SSH password for root device |
| createdAt | string (ISO) | When network was created |
| lastScannedAt | string \| null | Last topology scan timestamp |
| isOnline | boolean \| null | Root device ping status |

### Device
Network devices discovered in topology. Each device has ONE parent interface at a time.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| mac | string | MAC address (unique) |
| parentInterfaceId | string \| null | Parent interface this device connects to (null for root) |
| networkId | string \| null | Network this device currently belongs to |
| upstreamInterface | string \| null | Port on THIS device connecting to parent |
| hostname | string \| null | Device hostname |
| ip | string \| null | IP address |
| type | DeviceType | router, switch, access-point, end-device |
| vendor | string \| null | Vendor name |
| model | string \| null | Model name |
| firmwareVersion | string \| null | Firmware version string |
| accessible | boolean | SSH/Telnet login succeeded |
| openPorts | number[] | Discovered open ports |
| driver | DriverType \| null | Communication driver |
| comment | string \| null | User-entered location note |
| nomad | boolean | Device moves freely between networks |
| lastSeenAt | string (ISO) | Last scan timestamp |
| interfaces | Interface[] | Device interfaces |

### Interface
Physical/logical ports on devices.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| deviceId | string | Parent device ID |
| name | string | Interface name (e.g., "ether1", "wlan0") |
| ip | string \| null | IP address assigned |
| bridge | string \| null | Bridge membership |
| vlan | string \| null | VLAN assignment |
| poe | PoeData \| undefined | PoE power data if supplying power |

### Session
Database-backed authentication sessions.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Session token (UUID) |
| userId | string | User this session belongs to |
| createdAt | string (ISO) | When session was created |
| expiresAt | string (ISO) | When session expires |

### Scan
Scan history records per network.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| networkId | string | Network that was scanned |
| startedAt | string (ISO) | When scan started |
| completedAt | string (ISO) \| null | When scan completed |
| status | 'running' \| 'completed' \| 'failed' | Scan status |
| rootIp | string | Root device IP |
| deviceCount | number \| null | Devices found |

### Credential
Username/password combinations for device access.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| username | string | SSH/Telnet username |
| password | string | SSH/Telnet password |
| networkId | string \| null | Scope (null = global) |
| matchedDevices | MatchedDevice[] | Devices this credential works on |

## Relationships

```
User --< Session (database-backed auth)

Network --< Scan (scan history)
Network --< Credential (network-specific)
Network --< Device (devices belong to a network)

Device --< Interface (device ports)
Device --> Interface (parentInterfaceId - topology link)

Credential --< MatchedDevice (successful auths)
```

## Key Design Decisions

1. **Device metadata is unified** — Device table stores all info including comment, nomad, lastSeenAt. No separate cache table.

2. **One parent per device** — Each device has ONE parentInterfaceId at a time (reflects physical reality). Topology tree built by walking these relationships.

3. **Topology is normalized** — Devices and interfaces stored in relational tables. Tree view reconstructed via queries, not stored as JSON blob.

4. **Credential priority** — Network-specific tried first, then global. Success recorded in matchedDevices table.

5. **Virtual switches are frontend-only** — Inferred from wired interfaces with multiple inaccessible children.

6. **Moved device detection** — Compare device.networkId before and after scan. If changed (and not nomad), show "Moved" badge.

7. **Database-backed sessions** — Sessions stored in sessions table with expiry. No JWT.
