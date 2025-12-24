# TopoGraph

Network topology discovery and visualization tool for municipal institutions. Automatically discovers network devices via SSH and maps their interconnections.

## Features

- **User Management** - Create and manage users with role-based access
- **Network Management** - Define networks with root device IP addresses
- **Credential Store** - Securely store SSH/SNMP credentials for device access
- **Topology Discovery** - Scan networks and discover device interconnections (coming soon)
- **MS365 Authentication** - Single sign-on via Microsoft 365

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) installed and running

## Quick Start

### Windows

```cmd
dev.cmd
```

### Linux/Mac

```bash
./dev.sh
```

Then open http://localhost:3000

## Available Commands

| Windows | Linux/Mac | Description |
|---------|-----------|-------------|
| `dev.cmd` | `./dev.sh` | Start development server |
| `stop.cmd` | `docker compose down` | Stop the server |
| `migrate.cmd` | `docker compose exec dev bun run db:migrate` | Run database migrations |
| `seed.cmd` | `docker compose exec dev bun run db:seed` | Seed database with admin user |
| `logs.cmd` | `docker compose logs -f dev` | View server logs |

## First Time Setup

1. Start the dev server: `dev.cmd`
2. Run migrations: `migrate.cmd`
3. Seed the database: `seed.cmd`
4. Open http://localhost:3000
5. Login with: `admin` / `admin123`

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

## Development

The development environment runs two processes inside Docker:
- **Vite** (port 5173 internal) - Frontend with hot reload
- **Bun API** (port 3000) - Backend server

All requests go through port 3000, with the API proxying frontend requests to Vite.

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
