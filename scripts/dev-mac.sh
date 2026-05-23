#!/usr/bin/env bash
# Renderz Studio — bootstrap para Mac. Uso:
#   bash scripts/dev-mac.sh
# o desde GitHub:
#   curl -fsSL https://raw.githubusercontent.com/takekaraka/techvalidator-ai/claude/iphone-email-classifier-drive-zfQ6j/scripts/dev-mac.sh | bash

set -e

REPO="https://github.com/takekaraka/techvalidator-ai.git"
BRANCH="claude/iphone-email-classifier-drive-zfQ6j"
DIR="$HOME/techvalidator-ai"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Renderz Studio — setup en Mac"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Falta Node. Instalalo con: brew install node"
  exit 1
fi

if [ ! -d "$DIR/.git" ]; then
  echo "→ Clonando repo en $DIR…"
  git clone "$REPO" "$DIR"
fi

cd "$DIR"
echo "→ Trayendo última versión de $BRANCH…"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only

echo "→ npm install…"
npm install --no-fund --no-audit >/dev/null

if [ ! -f .env ]; then
  echo "→ Creando .env desde .env.example…"
  cp .env.example .env
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "(no detectada)")
PORT="${PORT:-3000}"

# Sugerir un Basic Auth si no está definido y arrancamos sin él.
if ! grep -q '^BASIC_AUTH_USER=' .env 2>/dev/null; then
  RANDOM_PASS=$(openssl rand -base64 12 2>/dev/null | tr -d '=+/' | cut -c1-12 || echo "renderz$(date +%s)")
  cat >> .env <<EOF

# Basic Auth (descomenta para proteger el acceso si exponés a internet):
# BASIC_AUTH_USER=isa
# BASIC_AUTH_PASS=$RANDOM_PASS
EOF
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Todo listo. URLs para probar:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " En la Mac:       http://localhost:$PORT/inbox.html"
echo " Desde iPad/iPhone (misma WiFi):"
echo "                  http://$IP:$PORT/inbox.html"
echo ""
echo " Healthcheck:     http://$IP:$PORT/healthz"
echo ""
echo " Para que la Mac no se duerma mientras corre el server:"
echo "   caffeinate -dimsu &        # detiene la suspensión hasta que la mates"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Arrancando npm start (Ctrl+C para parar)…"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
exec npm start
