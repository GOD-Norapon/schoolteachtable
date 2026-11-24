#!/usr/bin/env bash
set -euo pipefail

PLIST_LABEL="com.timetable.supabase-keepalive"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_LABEL}.plist"

if [ -f "${PLIST_PATH}" ]; then
  launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || \
    launchctl unload "${PLIST_PATH}" 2>/dev/null || true
  rm -f "${PLIST_PATH}"
  echo "Removed LaunchAgent: ${PLIST_PATH}"
else
  echo "LaunchAgent not found: ${PLIST_PATH}"
fi
