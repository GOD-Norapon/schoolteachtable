#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
NODE_BIN="$(command -v node)"
PLIST_LABEL="com.timetable.supabase-keepalive"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"
STDOUT_LOG="${LOG_DIR}/${PLIST_LABEL}.log"
STDERR_LOG="${LOG_DIR}/${PLIST_LABEL}.err.log"

if [ -z "${NODE_BIN}" ]; then
  echo "Error: node not found in PATH." >&2
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents" "${LOG_DIR}"

# Unload existing job if present
if launchctl list | grep -q "${PLIST_LABEL}"; then
  launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || \
    launchctl unload "${PLIST_PATH}" 2>/dev/null || true
fi

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${PROJECT_DIR}/scripts/poke-supabase.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>259200</integer>
  <key>StandardOutPath</key>
  <string>${STDOUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${STDERR_LOG}</string>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}" 2>/dev/null || \
  launchctl load "${PLIST_PATH}"

echo "Installed LaunchAgent: ${PLIST_PATH}"
echo "Schedule: runs on login/load and every 3 days (259200 seconds)"
echo "Logs: ${STDOUT_LOG}"
echo "Error logs: ${STDERR_LOG}"
