#!/usr/bin/env bash
# deploy/deploy.sh — run from your Mac.
#
#   deploy/deploy.sh --setup     first time: install Node, Caddy and the service on the server
#   deploy/deploy.sh --env       upload deploy/.env.production as the server's .env, restart
#   deploy/deploy.sh             build the site, ship site + API, restart, health-check
#
# Reads deploy/deploy.conf (gitignored), e.g.:
#   PTS_HOST=ubuntu@3.91.12.34
#   PTS_SSH_KEY=~/.ssh/pts-lightsail.pem
#   PTS_DOMAIN=ptstimer.com

set -euo pipefail
cd "$(dirname "$0")/.."

CONF=deploy/deploy.conf
if [ ! -f "$CONF" ]; then
  echo "Missing $CONF (copy deploy/deploy.conf.example and fill it in)." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$CONF"
: "${PTS_HOST:?set PTS_HOST in $CONF}"
: "${PTS_SSH_KEY:?set PTS_SSH_KEY in $CONF}"
: "${PTS_DOMAIN:?set PTS_DOMAIN in $CONF}"
PTS_SSH_KEY="${PTS_SSH_KEY/#\~/$HOME}"

SSH_OPTS=(-i "$PTS_SSH_KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30)
remote() { ssh "${SSH_OPTS[@]}" "$PTS_HOST" "$@"; }
push() { rsync -az -e "ssh ${SSH_OPTS[*]}" "$@"; }

health() {
  echo "==> Health check"
  remote 'for i in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:5050/api/health && exit 0; sleep 1; done;
          echo "API did not come up. Last log lines:"; sudo journalctl -u pts-api -n 40 --no-pager; exit 1'
  if curl -fsS -o /dev/null --max-time 15 "https://$PTS_DOMAIN/api/health"; then
    echo "OK: https://$PTS_DOMAIN is serving the API"
  else
    echo "API is up on the server, but https://$PTS_DOMAIN/api/health didn't answer yet (DNS or certificate may still be settling)."
  fi
}

case "${1:-}" in
  --setup)
    echo "==> Copying setup files to $PTS_HOST"
    remote 'rm -rf /tmp/pts-setup && mkdir -p /tmp/pts-setup'
    push deploy/setup-server.sh deploy/pts-api.service deploy/Caddyfile "$PTS_HOST:/tmp/pts-setup/"
    remote "sudo bash /tmp/pts-setup/setup-server.sh '$PTS_DOMAIN'"
    exit 0
    ;;

  --env)
    ENV_FILE=deploy/.env.production
    [ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }
    grep -q '^PTS_TABLE=PTSProd$' "$ENV_FILE" || { echo "$ENV_FILE must set PTS_TABLE=PTSProd" >&2; exit 1; }
    if grep -qE '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)=(PASTE.*)?$' "$ENV_FILE"; then
      echo "Fill in the AWS keys in $ENV_FILE first." >&2
      exit 1
    fi
    grep -qE '^PTS_EMAIL_FROM=.+@.+' "$ENV_FILE" || { echo "$ENV_FILE must set PTS_EMAIL_FROM (e.g. noreply@peelthestickers.com)" >&2; exit 1; }
    grep -qE '^PTS_APP_URL=https://' "$ENV_FILE" || { echo "$ENV_FILE must set PTS_APP_URL=https://..." >&2; exit 1; }
    if grep -q '^AWS_PROFILE=' "$ENV_FILE"; then
      echo "$ENV_FILE must not set AWS_PROFILE (the server has no ~/.aws)." >&2
      exit 1
    fi
    DEV_SECRET="$(grep '^PTS_JWT_SECRET=' server/.env 2>/dev/null | cut -d= -f2- || true)"
    PROD_SECRET="$(grep '^PTS_JWT_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
    if [ -z "$PROD_SECRET" ] || [ "$PROD_SECRET" = "$DEV_SECRET" ]; then
      echo "PTS_JWT_SECRET in $ENV_FILE must be set and differ from server/.env." >&2
      exit 1
    fi
    echo "==> Uploading $ENV_FILE"
    push "$ENV_FILE" "$PTS_HOST:/opt/pts/server/.env"
    remote 'sudo chgrp pts /opt/pts/server/.env && chmod 640 /opt/pts/server/.env && sudo systemctl restart pts-api'
    health
    exit 0
    ;;

  "") ;;

  *)
    echo "Unknown option: $1" >&2
    exit 1
    ;;
esac

# ---- Normal deploy ---------------------------------------------------------

COMMIT="$(git rev-parse --short HEAD)"
echo "==> Deploying commit $COMMIT to $PTS_DOMAIN"
if [ -n "$(git status --porcelain)" ]; then
  echo "    Note: uncommitted changes are NOT deployed; this ships exactly commit $COMMIT."
fi

# Build from a clean checkout of HEAD so the live site always matches a commit.
SRC="$(mktemp -d)/pts-deploy"
git worktree add --detach "$SRC" HEAD >/dev/null
cleanup() { git worktree remove --force "$SRC" >/dev/null 2>&1 || true; }
trap cleanup EXIT
ln -s "$PWD/node_modules" "$SRC/node_modules"

echo "==> Building the site"
# Same-origin: the built app calls /api/... on whatever domain served it.
# No source maps: they'd publish the readable source.
(cd "$SRC" && env -u REACT_APP_API_BASE -u REACT_APP_API_PROXY_TARGET \
  GENERATE_SOURCEMAP=false npm run build)

echo "==> Uploading the API"
push --delete \
  --exclude node_modules --exclude '.env' --exclude '.env.*' --exclude '*.log' \
  --exclude 'scripts/.copy-checkpoint-*' --exclude .DS_Store \
  "$SRC/server/" "$PTS_HOST:/opt/pts/server/"

echo "==> Installing API dependencies and restarting"
remote 'cd /opt/pts/server && npm ci --omit=dev --no-audit --no-fund --loglevel=error && sudo systemctl restart pts-api'
health

echo "==> Uploading the site"
# Hashed assets first and never deleted, so open tabs on the old version keep
# loading their chunks; index.html last, which switches new visitors over.
push --exclude index.html "$SRC/build/" "$PTS_HOST:/opt/pts/web/"
push "$SRC/build/index.html" "$PTS_HOST:/opt/pts/web/index.html"

echo "Deployed $COMMIT to https://$PTS_DOMAIN"
