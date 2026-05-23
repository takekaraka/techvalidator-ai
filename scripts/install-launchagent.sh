#!/usr/bin/env bash
# Instala el server como LaunchAgent en la Mac: arranca solo cada vez que loguees
# y se reinicia si crashea. Para desinstalar: bash scripts/uninstall-launchagent.sh
set -e

PLIST_SRC="$(dirname "$0")/com.renderz.inbox.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.renderz.inbox.plist"

NODE_PATH="$(command -v node)"
if [ -z "$NODE_PATH" ]; then
  echo "❌ Falta node. brew install node" && exit 1
fi

# Sustituye __HOME__ por $HOME y la ruta de node si difiere de /usr/local/bin/node.
sed -e "s|__HOME__|$HOME|g" -e "s|/usr/local/bin/node|$NODE_PATH|g" "$PLIST_SRC" > "$PLIST_DST"

launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

echo "✅ LaunchAgent instalado. El server arrancará automáticamente al loguear."
echo "   Logs:  ~/Library/Logs/renderz-inbox.{out,err}.log"
echo "   Estado: launchctl list | grep renderz"
echo "   Parar:  launchctl unload $PLIST_DST"
