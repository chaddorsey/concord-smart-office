#!/bin/bash
# Concord Smart Office - macOS Kiosk Setup
# Run this script on the Mac mini to configure it as a kiosk

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==================================="
echo "Concord Smart Office - Kiosk Setup"
echo "==================================="
echo

# Prompt for configuration
read -p "Server hostname [concord-server.local]: " SERVER
SERVER="${SERVER:-concord-server.local}"

read -p "Kiosk endpoint [/kiosk/entry1]: " ENDPOINT
ENDPOINT="${ENDPOINT:-/kiosk/entry1}"

read -p "Fallback IP (optional, press enter to skip): " FALLBACK_IP

echo
echo "Configuration:"
echo "  Server: $SERVER"
echo "  Endpoint: $ENDPOINT"
echo "  Fallback IP: ${FALLBACK_IP:-none}"
echo
read -p "Continue with installation? [Y/n]: " CONFIRM
if [[ "$CONFIRM" =~ ^[Nn] ]]; then
    echo "Aborted."
    exit 0
fi

# Create config file
echo "Creating configuration file..."
cat > "$HOME/.concord-kiosk.conf" << EOF
# Concord Kiosk Configuration
KIOSK_SERVER="$SERVER"
KIOSK_ENDPOINT="$ENDPOINT"
KIOSK_FALLBACK_IP="$FALLBACK_IP"
EOF

# Install kiosk script
echo "Installing kiosk script..."
sudo cp "$SCRIPT_DIR/concord-kiosk.sh" /usr/local/bin/
sudo chmod +x /usr/local/bin/concord-kiosk.sh

# Install LaunchAgent
echo "Installing LaunchAgent..."
mkdir -p "$HOME/Library/LaunchAgents"
cp "$SCRIPT_DIR/com.concord.kiosk.plist" "$HOME/Library/LaunchAgents/"

# Load the LaunchAgent
echo "Loading LaunchAgent..."
launchctl unload "$HOME/Library/LaunchAgents/com.concord.kiosk.plist" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/com.concord.kiosk.plist"

echo
echo "==================================="
echo "Installation complete!"
echo "==================================="
echo
echo "The kiosk will start automatically on login."
echo
echo "To start now:  launchctl start com.concord.kiosk"
echo "To stop:       launchctl stop com.concord.kiosk"
echo "View logs:     tail -f /tmp/concord-kiosk.log"
echo
echo "To reconfigure, edit: ~/.concord-kiosk.conf"
echo "Then restart: launchctl stop com.concord.kiosk && launchctl start com.concord.kiosk"
echo

# Optional: Configure auto-login and other kiosk settings
echo "Optional kiosk hardening (requires admin):"
echo "  - Enable auto-login: System Preferences > Users & Groups > Login Options"
echo "  - Disable sleep: System Preferences > Energy Saver"
echo "  - Hide dock: defaults write com.apple.dock autohide -bool true && killall Dock"
echo
