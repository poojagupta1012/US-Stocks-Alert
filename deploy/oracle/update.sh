#!/usr/bin/env bash
# Pulls the latest code onto the VM and restarts the server. Run on the VM:
#   ~/US-Stocks-Alert/deploy/oracle/update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BRANCH="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)"

git -C "$APP_DIR" fetch origin "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"
npm ci --omit=dev --prefix "$APP_DIR/server"
sudo systemctl restart us-stocks-alert
echo "Updated to $(git -C "$APP_DIR" log -1 --format='%h %s'). Logs: journalctl -u us-stocks-alert -f"
