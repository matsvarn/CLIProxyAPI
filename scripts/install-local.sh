#!/usr/bin/env bash
# Local custom build: embeds the web/ management UI into the binary and
# installs it as a launchd agent with CPA_TRUST_LOCAL_PANEL=1.
set -euo pipefail

cd "$(dirname "$0")/.."

BIN_DIR="$HOME/.local/bin"
BIN="$BIN_DIR/cliproxyapi"
CONFIG_PATH="/opt/homebrew/etc/cliproxyapi.conf"
PLIST_LABEL="dev.local.cliproxyapi"
PLIST="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
LOG_FILE="$HOME/Library/Logs/cliproxyapi.log"

echo "==> Building management UI"
(cd web && bun install --frozen-lockfile && bun run build)
cp web/dist/index.html internal/managementasset/panel/management.html

VERSION="$(git describe --tags --always)-custom"
COMMIT="$(git rev-parse --short HEAD)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "==> Building cliproxyapi ($VERSION)"
mkdir -p "$BIN_DIR"
TMP_BIN="$(mktemp "$BIN_DIR/.cliproxyapi.XXXXXX")"
trap 'rm -f "$TMP_BIN"' EXIT
go build \
  -ldflags "-X main.Version=$VERSION -X main.Commit=$COMMIT -X main.BuildDate=$BUILD_DATE -X main.DefaultConfigPath=$CONFIG_PATH" \
  -o "$TMP_BIN" ./cmd/server
chmod +x "$TMP_BIN"
mv "$TMP_BIN" "$BIN"
trap - EXIT

echo "==> Installing launch agent $PLIST_LABEL"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN</string>
    <string>--config</string>
    <string>$CONFIG_PATH</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CPA_TRUST_LOCAL_PANEL</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$LOG_FILE</string>
</dict>
</plist>
PLIST

if brew services list 2>/dev/null | grep -qE '^cliproxyapi\s+started'; then
  echo "==> Stopping Homebrew service cliproxyapi"
  brew services stop cliproxyapi
fi

launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
for _ in $(seq 1 50); do
  launchctl print "gui/$(id -u)/$PLIST_LABEL" &>/dev/null || break
  sleep 0.2
done
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "==> Waiting for 127.0.0.1:8317"
for _ in $(seq 1 60); do
  if curl -s -o /dev/null "http://127.0.0.1:8317/management.html"; then
    break
  fi
  sleep 1
done

echo "Done. Panel: http://127.0.0.1:8317/management.html (no key needed locally)."
