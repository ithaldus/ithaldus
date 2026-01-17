#!/bin/bash
# =============================================================================
# Staging Environment Manager (Mac/OrbStack only)
# =============================================================================
# This script manages a staging environment using an OrbStack Linux VM.
# It's required on Mac because Docker containers cannot properly route VPN traffic.
#
# For Linux: Use `docker compose up staging` instead (VPN works natively in containers)
# For Windows: Use WSL2 with Docker or set up a Linux VM manually
#
# Prerequisites:
#   - OrbStack installed (https://orbstack.dev)
#   - VM created: orb create ubuntu staging-vm
#   - OpenVPN configured in VM: sudo apt install openvpn
#   - VPN config at: /etc/openvpn/client/<vpn-name>.conf
# =============================================================================
set -e

# Configuration - override these with environment variables
VM_NAME="${STAGING_VM_NAME:-staging-vm}"
CONTAINER_NAME="${STAGING_CONTAINER_NAME:-ithaldus-staging}"
VPN_NAME="${VPN_NAME:-vpn}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_PATH="/mnt/mac${SCRIPT_DIR}"

# Get VM IP
get_ip() {
    orb list 2>/dev/null | grep "$VM_NAME" | awk '{print $NF}'
}

# Check if VM is running
vm_running() {
    orb list 2>/dev/null | grep "$VM_NAME" | grep -q "running"
}

# Check if container exists
container_exists() {
    orb run -m "$VM_NAME" docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"
}

case "${1:-}" in
    start)
        echo "Starting staging environment..."

        # Start VM if not running
        if ! vm_running; then
            echo "Starting VM..."
            orb start "$VM_NAME"
            sleep 3
        fi

        # Start VPN if not running
        orb run -m "$VM_NAME" sudo systemctl start openvpn-client@$VPN_NAME 2>/dev/null || true

        # Start or create container
        if container_exists; then
            orb run -m "$VM_NAME" docker start "$CONTAINER_NAME"
        else
            echo "Container doesn't exist. Run './staging.sh build' first."
            exit 1
        fi

        IP=$(get_ip)
        echo ""
        echo "Staging running at: http://$IP:3000"
        ;;

    stop)
        echo "Stopping staging container..."
        orb run -m "$VM_NAME" docker stop "$CONTAINER_NAME" 2>/dev/null || true
        echo "Stopped. VM still running (use './staging.sh vm-stop' to stop VM)"
        ;;

    restart)
        echo "Restarting staging container..."
        orb run -m "$VM_NAME" docker restart "$CONTAINER_NAME"
        IP=$(get_ip)
        echo "Staging running at: http://$IP:3000"
        ;;

    logs)
        orb run -m "$VM_NAME" docker logs -f "$CONTAINER_NAME"
        ;;

    build)
        echo "Building staging image..."
        orb run -m "$VM_NAME" bash -c "cd $PROJECT_PATH && docker build -t $CONTAINER_NAME -f Dockerfile ."

        echo "Recreating container..."
        orb run -m "$VM_NAME" docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
        orb run -m "$VM_NAME" docker run -d \
            --name "$CONTAINER_NAME" \
            --network host \
            -v "$PROJECT_PATH/data-staging:/data" \
            -e DATABASE_URL=file:/data/ithaldus.db \
            -e AUTH_BYPASS=true \
            -e NODE_ENV=production \
            "$CONTAINER_NAME"

        IP=$(get_ip)
        echo ""
        echo "Staging running at: http://$IP:3000"
        ;;

    status)
        if ! vm_running; then
            echo "VM: stopped"
        else
            echo "VM: running"
            IP=$(get_ip)
            echo "IP: $IP"

            VPN_STATUS=$(orb run -m "$VM_NAME" systemctl is-active openvpn-client@$VPN_NAME 2>/dev/null || echo "unknown")
            echo "VPN: $VPN_STATUS"

            if container_exists; then
                CONTAINER_STATUS=$(orb run -m "$VM_NAME" docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
                echo "Container: $CONTAINER_STATUS"

                if [ "$CONTAINER_STATUS" = "running" ]; then
                    echo ""
                    echo "Access: http://$IP:3000"
                fi
            else
                echo "Container: not created (run './staging.sh build')"
            fi
        fi
        ;;

    ip)
        IP=$(get_ip)
        echo "$IP"
        ;;

    url)
        IP=$(get_ip)
        echo "http://$IP:3000"
        ;;

    open)
        IP=$(get_ip)
        open "http://$IP:3000"
        ;;

    vm-stop)
        echo "Stopping VM..."
        orb stop "$VM_NAME"
        echo "VM stopped. Use './staging.sh start' to start again."
        ;;

    shell)
        orb run -m "$VM_NAME" bash
        ;;

    *)
        echo "Staging environment manager"
        echo ""
        echo "Usage: ./staging.sh <command>"
        echo ""
        echo "Commands:"
        echo "  start     Start staging (VM + VPN + container)"
        echo "  stop      Stop container (VM keeps running)"
        echo "  restart   Restart container"
        echo "  build     Rebuild image and recreate container"
        echo "  logs      Follow container logs"
        echo "  status    Show status of VM, VPN, container"
        echo "  ip        Print VM IP address"
        echo "  url       Print staging URL"
        echo "  open      Open staging in browser"
        echo "  vm-stop   Stop the entire VM"
        echo "  shell     Open shell in VM"
        ;;
esac
