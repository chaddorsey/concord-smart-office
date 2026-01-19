#!/bin/bash
# Concord Smart Office - macOS Kiosk Launcher
# This script is run by the LaunchAgent on login

# Configuration
CONFIG_FILE="$HOME/.concord-kiosk.conf"
DEFAULT_SERVER="concord-server.local"
DEFAULT_ENDPOINT="/kiosk/entry1"

# Load config or use defaults
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi
SERVER="${KIOSK_SERVER:-$DEFAULT_SERVER}"
ENDPOINT="${KIOSK_ENDPOINT:-$DEFAULT_ENDPOINT}"
FALLBACK_IP="${KIOSK_FALLBACK_IP:-}"

# Full URL
URL="http://${SERVER}${ENDPOINT}"
FALLBACK_URL="http://${FALLBACK_IP}${ENDPOINT}"

echo "$(date): Starting Concord Kiosk"
echo "Server: $SERVER"
echo "Endpoint: $ENDPOINT"
echo "URL: $URL"

# Wait for network to be available
wait_for_network() {
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if ping -c 1 -W 2 "$SERVER" &>/dev/null; then
            echo "$(date): Server $SERVER is reachable"
            return 0
        fi

        # Try fallback IP if configured
        if [ -n "$FALLBACK_IP" ] && ping -c 1 -W 2 "$FALLBACK_IP" &>/dev/null; then
            echo "$(date): Using fallback IP $FALLBACK_IP"
            URL="$FALLBACK_URL"
            return 0
        fi

        attempt=$((attempt + 1))
        echo "$(date): Waiting for network (attempt $attempt/$max_attempts)..."
        sleep 2
    done

    echo "$(date): Network not available after $max_attempts attempts"
    return 1
}

# Hide the dock and menu bar (optional - uncomment if desired)
# defaults write com.apple.dock autohide -bool true
# killall Dock

# Wait for the display to be ready
sleep 3

# Wait for network
if ! wait_for_network; then
    echo "$(date): Starting anyway, Chrome will retry"
fi

# Kill any existing Chrome instances
pkill -f "Google Chrome" 2>/dev/null
sleep 1

# Start Chrome in kiosk mode
# --kiosk: Full screen without any browser UI
# --noerrdialogs: Suppress error dialogs
# --disable-infobars: No info bars
# --disable-session-crashed-bubble: No crash recovery prompts
# --check-for-update-interval: Disable update checks during kiosk
echo "$(date): Launching Chrome at $URL"
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    "$URL"
