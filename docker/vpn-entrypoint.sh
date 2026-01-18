#!/bin/bash
# VPN startup script supporting OpenVPN, SSTP, and WireGuard
# This script runs INSIDE the container, not on the host.
# Users should use ./ithaldus vpn-* commands on the host.
set -e

CONFIG_FILE="/data/vpn/config.json"

# Read config from JSON file if it exists (takes priority over env vars)
if [ -f "$CONFIG_FILE" ]; then
  echo "Reading VPN config from $CONFIG_FILE"
  VPN_PROTOCOL=$(jq -r '.protocol // "none"' "$CONFIG_FILE")
  VPN_ENABLED=$(jq -r '.enabled // false' "$CONFIG_FILE")
  VPN_USERNAME=$(jq -r '.username // empty' "$CONFIG_FILE")
  VPN_PASSWORD=$(jq -r '.password // empty' "$CONFIG_FILE")
  SSTP_SERVER=$(jq -r '.server // empty' "$CONFIG_FILE")

  # Don't start if not enabled
  if [ "$VPN_ENABLED" != "true" ]; then
    echo "VPN is disabled in config"
    exit 0
  fi
else
  # Fall back to environment variables
  VPN_PROTOCOL="${VPN_PROTOCOL:-none}"
fi

echo "VPN Protocol: $VPN_PROTOCOL"

case "$VPN_PROTOCOL" in
  openvpn)
    # Check for config file - first in /data/vpn/, then /etc/openvpn/
    OVPN_CONFIG=""
    if [ -f /data/vpn/client.conf ]; then
      OVPN_CONFIG="/data/vpn/client.conf"
    elif [ -f /etc/openvpn/client.conf ]; then
      OVPN_CONFIG="/etc/openvpn/client.conf"
    fi

    if [ -z "$OVPN_CONFIG" ]; then
      echo "ERROR: OpenVPN config not found"
      echo "Please configure VPN in the web interface"
      exit 1
    fi

    # Create DHCP up script for tap interfaces (Layer 2 VPN)
    cat > /etc/openvpn/up-dhcp.sh << 'DHCP_SCRIPT'
#!/bin/bash
# Run DHCP client on tap interface to get IP address
if [[ "$dev" == tap* ]]; then
  echo "Running DHCP on $dev..."
  dhclient -v "$dev" 2>&1 &
fi
DHCP_SCRIPT
    chmod +x /etc/openvpn/up-dhcp.sh

    # Check for auth file
    AUTH_OPTS=""
    if [ -f /data/vpn/auth.txt ]; then
      AUTH_OPTS="--auth-user-pass /data/vpn/auth.txt"
      echo "OpenVPN credentials configured from /data/vpn/auth.txt"
    elif [ -n "$VPN_USERNAME" ] && [ -n "$VPN_PASSWORD" ]; then
      echo "$VPN_USERNAME" > /etc/openvpn/auth.txt
      echo "$VPN_PASSWORD" >> /etc/openvpn/auth.txt
      chmod 600 /etc/openvpn/auth.txt
      echo "OpenVPN credentials configured from environment"
      AUTH_OPTS="--auth-user-pass /etc/openvpn/auth.txt"
    fi

    echo "Using config: $OVPN_CONFIG"
    # Run OpenVPN with DHCP script for tap interfaces
    exec openvpn --config "$OVPN_CONFIG" $AUTH_OPTS \
      --script-security 2 \
      --up /etc/openvpn/up-dhcp.sh
    ;;

  sstp)
    if [ -z "$SSTP_SERVER" ]; then
      echo "ERROR: SSTP_SERVER not configured"
      exit 1
    fi
    if [ -z "$VPN_USERNAME" ] || [ -z "$VPN_PASSWORD" ]; then
      echo "ERROR: VPN_USERNAME and VPN_PASSWORD required for SSTP"
      exit 1
    fi

    # Optional CA certificate
    CA_CERT_OPT=""
    if [ -f /etc/sstp/ca.crt ]; then
      CA_CERT_OPT="--ca-cert /etc/sstp/ca.crt"
    fi

    echo "Connecting to SSTP server: $SSTP_SERVER"
    exec sstpc $CA_CERT_OPT \
      --user "$VPN_USERNAME" \
      --password "$VPN_PASSWORD" \
      "$SSTP_SERVER" \
      usepeerdns require-mschap-v2 noauth noipdefault defaultroute
    ;;

  wireguard)
    # Check for config file - first in /data/vpn/, then /etc/wireguard/
    WG_CONFIG=""
    if [ -f /data/vpn/wg0.conf ]; then
      WG_CONFIG="/data/vpn/wg0.conf"
      # Copy to /etc/wireguard for wg-quick
      cp /data/vpn/wg0.conf /etc/wireguard/wg0.conf
    elif [ -f /etc/wireguard/wg0.conf ]; then
      WG_CONFIG="/etc/wireguard/wg0.conf"
    fi

    if [ -z "$WG_CONFIG" ]; then
      echo "ERROR: WireGuard config not found"
      echo "Please configure VPN in the web interface"
      exit 1
    fi

    echo "Starting WireGuard interface wg0"
    wg-quick up wg0

    # Keep process running (wg-quick backgrounds itself)
    echo "WireGuard connected"
    exec tail -f /dev/null
    ;;

  none|"")
    echo "VPN disabled - running without VPN connection"
    exec tail -f /dev/null
    ;;

  *)
    echo "ERROR: Unknown VPN_PROTOCOL: $VPN_PROTOCOL"
    echo "Supported protocols: openvpn, sstp, wireguard, none"
    exit 1
    ;;
esac
