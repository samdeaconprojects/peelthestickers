#!/usr/bin/env bash
# deploy/setup-server.sh
#
# One-time setup for the Lightsail instance (Ubuntu 24.04). deploy.sh --setup
# copies this folder to the server and runs it there with sudo. Safe to re-run.
#
# Installs: Node 24 LTS, Caddy (HTTPS + reverse proxy), automatic security
# updates, 2 GB swap, the pts-api systemd service, and the Caddyfile for DOMAIN.

set -euo pipefail

DOMAIN="${1:?usage: sudo bash setup-server.sh <domain>}"
DEPLOY_USER="${SUDO_USER:-ubuntu}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo." >&2
  exit 1
fi

echo "==> System packages"
apt-get update -y
apt-get upgrade -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring \
  apt-transport-https unattended-upgrades rsync

echo "==> Automatic security updates"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "==> Swap (2 GB)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "==> Journal size cap"
mkdir -p /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/pts.conf <<'EOF'
[Journal]
SystemMaxUse=500M
EOF
systemctl restart systemd-journald

echo "==> Node 24"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Caddy"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> App user and folders"
id pts >/dev/null 2>&1 || useradd --system --home-dir /opt/pts --shell /usr/sbin/nologin pts
mkdir -p /opt/pts/server /opt/pts/web
chown -R "$DEPLOY_USER:$DEPLOY_USER" /opt/pts
if [ ! -f /opt/pts/web/index.html ]; then
  echo '<!doctype html><title>PTS</title><p>Deploying soon.</p>' >/opt/pts/web/index.html
fi

echo "==> pts-api service"
install -m 644 "$HERE/pts-api.service" /etc/systemd/system/pts-api.service
systemctl daemon-reload
systemctl enable pts-api >/dev/null

echo "==> Caddyfile for $DOMAIN"
sed "s/__DOMAIN__/$DOMAIN/g" "$HERE/Caddyfile" >/etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy >/dev/null
systemctl reload caddy || systemctl restart caddy

echo
echo "Setup done. Next, from your Mac:"
echo "  deploy/deploy.sh --env     # upload deploy/.env.production"
echo "  deploy/deploy.sh           # build and ship the site + API"
