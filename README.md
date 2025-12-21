# TopoGraph

Network topology discovery and visualization tool for municipal institutions. Automatically discovers network devices via SSH and maps their interconnections.

## Features

- **User Management** - Create and manage users with role-based access
- **Network Management** - Define networks with root device IP addresses
- **Credential Store** - Securely store SSH/SNMP credentials for device access
- **Topology Discovery** - Scan networks and discover device interconnections (coming soon)
- **MS365 Authentication** - Single sign-on via Microsoft 365 (coming soon)

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) installed and running

## Quick Start

### Windows

```cmd
dev.cmd
```

### Linux/Mac

```bash
chmod +x dev.sh
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
- **Auth**: Microsoft 365 OAuth (coming soon)

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
