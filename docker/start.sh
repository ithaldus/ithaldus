#!/bin/bash
set -e

# Create VPN auth file from environment variables
if [ -n "$VPN_USERNAME" ] && [ -n "$VPN_PASSWORD" ]; then
    echo "$VPN_USERNAME" > /etc/openvpn/auth.txt
    echo "$VPN_PASSWORD" >> /etc/openvpn/auth.txt
    chmod 600 /etc/openvpn/auth.txt
    echo "VPN credentials configured"
else
    echo "WARNING: VPN_USERNAME and VPN_PASSWORD not set, VPN will not connect"
fi

# Start supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
