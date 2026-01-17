# VPN Configuration

IT Haldus production container supports three VPN protocols: **OpenVPN**, **SSTP**, and **WireGuard**.

VPN runs inside the container for security - the host system does not need VPN access.

## When Do You Need VPN?

VPN is required when:
- Scanning network devices that are on a private network
- The production server is not directly connected to the target network

VPN is NOT required when:
- The server is directly connected to the target network
- You only need to manage devices accessible from the server

## Quick Start

1. Choose your VPN protocol and configure environment variables in `.env`
2. Copy your VPN configuration file to the `vpn/` directory
3. Build and run the container

```bash
./ithaldus build
./ithaldus start
./ithaldus vpn-status
```

## Environment Variables

Add these to your `.env` file:

```env
# VPN protocol: openvpn, sstp, wireguard, or none
VPN_PROTOCOL=none

# Credentials (required for OpenVPN and SSTP)
VPN_USERNAME=your-username
VPN_PASSWORD=your-password

# SSTP server hostname (required only for SSTP)
SSTP_SERVER=vpn.example.com
```

## Protocol Configuration

### OpenVPN

1. Copy your OpenVPN config to `vpn/client.ovpn`
2. Set environment variables:

```env
VPN_PROTOCOL=openvpn
VPN_USERNAME=your-username
VPN_PASSWORD=your-password
```

Example config template: `vpn/openvpn.conf.example`

**Config requirements:**
- Must include `auth-user-pass` directive (credentials provided via env vars)
- Include CA certificate inline with `<ca>` block or reference external file
- Specify routes for your internal networks

### SSTP

SSTP is commonly used with Windows VPN servers.

1. (Optional) Place CA certificate in `vpn/ca.crt`
2. Set environment variables:

```env
VPN_PROTOCOL=sstp
VPN_USERNAME=DOMAIN\\username
VPN_PASSWORD=your-password
SSTP_SERVER=vpn.example.com
```

See `vpn/sstp.conf.example` for details on extracting CA certificates.

**Note:** If your server uses a self-signed certificate, you need to provide the CA certificate.

### WireGuard

1. Copy your WireGuard config to `vpn/wg0.conf`
2. Set environment variable:

```env
VPN_PROTOCOL=wireguard
```

Example config template: `vpn/wireguard.conf.example`

**Generating keys:**
```bash
# Generate private key
wg genkey > privatekey

# Generate public key from private key
cat privatekey | wg pubkey > publickey
```

### Disabling VPN

To run without VPN:

```env
VPN_PROTOCOL=none
```

## VPN Commands

Check VPN status:
```bash
./ithaldus vpn-status
```

View VPN logs:
```bash
./ithaldus vpn-logs
```

Test connectivity to a target IP:
```bash
./ithaldus vpn-test 10.0.0.1
```

## Troubleshooting

### VPN not connecting

1. Check VPN logs:
   ```bash
   ./ithaldus vpn-logs
   ```

2. Verify config file exists:
   - OpenVPN: `vpn/client.ovpn`
   - WireGuard: `vpn/wg0.conf`
   - SSTP: `vpn/ca.crt` (optional)

3. Check environment variables are set correctly

### Container starts but VPN shows "none"

Ensure `VPN_PROTOCOL` is set in your `.env` file and you've rebuilt the container:
```bash
./ithaldus build
./ithaldus start
```

### "Permission denied" errors

The container needs NET_ADMIN capability and access to /dev/net/tun. The `./ithaldus run` command includes these automatically.

### Routes not working

Check that your VPN config includes routes for your target networks:

**OpenVPN:**
```
route 10.0.0.0 255.255.255.0
```

**WireGuard:**
```
AllowedIPs = 10.0.0.0/24
```

### SSTP certificate errors

If you see certificate verification errors with SSTP:
1. Export the CA certificate from your Windows server
2. Place it in `vpn/ca.crt`
3. Rebuild and restart the container

## File Reference

| File | Protocol | Description |
|------|----------|-------------|
| `vpn/client.ovpn` | OpenVPN | OpenVPN configuration file |
| `vpn/wg0.conf` | WireGuard | WireGuard configuration file |
| `vpn/ca.crt` | SSTP | CA certificate for SSTP server |
| `vpn/openvpn.conf.example` | - | OpenVPN template |
| `vpn/wireguard.conf.example` | - | WireGuard template |
| `vpn/sstp.conf.example` | - | SSTP setup instructions |
