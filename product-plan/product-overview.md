# TopoGraph — Product Overview

## Summary

A network topology discovery and visualization tool for municipal institutions. It connects to a root router via SSH, recursively discovers downstream switches and access points through DHCP leases, ARP tables, MAC tables, and neighbor discovery, then renders a real-time interactive tree map that can be exported to PDF for management presentations.

## Key Problems Solved

1. **No visibility into physical network structure** — Automatically discovers and maps the network hierarchy by querying routers and managed switches
2. **Manual documentation is outdated** — Live discovery with caching ensures topology is always current
3. **Difficult to present network info to management** — Generates clean hierarchical tree view that exports to PDF
4. **Different institutions use different hardware** — Driver-based architecture supports MikroTik, Zyxel, Inteno, and more
5. **Discovery process is opaque** — Real-time WebSocket updates show debug console and live map updates
6. **Devices have varying credentials** — Credential store with multiple combinations; successful logins cached per-device

## Planned Sections

1. **Login** — MS365 OAuth authentication screen. Users sign in with their Microsoft account, and only whitelisted email addresses can access the app.

2. **Networks** — Multi-network management hub. Each network represents a separate site with its own root router and topology. Admins can create, edit, and delete networks.

3. **Topology Discovery** — The main screen where you enter the root router IP, start a scan, watch real-time progress in the debug console, and see the network map build live with expandable device cards.

4. **Credentials** — Manage username/password combinations to try during discovery. Supports global credentials and network-specific credentials via a tabbed interface.

5. **User Management** — Admin-only section for managing the user whitelist. Add users by email, assign roles (admin/user), and remove access.

## Data Model

**Core Entities:**
- User — Application users with email whitelist and role-based access
- Network — Standalone network environments with root device credentials
- Device — Network devices discovered in topology (routers, switches, APs, end devices)
- Interface — Physical/logical ports on devices with downstream connections
- Credential — Username/password combinations (global or network-specific)
- DeviceCache — Global metadata cache by MAC address (comments, nomad status)
- Topology — Complete network map from a discovery scan

## Design System

**Colors:**
- Primary: `cyan` — Used for buttons, links, key accents
- Secondary: `amber` — Used for tags, highlights, warnings
- Neutral: `slate` — Used for backgrounds, text, borders

**Typography:**
- Heading: Inter
- Body: Inter
- Mono: JetBrains Mono

## Implementation Sequence

Build this product in milestones (auth bypass first, MS365 OAuth last):

1. **Foundation** — Set up Vite + Hono + React, design tokens, database schema, auth bypass
2. **User Management** — Admin-only user whitelist management (seed test users first)
3. **Networks** — Network management hub with CRUD operations
4. **Credentials** — Credential management with global and network-specific scopes
5. **Topology Discovery** — Real-time network scanning and visualization
6. **Login** — MS365 OAuth authentication with email whitelist (implement last)

Each milestone has a dedicated instruction document in `product-plan/instructions/`.
