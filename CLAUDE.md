# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All development runs inside Docker. Start the dev server first, then run commands inside the container.

```bash
# Start development server
./dev.sh                                      # Linux/Mac
dev.cmd                                       # Windows

# Run database migrations
docker compose exec dev bun run db:migrate

# Seed database (creates admin/admin123 user)
docker compose exec dev bun run db:seed

# Generate new migration after schema changes
docker compose exec dev bun run db:generate

# View logs
docker compose logs -f dev

# Stop server
docker compose down
```

The dev server runs on http://localhost:3000.

## Architecture

### Stack
- **Runtime**: Bun
- **Frontend**: React + Vite + TailwindCSS + react-router-dom
- **Backend**: Hono (Express-like framework)
- **Database**: SQLite + Drizzle ORM
- **SSH**: ssh2 library for device communication

### Development Server
In development, two servers run in parallel:
- **Vite** on port 5173 - serves frontend with HMR, proxies `/api/*` to Bun
- **Bun API** on port 3001 - handles all `/api/*` requests

Docker exposes port 5173 → host port 3000, so access the app at http://localhost:3000.

### Project Structure
```
src/
├── client/              # React frontend
│   ├── components/      # Reusable UI components
│   ├── hooks/           # React hooks (useAuth)
│   ├── lib/             # API client utilities
│   └── routes/          # Page components
└── server/              # Hono backend
    ├── db/              # Drizzle schema, migrations, seed
    ├── middleware/      # Auth middleware
    └── routes/          # API route handlers
```

### API Architecture
- All API routes are under `/api/*`
- Auth routes (`/api/auth/*`) are public
- All other routes require authentication via `authMiddleware`
- Routes: `auth`, `users`, `networks`, `credentials`, `devices`, `scan`

### Scanning Service (src/server/services/scanner.ts)
The NetworkScanner class handles SSH-based network topology discovery:
- Connects to root router and recursively discovers downstream devices
- Detects device vendors (MikroTik, Ubiquiti, etc.) and uses appropriate drivers
- Collects DHCP leases, ARP tables, and bridge hosts to find neighbors
- Stores discovered devices and interfaces in the database
- Provides callbacks for real-time log messages and device discovery events

### Scan API (src/server/routes/scan.ts)
- `POST /api/scan/:networkId/start` - Start network scan (admin only)
- `GET /api/scan/:networkId/status` - Get current scan status
- `GET /api/scan/:networkId/logs?after=N` - Poll for new log messages
- `GET /api/scan/:networkId/topology` - Get device tree with interfaces
- `GET /api/scan/:networkId/history` - Get scan history

### Database Schema (src/server/db/schema.ts)
Core tables: `users`, `sessions`, `networks`, `credentials`, `devices`, `interfaces`, `scans`, `matchedDevices`
- Devices are global (identified by MAC address) with network topology position
- Interfaces represent ports on devices
- Scans track discovery history per network

### Frontend Routing (src/client/App.tsx)
- `/login` - Public login page
- `/networks` - List of networks (default)
- `/networks/:networkId` - Topology view for a network
- `/credentials` - Credential management
- `/users` - User management (admin only)

All routes except `/login` are protected via `ProtectedRoute`. User management requires admin role via `AdminRoute`.

### Topology Components (src/client/components/topology/)
- `DeviceCard` - Expandable device card for topology tree with status badges, ports, and vendor info
- `DeviceModal` - Device detail modal with credential testing and comment editing
- `DebugConsole` - Resizable sidebar showing real-time scan logs
- `VendorLogo` - SVG logos for common network vendors (MikroTik, Ubiquiti, etc.)

## Design System

### Colors
- **Primary**: `primary-*` (cyan) - buttons, links, active states
- **Secondary**: `secondary-*` (amber) - warnings, highlights
- **Neutral**: `slate-*` - backgrounds, text, borders
- Status colors: green (success), red (error), orange (warning), violet (bridges), blue (VLANs)

### Typography
- **Sans**: Inter - headings, body text, UI
- **Mono**: JetBrains Mono - IP addresses, MAC addresses, code

### Dark Mode
Enabled via `dark:` Tailwind variants. Set via `darkMode: 'class'` in config.

## Environment Variables

Development uses `AUTH_BYPASS=true` for simplified login.

Production requires:
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` - MS365 OAuth
- `SESSION_SECRET` - Session encryption
- `APP_URL` - Application URL
- `DATABASE_URL` - SQLite file path
