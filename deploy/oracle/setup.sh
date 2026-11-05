#!/usr/bin/env bash
# One-time setup of the alert server on an Oracle Cloud Always Free Ubuntu VM.
# Run on the VM as the default "ubuntu" user:
#   curl -fsSL https://raw.githubusercontent.com/poojagupta1012/US-Stocks-Alert/feature/stock-alert-app/deploy/oracle/setup.sh | bash
# Safe to run again; it updates the code and rewrites the service.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/poojagupta1012/US-Stocks-Alert.git}"
# Switch to main once the feature branch is merged.
BRANCH="${BRANCH:-feature/stock-alert-app}"
APP_DIR="${APP_DIR:-$HOME/US-Stocks-Alert}"
SERVICE=us-stocks-alert

echo "==> Installing Node.js 20 and git"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get install -y git

echo "==> Fetching the code ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
npm ci --omit=dev --prefix "$APP_DIR/server"

echo "==> Installing the systemd service"
sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null <<EOF
[Unit]
Description=US Stocks Alert server
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$APP_DIR/server
ExecStart=$(command -v node) src/index.js
Environment=NODE_ENV=production
Restart=always
RestartSec=5
# The server exits on its own within 10s of SIGTERM.
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null

if [ -f "$APP_DIR/server/.env" ]; then
  sudo systemctl restart "$SERVICE"
  echo "==> Started. Follow the logs with: journalctl -u $SERVICE -f"
else
  echo
  echo "==> Almost done. Copy your .env from your laptop, then start the service:"
  echo "      scp server/.env ubuntu@<vm-ip>:$APP_DIR/server/.env      (run on your laptop)"
  echo "      sudo systemctl start $SERVICE                             (run on the VM)"
fi
