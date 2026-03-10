#!/bin/bash
# ==============================================
# Metla VPN — Marzban Node Auto-Setup
# Run on a fresh VPS to install Marzban-node
# Usage: curl -s <raw-url> | bash -s -- <CERT_CONTENT>
# ==============================================

set -e

CERT_CONTENT="$1"
NODE_DIR="/var/lib/marzban-node"
COMPOSE_DIR="/opt/Marzban-node"

echo "========================================"
echo "  Metla VPN — Marzban Node Setup"
echo "========================================"

# 1. Update system
echo "[1/6] Updating system..."
apt-get update -y && apt-get upgrade -y

# 2. Install Docker
if ! command -v docker &> /dev/null; then
    echo "[2/6] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "[2/6] Docker already installed, skipping..."
fi

# 3. Install Docker Compose plugin (if missing)
if ! docker compose version &> /dev/null; then
    echo "[3/6] Installing Docker Compose..."
    apt-get install -y docker-compose-plugin
else
    echo "[3/6] Docker Compose already installed, skipping..."
fi

# 4. Clone Marzban-node
if [ ! -d "$COMPOSE_DIR" ]; then
    echo "[4/6] Cloning Marzban-node..."
    git clone https://github.com/Gozargah/Marzban-node "$COMPOSE_DIR"
else
    echo "[4/6] Marzban-node already exists, pulling latest..."
    cd "$COMPOSE_DIR" && git pull
fi

# 5. Setup certificate
echo "[5/6] Setting up SSL certificate..."
mkdir -p "$NODE_DIR"

if [ -n "$CERT_CONTENT" ]; then
    echo "$CERT_CONTENT" > "$NODE_DIR/ssl_client_cert.pem"
    echo "Certificate installed from argument"
elif [ -f "/tmp/ssl_client_cert.pem" ]; then
    cp /tmp/ssl_client_cert.pem "$NODE_DIR/ssl_client_cert.pem"
    echo "Certificate installed from /tmp/"
else
    echo "WARNING: No certificate provided!"
    echo "You need to manually place ssl_client_cert.pem in $NODE_DIR/"
    echo "Get it from Marzban panel: Settings -> Nodes -> Show Certificate"
fi

# 6. Create docker-compose.yml (override with correct ports)
cat > "$COMPOSE_DIR/docker-compose.yml" << 'COMPOSE'
services:
  marzban-node:
    image: gozargah/marzban-node:latest
    restart: always
    network_mode: host
    environment:
      SSL_CLIENT_CERT_FILE: "/var/lib/marzban-node/ssl_client_cert.pem"
      SERVICE_PORT: 62050
      XRAY_API_PORT: 62051
    volumes:
      - /var/lib/marzban-node:/var/lib/marzban-node
COMPOSE

# 7. Open firewall ports
echo "[6/6] Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 62050/tcp
    ufw allow 62051/tcp
    # Allow common VPN ports
    ufw allow 443/tcp
    ufw allow 8443/tcp
    ufw --force enable
    echo "UFW configured"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=62050/tcp
    firewall-cmd --permanent --add-port=62051/tcp
    firewall-cmd --permanent --add-port=443/tcp
    firewall-cmd --permanent --add-port=8443/tcp
    firewall-cmd --reload
    echo "firewalld configured"
else
    echo "No firewall detected, skipping..."
fi

# 8. Start Marzban-node
echo "Starting Marzban-node..."
cd "$COMPOSE_DIR"
docker compose pull
docker compose up -d

# 9. Verify
echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Node status:"
docker compose ps
echo ""
echo "Listening ports:"
ss -tlnp | grep -E '62050|62051' || echo "Ports not yet open (node may be starting...)"
echo ""
echo "Next steps:"
echo "  1. Add this server's IP in Marzban panel -> Nodes"
echo "  2. Make sure certificate matches"
echo "  3. Assign inbounds to this node"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f          # View logs"
echo "  docker compose restart           # Restart node"
echo "  docker compose pull && docker compose up -d  # Update"
