#!/bin/bash
# ==============================================
# Metla VPN — Main Server Auto-Setup
# Installs: Node.js, PostgreSQL, PM2, and the bot
# Usage: bash setup.sh
# ==============================================

set -e

APP_DIR="/opt/metla-vpn"
REPO_URL="$1"  # GitHub repo URL

echo "========================================"
echo "  Metla VPN — Main Server Setup"
echo "========================================"

# 1. Update system
echo "[1/7] Updating system..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get upgrade -y

# 2. Install Node.js via NVM
echo "[2/7] Installing Node.js..."
apt-get install -y curl git
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
fi
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
nvm use default
echo "Node.js: $(node -v)"

# 3. Install PM2
echo "[3/7] Installing PM2..."
npm install -g pm2
pm2 install pm2-logrotate

# 4. Install PostgreSQL
echo "[4/7] Installing PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt-get install -y postgresql postgresql-client
    systemctl enable postgresql
    systemctl start postgresql
fi

# 5. Setup database
echo "[5/7] Setting up database..."
echo "Creating database user and database..."
su - postgres -c "psql -c \"CREATE USER metlavpn WITH PASSWORD 'CHANGE_ME_PLEASE';\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE metlavpn OWNER metlavpn;\"" 2>/dev/null || true
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE metlavpn TO metlavpn;\"" 2>/dev/null || true
echo "Database ready (remember to change the password in .env!)"

# 6. Clone application
echo "[6/7] Setting up application..."
if [ -n "$REPO_URL" ] && [ ! -d "$APP_DIR" ]; then
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
    npm install --production
    echo "Application cloned. Configure .env before starting!"
elif [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull
    npm install --production
    echo "Application updated."
else
    echo "No repo URL provided. Clone manually to $APP_DIR"
fi

# 7. Setup PM2 auto-restart
echo "[7/7] Configuring auto-restart..."
crontab -l 2>/dev/null | grep -q "pm2 resurrect" || {
    (crontab -l 2>/dev/null; echo "@reboot pm2 resurrect") | crontab -
    echo "PM2 auto-restart configured"
}

echo ""
echo "========================================"
echo "  Main Server Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. cd $APP_DIR"
echo "  2. cp .env.example .env"
echo "  3. nano .env  (fill in your values)"
echo "  4. pm2 start bot.js --name metla-bot"
echo "  5. pm2 start web.js --name metla-web"
echo "  6. pm2 start cron.js --name metla-cron"
echo "  7. pm2 save"
