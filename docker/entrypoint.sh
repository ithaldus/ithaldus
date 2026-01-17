#!/bin/bash
# Container entrypoint - starts supervisor which manages VPN and app
# This script runs INSIDE the container, not on the host.
# Users should use ./ithaldus commands on the host.
set -e

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
