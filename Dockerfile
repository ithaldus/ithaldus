FROM oven/bun:1

WORKDIR /app

# Install VPN clients and network tools
RUN apt-get update && apt-get install -y \
    openvpn \
    wireguard-tools \
    iproute2 \
    iputils-ping \
    jq \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package.json bun.lockb* ./
RUN bun install

# Copy source code
COPY . .

# Create data directories
RUN mkdir -p /data/vpn

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Environment defaults
ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/ithaldus.db

# Expose ports (5173 for dev, 3000 for prod)
EXPOSE 3000 5173

ENTRYPOINT ["/entrypoint.sh"]
