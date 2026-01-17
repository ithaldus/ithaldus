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

The dev server runs on the port configured via `PORT_WEB` in `.env`.

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

Docker exposes port 5173 → host port (configured via `PORT_WEB`, defaults to 3000). This instance runs on port 3100.

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
- `DeviceTypeFilter` - Filter buttons for device types with optional overflow menu

### URL Query Parameters (Topology View)
The topology view (`/networks/:networkId`) supports URL query parameters to customize the display:

| Parameter | Values | Description |
|-----------|--------|-------------|
| `sidebar` | `0`, `false` | Hide the navigation sidebar |
| `console` | `0`, `false` | Hide the debug console |
| `labels` | comma-separated | Show only specified labels (see below) |
| `types` | comma-separated | Show only specified device types |
| `filter` | string | Pre-fill the device filter input |
| `device` | device ID | Open device modal for specific device |

**Label values** (for `labels` parameter):
- Full names: `firmware`, `interfaces`, `vendor`, `enddevices`, `assettag`, `mac`, `ports`, `serialnumber`
- Short codes: `f`, `i`, `v`, `e`, `a`, `m`, `p`, `s`
- Use `labels=` or `labels=none` to hide all labels

**Device type values** (for `types` parameter):
`router`, `switch`, `access-point`, `server`, `computer`, `phone`, `desktop-phone`, `tv`, `tablet`, `printer`, `camera`, `iot`, `end-device`

**Example - Minimal UI for Playwright MCP testing:**
```
/networks/:networkId?sidebar=0&console=0&labels=
```
This hides sidebar, debug console, and all device labels to minimize DOM elements and avoid truncated Playwright snapshots.

**Example - Show only routers and switches with firmware info:**
```
/networks/:networkId?types=router,switch&labels=f,v
```

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

## Git Commits

Before committing, always set the commit author:
```bash
git commit --author="ithaldus <it@torva.ee>" -m "message"
```

## Environment Variables

Development uses `AUTH_BYPASS=true` for simplified login.

Port configuration (for running multiple instances):
- `PORT_WEB` - Web server port (default: 3000)
- `PORT_API` - API/WebSocket port (default: 3001)
- `COMPOSE_PROJECT_NAME` - Docker project name (default: topograph)

Production requires:
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` - MS365 OAuth
- `SESSION_SECRET` - Session encryption
- `APP_URL` - Application URL (should match PORT_WEB)
- `DATABASE_URL` - SQLite file path

## Staging

Staging runs the production build with VPN connectivity to target networks.

### Linux (Docker/Podman)
```bash
docker compose up staging
```
VPN runs natively inside the container.

### Mac (OrbStack VM)
Docker containers on Mac cannot properly route VPN traffic, so we use an OrbStack Linux VM:

```bash
./staging.sh start    # Start VM + VPN + container
./staging.sh status   # Check status and get URL
./staging.sh logs     # View container logs
./staging.sh build    # Rebuild image
./staging.sh stop     # Stop container (VM keeps running)
./staging.sh vm-stop  # Stop the entire VM
```

**First-time VM setup:**
```bash
# Create VM
orb create ubuntu staging-vm

# Install OpenVPN in VM
orb run -m staging-vm sudo apt update
orb run -m staging-vm sudo apt install -y openvpn

# Copy VPN config to VM
orb run -m staging-vm sudo mkdir -p /etc/openvpn/client
# Place bussijaam.conf in /etc/openvpn/client/

# Enable VPN service
orb run -m staging-vm sudo systemctl enable openvpn-client@bussijaam
```

### Windows (WSL2)
Use WSL2 with Docker, or set up a Linux VM manually with VPN configured at the system level.

## Deployment

Production runs on `veemonula.ee` as a Podman container with OpenVPN for network access.

### Environment Variables (in `/sites/topograph.torva.ee/.env`)
- `VPN_USERNAME`, `VPN_PASSWORD` - OpenVPN credentials for network access
- `DATABASE_URL` - SQLite path (default: `file:/data/topograph.db`)
- `AUTH_BYPASS=true` - Bypass MS365 auth (optional)

### Deployment Commands

```bash
# SSH to server (use root user)
ssh root@veemonula.ee

# App location
/sites/topograph.torva.ee/app/

# Rebuild and restart container (use Dockerfile.prod for VPN support)
cd /sites/topograph.torva.ee/app
podman build -t topograph -f Dockerfile.prod .
podman stop topograph && podman rm topograph
podman run -d --name topograph \
    --cap-add=NET_ADMIN \
    --device=/dev/net/tun \
    --network=slirp4netns \
    -p 3001:3000 \
    -v /sites/topograph.torva.ee/data:/data \
    --env-file /sites/topograph.torva.ee/.env \
    topograph

# View logs
podman logs -f topograph

# Check VPN status
podman exec topograph cat /var/log/supervisor/openvpn.out.log | tail -20
```

### Container Architecture
- Uses `supervisord` to run both OpenVPN and the Bun app
- VPN connects via TCP to `80.235.43.5:1194` (Bussijaam)
- Routes `10.11.13.0/24` through VPN for device access
- Credentials are created at startup from env vars
