#!/bin/bash
# Container entrypoint - runs app in dev or prod mode based on NODE_ENV
set -e

echo "Starting ithaldus (NODE_ENV=$NODE_ENV)"

# Ensure data directories exist
mkdir -p /data/vpn

# Run database migrations
echo "Running database migrations..."
bun run db:migrate || true

if [ "$NODE_ENV" = "development" ]; then
    echo "Starting development servers..."
    exec bun run dev
else
    # Production mode - build if dist/ doesn't exist
    if [ ! -d "dist" ] || [ ! -f "dist/server/index.js" ]; then
        echo "Building application..."
        bun run build
    fi

    echo "Starting production server..."
    exec bun run start
fi
