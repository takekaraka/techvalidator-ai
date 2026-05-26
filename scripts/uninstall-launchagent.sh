#!/usr/bin/env bash
set -e
PLIST_DST="$HOME/Library/LaunchAgents/com.renderz.inbox.plist"
launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"
echo "✅ LaunchAgent desinstalado."
