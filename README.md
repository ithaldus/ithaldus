# TopoGraph

Network topology discovery and visualization tool for municipal institutions. Automatically discovers network devices via SSH and maps their interconnections.

## Features

- **User Management** - Create and manage users with role-based access
- **Network Management** - Define networks with root device IP addresses
- **Credential Store** - Securely store SSH/SNMP credentials for device access
- **Topology Discovery** - Scan networks and discover device interconnections (coming soon)
- **MS365 Authentication** - Single sign-on via Microsoft 365

## Prerequisites

- **Docker** (any of the following):
  - **Mac**: [OrbStack](https://orbstack.dev/) (recommended) or Docker Desktop
  - **Windows**: Docker Desktop
  - **Linux**: Docker or Podman

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start development server
./dev.sh          # Linux/Mac
dev.cmd           # Windows

# 3. Run migrations and seed (first time only, in another terminal)
docker compose exec dev bun run db:migrate
docker compose exec dev bun run db:seed

# 4. Open http://localhost:3000 and login with admin / admin123
```

## Available Commands

| Windows | Linux/Mac | Description |
|---------|-----------|-------------|
| `dev.cmd` | `./dev.sh` | Start development server |
| `stop.cmd` | `docker compose down` | Stop the server |
| `migrate.cmd` | `docker compose exec dev bun run db:migrate` | Run database migrations |
| `seed.cmd` | `docker compose exec dev bun run db:seed` | Seed database with admin user |
| `logs.cmd` | `docker compose logs -f dev` | View server logs |

## Tech Stack

- **Runtime**: Bun
- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Hono
- **Database**: SQLite + Drizzle ORM
- **Auth**: Microsoft 365 OAuth

## Project Structure

```
src/
├── client/          # React frontend
│   ├── components/  # UI components
│   ├── pages/       # Page components
│   └── lib/         # Utilities
└── server/          # Hono backend
    ├── db/          # Database schema & migrations
    ├── routes/      # API routes
    └── middleware/  # Auth middleware
```

## Running Multiple Instances

You can run multiple instances of this project side by side (e.g., for parallel development). Each instance needs unique ports and a unique Docker project name.

### Setup for Additional Instance

1. Copy the project folder to a new location
2. Edit the `.env` file in the new folder and change:
   ```env
   # Use different ports (e.g., 3100, 3101 for second instance)
   PORT_WEB=3100
   PORT_API=3101

   # Give it a unique Docker project name
   COMPOSE_PROJECT_NAME=topograph2

   # Update APP_URL to match PORT_WEB
   APP_URL=http://localhost:3100
   ```

3. Start the dev server normally: `./dev.sh` or `dev.cmd`
4. Access at http://localhost:3100 (or your configured port)

Each instance will have its own:
- Docker containers (isolated by `COMPOSE_PROJECT_NAME`)
- Docker volumes (including `node_modules`)
- SQLite database (in the local `./data` folder)

## URL Parameters (Topology View)

The network topology view supports URL query parameters to customize the display:

| Parameter | Example | Description |
|-----------|---------|-------------|
| `sidebar` | `?sidebar=0` | Hide the navigation sidebar |
| `console` | `?console=0` | Hide the debug console |
| `labels` | `?labels=f,v,p` | Show only specific labels |
| `types` | `?types=router,switch` | Show only specific device types |
| `filter` | `?filter=192.168` | Pre-fill the device filter |

### Label Options
Use full names or short codes: `firmware`/`f`, `interfaces`/`i`, `vendor`/`v`, `enddevices`/`e`, `assettag`/`a`, `mac`/`m`, `ports`/`p`, `serialnumber`/`s`

Use `?labels=` (empty) to hide all labels.

### Device Types
Available types: `router`, `switch`, `access-point`, `server`, `computer`, `phone`, `desktop-phone`, `tv`, `tablet`, `printer`, `camera`, `iot`, `end-device`

### Example
```
http://localhost:3000/networks/abc123?sidebar=0&console=0&types=router,switch&labels=f,v
```
Shows only routers and switches with firmware and vendor info, without sidebar or console.

## Development

The development environment runs two processes inside Docker:
- **Vite** (port 5173 internal) - Frontend with hot reload
- **Bun API** (port 3000) - Backend server

All requests go through port 3000, with the API proxying frontend requests to Vite.

## Staging Environment

Staging runs the production build with VPN connectivity to target networks.

**Linux:**
```bash
docker compose up staging
```

**Mac (OrbStack):**
```bash
./staging.sh start    # Start VM and container
./staging.sh status   # Check status and get URL
./staging.sh logs     # View container logs
./staging.sh stop     # Stop container
./staging.sh vm-stop  # Stop the VM completely
```

Note: The Mac staging script uses an OrbStack Linux VM because Docker containers on Mac cannot properly route VPN traffic. Requires VPN credentials in `.env`.

## Microsoft 365 Authentication Setup

TopoGraph uses Microsoft 365 OAuth for authentication. Follow these steps to configure it:

### 1. Register an Application in Azure AD

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** (formerly Azure Active Directory)
3. Select **App registrations** → **New registration**
4. Configure the application:
   - **Name**: `TopoGraph` (or your preferred name)
   - **Supported account types**: Select based on your needs:
     - *Single tenant* - Only users from your organization
     - *Multitenant* - Users from any Azure AD organization
   - **Redirect URI**:
     - Platform: `Web`
     - URL: `http://localhost:3000/api/auth/callback` (for development)
5. Click **Register**

### 2. Configure Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description (e.g., "TopoGraph Production")
4. Select expiration period
5. Click **Add**
6. **Copy the secret value immediately** - it won't be shown again

### 3. Note Your Application IDs

From the app registration **Overview** page, copy:
- **Application (client) ID** → `MICROSOFT_CLIENT_ID`
- **Directory (tenant) ID** → `MICROSOFT_TENANT_ID`

**Multi-tenant support**: Instead of your specific tenant ID, you can use:
- `common` - Any Azure AD organization + personal Microsoft accounts
- `organizations` - Any Azure AD organization (work/school only)
- `consumers` - Personal Microsoft accounts only

### 4. Configure API Permissions (Optional)

By default, the app requests `openid`, `profile`, and `email` scopes. If you need additional permissions:

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph** → **Delegated permissions**
4. Add required permissions
5. Click **Grant admin consent** if required

### 5. Add Production Redirect URI

For production deployment:

1. Go to **Authentication**
2. Under **Web** → **Redirect URIs**, add your production URL:
   ```
   https://your-domain.com/api/auth/callback
   ```

### 6. Set Environment Variables

Create a `.env` file or set these environment variables:

```env
# Microsoft 365 OAuth
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret-value
MICROSOFT_TENANT_ID=your-directory-tenant-id

# Application URL (used for OAuth redirect)
APP_URL=http://localhost:3000

# Set to 'true' to bypass auth during development
AUTH_BYPASS=false
```

For Docker, add these to `docker-compose.yml` under the `dev` service environment.

### 7. Add Authorized Users

Only users registered in the database can access the application. Add users to the seed file (`src/server/db/seed.ts`):

```typescript
const usersToSeed = [
  {
    email: 'user@yourdomain.com',
    name: 'User Name',
    role: 'admin' as const,  // or 'user'
  },
]
```

Then run: `docker compose exec dev bun run db:seed`

### Development Mode

For local development without Azure AD, set `AUTH_BYPASS=true` in your environment. This automatically logs you in as the first admin user.
