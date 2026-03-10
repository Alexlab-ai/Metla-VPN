#!/bin/bash
# ==============================================
# Metla VPN — Marzban Panel Auto-Install
# Installs Marzban + Nginx + SSL (Let's Encrypt)
#
# Usage: bash setup.sh <admin_user> <admin_pass> <domain> [panel_port]
# ==============================================

set -e

ADMIN_USER="${1:-admin}"
ADMIN_PASS="${2}"
DOMAIN="${3}"
PANEL_PORT="${4:-8080}"

echo "========================================"
echo "  Metla VPN — Marzban Panel Install"
echo "========================================"

if [ -z "$DOMAIN" ]; then
    echo "ERROR: Domain is required!"
    echo "Usage: bash setup.sh <admin_user> <admin_pass> <domain> [panel_port]"
    echo ""
    echo "Before running:"
    echo "  1. Buy a domain (e.g. on Namecheap, Cloudflare)"
    echo "  2. Add A-record: domain -> this server's IP"
    echo "  3. Wait 5-10 min for DNS propagation"
    exit 1
fi

SERVER_IP=$(curl -s ifconfig.me)

# Check DNS
echo "Checking DNS for ${DOMAIN}..."
RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null || nslookup "$DOMAIN" 2>/dev/null | grep -oP '(?<=Address: )\S+' | tail -1)
if [ "$RESOLVED_IP" != "$SERVER_IP" ]; then
    echo "WARNING: ${DOMAIN} resolves to ${RESOLVED_IP}, but this server is ${SERVER_IP}"
    echo "Make sure A-record points to ${SERVER_IP} before continuing."
    echo "Continuing anyway (SSL may fail if DNS is wrong)..."
fi

# =====================
# 1. Update system
# =====================
echo "[1/8] Updating system..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git dnsutils

# =====================
# 2. Install Docker
# =====================
if ! command -v docker &> /dev/null; then
    echo "[2/8] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "[2/8] Docker already installed"
fi

# =====================
# 3. Docker Compose
# =====================
if ! docker compose version &> /dev/null; then
    echo "[3/8] Installing Docker Compose..."
    apt-get install -y docker-compose-plugin
else
    echo "[3/8] Docker Compose already installed"
fi

# =====================
# 4. Install Nginx
# =====================
echo "[4/8] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

# =====================
# 5. SSL Certificate (Let's Encrypt)
# =====================
echo "[5/8] Setting up SSL certificate..."
apt-get install -y certbot python3-certbot-nginx

# Stop nginx temporarily for standalone cert
systemctl stop nginx

certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email "admin@${DOMAIN}" \
    -d "$DOMAIN" \
    || { echo "SSL cert failed! Check that ${DOMAIN} A-record points to ${SERVER_IP}"; exit 1; }

# Auto-renew cron
crontab -l 2>/dev/null | grep -q "certbot renew" || {
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --post-hook 'systemctl reload nginx' --quiet") | crontab -
    echo "SSL auto-renewal configured"
}

# =====================
# 6. Configure Nginx reverse proxy
# =====================
echo "[6/8] Configuring Nginx..."

cat > /etc/nginx/sites-available/marzban << NGINXEOF
# Marzban Panel — ${DOMAIN}
# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

# HTTPS — reverse proxy to Marzban
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Panel & API
    location / {
        proxy_pass http://127.0.0.1:${PANEL_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket support (for xray)
    location /ws {
        proxy_pass http://127.0.0.1:${PANEL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # gRPC support
    location /grpc {
        grpc_pass grpc://127.0.0.1:${PANEL_PORT};
        grpc_set_header Host \$host;
        grpc_set_header X-Real-IP \$remote_addr;
    }

    # Subscription endpoint
    location ~ ^/sub/ {
        proxy_pass http://127.0.0.1:${PANEL_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINXEOF

# Enable site
ln -sf /etc/nginx/sites-available/marzban /etc/nginx/sites-enabled/marzban
rm -f /etc/nginx/sites-enabled/default

# Test and start
nginx -t && systemctl start nginx

# =====================
# 7. Install & configure Marzban
# =====================
echo "[7/8] Installing Marzban..."
if [ ! -d "/opt/Marzban" ]; then
    bash -c "$(curl -sL https://github.com/Gozargah/Marzban-scripts/raw/master/marzban.sh)" @ install
else
    echo "Marzban already installed"
fi

MARZBAN_ENV="/opt/Marzban/.env"

# Write Marzban config with domain
cat > "$MARZBAN_ENV" << ENVEOF
# Marzban Configuration — managed by Metla VPN deploy
UVICORN_HOST=127.0.0.1
UVICORN_PORT=${PANEL_PORT}

# Domain & subscription
XRAY_SUBSCRIPTION_URL_PREFIX=https://${DOMAIN}

# Dashboard settings
DASHBOARD_PATH=/dashboard/

# SSL handled by Nginx, not Marzban directly
# UVICORN_SSL_CERTFILE=/etc/letsencrypt/live/${DOMAIN}/fullchain.pem
# UVICORN_SSL_KEYFILE=/etc/letsencrypt/live/${DOMAIN}/privkey.pem
ENVEOF

# =====================
# 8. Start Marzban & create admin
# =====================
echo "[8/8] Starting Marzban..."
cd /opt/Marzban
docker compose up -d

echo "Waiting for Marzban to start..."
sleep 15

# Create admin
if [ -n "$ADMIN_PASS" ]; then
    docker compose exec -T marzban marzban cli admin create \
        --username "$ADMIN_USER" \
        --password "$ADMIN_PASS" \
        --is-sudo 2>/dev/null || echo "Admin may already exist"
fi

# =====================
# Firewall
# =====================
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp     # HTTP (redirect)
    ufw allow 443/tcp    # HTTPS (panel + VPN)
    ufw allow 8443/tcp   # Alt VPN port
    ufw allow 2053/tcp   # VPN port
    ufw allow 2083/tcp   # VPN port
    ufw --force enable
fi

# =====================
# Done!
# =====================
echo ""
echo "========================================"
echo "  Marzban Panel Installed!"
echo "========================================"
echo ""
echo "  Panel:   https://${DOMAIN}/dashboard/"
echo "  API:     https://${DOMAIN}/api/"
echo "  Sub URL: https://${DOMAIN}/sub/"
echo "  Admin:   ${ADMIN_USER}"
echo ""
echo "  SSL: Let's Encrypt (auto-renews)"
echo ""
echo "  Docker:"
docker compose ps
echo ""
echo "  Nginx:"
systemctl status nginx --no-pager -l | head -5
echo ""
echo "  Useful commands:"
echo "    marzban logs              # Marzban logs"
echo "    marzban restart           # Restart Marzban"
echo "    nginx -t && systemctl reload nginx  # Reload Nginx"
echo "    certbot certificates      # Check SSL status"
echo ""
echo "  For bot .env:"
echo "    MARZBAN_WEB_ADMIN=https://${DOMAIN}/"
echo "    MARZBAN_LOGIN=${ADMIN_USER}"
echo "    MARZBAN_PASSWORD=<your password>"
echo ""
echo "  Next steps:"
echo "    1. Open https://${DOMAIN}/dashboard/"
echo "    2. Log in"
echo "    3. Add inbounds (VLESS Reality recommended)"
echo "    4. Copy certificate for nodes"
