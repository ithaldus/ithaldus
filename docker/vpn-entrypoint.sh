#!/bin/bash
# VPN startup script supporting OpenVPN, SSTP, and WireGuard
# This script runs INSIDE the container, not on the host.
# Users should use ./ithaldus vpn-* commands on the host.
set -e

VPN_PROTOCOL="${VPN_PROTOCOL:-none}"

echo "VPN Protocol: $VPN_PROTOCOL"

case "$VPN_PROTOCOL" in
  openvpn)
    if [ ! -f /etc/openvpn/client.conf ]; then
      echo "ERROR: OpenVPN config not found at /etc/openvpn/client.conf"
      echo "Please provide vpn/client.ovpn in your project"
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

    # Create auth file from environment variables
    AUTH_OPTS=""
    if [ -n "$VPN_USERNAME" ] && [ -n "$VPN_PASSWORD" ]; then
      echo "$VPN_USERNAME" > /etc/openvpn/auth.txt
      echo "$VPN_PASSWORD" >> /etc/openvpn/auth.txt
      chmod 600 /etc/openvpn/auth.txt
      echo "OpenVPN credentials configured"
      AUTH_OPTS="--auth-user-pass /etc/openvpn/auth.txt"
    fi

    # Run OpenVPN with DHCP script for tap interfaces
    exec openvpn --config /etc/openvpn/client.conf $AUTH_OPTS \
      --script-security 2 \
      --up /etc/openvpn/up-dhcp.sh
    ;;

  sstp)
    if [ -z "$SSTP_SERVER" ]; then
      echo "ERROR: SSTP_SERVER environment variable not set"
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
    if [ ! -f /etc/wireguard/wg0.conf ]; then
      echo "ERROR: WireGuard config not found at /etc/wireguard/wg0.conf"
      echo "Please provide vpn/wg0.conf in your project"
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
