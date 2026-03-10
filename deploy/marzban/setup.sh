#!/bin/bash
# ==============================================
# Metla VPN — Marzban Panel Auto-Install
# Installs Marzban panel on a fresh VPS
# ==============================================

set -e

ADMIN_USER="${1:-admin}"
ADMIN_PASS="${2}"
PANEL_PORT="${3:-8080}"

echo "========================================"
echo "  Metla VPN — Marzban Panel Install"
echo "========================================"

# 1. Update system
echo "[1/6] Updating system..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get upgrade -y

# 2. Install Docker
if ! command -v docker &> /dev/null; then
    echo "[2/6] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "[2/6] Docker already installed"
fi

# 3. Install Docker Compose plugin
if ! docker compose version &> /dev/null; then
    echo "[3/6] Installing Docker Compose..."
    apt-get install -y docker-compose-plugin
else
    echo "[3/6] Docker Compose already installed"
fi

# 4. Install Marzban
echo "[4/6] Installing Marzban..."
if [ ! -d "/opt/Marzban" ]; then
    bash -c "$(curl -sL https://github.com/Gozargah/Marzban-scripts/raw/master/marzban.sh)" @ install
else
    echo "Marzban already installed, skipping..."
fi

# 5. Configure Marzban
echo "[5/6] Configuring Marzban..."

MARZBAN_ENV="/opt/Marzban/.env"

# Set panel port
if [ -f "$MARZBAN_ENV" ]; then
    sed -i "s|^UVICORN_PORT=.*|UVICORN_PORT=${PANEL_PORT}|" "$MARZBAN_ENV" 2>/dev/null || \
        echo "UVICORN_PORT=${PANEL_PORT}" >> "$MARZBAN_ENV"

    # Enable subscription
    grep -q "^XRAY_SUBSCRIPTION_URL_PREFIX" "$MARZBAN_ENV" || \
        echo "XRAY_SUBSCRIPTION_URL_PREFIX=https://$(curl -s ifconfig.me)" >> "$MARZBAN_ENV"
else
    cat > "$MARZBAN_ENV" << ENVEOF
UVICORN_PORT=${PANEL_PORT}
XRAY_SUBSCRIPTION_URL_PREFIX=https://$(curl -s ifconfig.me)
ENVEOF
fi

# 6. Create admin user
echo "[6/6] Creating admin user..."
if [ -n "$ADMIN_PASS" ]; then
    # Wait for Marzban to be ready
    cd /opt/Marzban
    docker compose up -d

    echo "Waiting for Marzban to start..."
    sleep 10

    # Create admin via CLI
    docker compose exec -T marzban marzban cli admin create \
        --username "$ADMIN_USER" \
        --password "$ADMIN_PASS" \
        --is-sudo 2>/dev/null || echo "Admin may already exist"
else
    echo "No password provided, starting Marzban..."
    cd /opt/Marzban
    docker compose up -d
    sleep 5
fi

# Open firewall
if command -v ufw &> /dev/null; then
    ufw allow ${PANEL_PORT}/tcp
    ufw allow 443/tcp
    ufw allow 8443/tcp
    ufw allow 2053/tcp
    ufw allow 2083/tcp
    ufw --force enable
fi

# Get server IP
SERVER_IP=$(curl -s ifconfig.me)

echo ""
echo "========================================"
echo "  Marzban Panel Installed!"
echo "========================================"
echo ""
echo "  Panel URL: http://${SERVER_IP}:${PANEL_PORT}"
echo "  Admin:     ${ADMIN_USER}"
echo ""
echo "  Docker status:"
cd /opt/Marzban && docker compose ps
echo ""
echo "  Useful commands:"
echo "    marzban logs        # View logs"
echo "    marzban restart     # Restart panel"
echo "    marzban update      # Update Marzban"
echo "    marzban cli         # CLI commands"
echo ""
echo "  Certificate for nodes:"
echo "    Panel -> Settings -> Show Certificate"
echo ""
echo "  Next steps:"
echo "    1. Open http://${SERVER_IP}:${PANEL_PORT}"
echo "    2. Log in with admin credentials"
echo "    3. Add inbounds (VLESS, VMess, etc.)"
echo "    4. Copy certificate for nodes"
