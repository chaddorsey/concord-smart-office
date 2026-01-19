#!/bin/bash
# Concord Smart Office - Raspberry Pi Kiosk Setup
# Run this on a fresh Raspberry Pi OS (Lite or Desktop) installation
#
# Usage: curl -sL https://your-server/kiosk-setup.sh | bash
# Or: ./setup-kiosk.sh

set -e

echo "==================================="
echo "Concord Smart Office - RPi Kiosk"
echo "==================================="
echo

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "Please run without sudo. The script will ask for sudo when needed."
    exit 1
fi

# Prompt for configuration
read -p "Server hostname [concord-server.local]: " SERVER
SERVER="${SERVER:-concord-server.local}"

read -p "Kiosk endpoint [/kiosk/entry2]: " ENDPOINT
ENDPOINT="${ENDPOINT:-/kiosk/entry2}"

read -p "Fallback IP (optional): " FALLBACK_IP

read -p "Rotate display? (0=normal, 1=90°, 2=180°, 3=270°) [0]: " ROTATION
ROTATION="${ROTATION:-0}"

echo
echo "Configuration:"
echo "  Server: $SERVER"
echo "  Endpoint: $ENDPOINT"
echo "  Fallback IP: ${FALLBACK_IP:-none}"
echo "  Rotation: $ROTATION"
echo
read -p "Continue? [Y/n]: " CONFIRM
if [[ "$CONFIRM" =~ ^[Nn] ]]; then
    echo "Aborted."
    exit 0
fi

echo
echo "Installing packages..."
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
    chromium-browser \
    unclutter \
    xdotool \
    xserver-xorg \
    x11-xserver-utils \
    xinit \
    openbox

# Create kiosk config
echo "Creating configuration..."
mkdir -p "$HOME/.config/concord"
cat > "$HOME/.config/concord/kiosk.conf" << EOF
KIOSK_SERVER="$SERVER"
KIOSK_ENDPOINT="$ENDPOINT"
KIOSK_FALLBACK_IP="$FALLBACK_IP"
EOF

# Create kiosk start script
echo "Creating kiosk script..."
cat > "$HOME/kiosk.sh" << 'KIOSK_SCRIPT'
#!/bin/bash
# Concord Kiosk Start Script

# Load config
source "$HOME/.config/concord/kiosk.conf"

URL="http://${KIOSK_SERVER}${KIOSK_ENDPOINT}"
FALLBACK_URL="http://${KIOSK_FALLBACK_IP}${KIOSK_ENDPOINT}"

# Wait for network
wait_for_server() {
    local max=60
    local i=0
    while [ $i -lt $max ]; do
        if ping -c 1 -W 2 "$KIOSK_SERVER" &>/dev/null; then
            return 0
        fi
        if [ -n "$KIOSK_FALLBACK_IP" ] && ping -c 1 -W 2 "$KIOSK_FALLBACK_IP" &>/dev/null; then
            URL="$FALLBACK_URL"
            return 0
        fi
        i=$((i + 1))
        sleep 2
    done
    return 1
}

# Disable screen blanking
xset s off
xset s noblank
xset -dpms

# Hide cursor after 0.5 seconds of inactivity
unclutter -idle 0.5 -root &

# Wait for server
wait_for_server

# Start Chromium in kiosk mode
exec chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --disable-features=TranslateUI \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    --start-fullscreen \
    "$URL"
KIOSK_SCRIPT
chmod +x "$HOME/kiosk.sh"

# Configure openbox autostart
echo "Configuring autostart..."
mkdir -p "$HOME/.config/openbox"
cat > "$HOME/.config/openbox/autostart" << 'AUTOSTART'
# Start the kiosk
$HOME/kiosk.sh &
AUTOSTART

# Create .xinitrc
cat > "$HOME/.xinitrc" << 'XINITRC'
#!/bin/bash
exec openbox-session
XINITRC
chmod +x "$HOME/.xinitrc"

# Configure auto-login and start X on boot
echo "Configuring auto-login..."
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d/
sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf > /dev/null << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USER --noclear %I \$TERM
EOF

# Start X on login
if ! grep -q "startx" "$HOME/.bash_profile" 2>/dev/null; then
    cat >> "$HOME/.bash_profile" << 'BASH_PROFILE'

# Auto-start X on tty1
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    exec startx
fi
BASH_PROFILE
fi

# Configure display rotation if needed
if [ "$ROTATION" != "0" ]; then
    echo "Configuring display rotation..."
    sudo tee -a /boot/config.txt > /dev/null << EOF

# Display rotation for kiosk
display_rotate=$ROTATION
EOF
fi

# Disable screen blanking in boot config
if ! grep -q "consoleblank=0" /boot/cmdline.txt 2>/dev/null; then
    echo "Disabling console blanking..."
    sudo sed -i 's/$/ consoleblank=0/' /boot/cmdline.txt
fi

echo
echo "==================================="
echo "Installation complete!"
echo "==================================="
echo
echo "Reboot to start the kiosk: sudo reboot"
echo
echo "To reconfigure: edit ~/.config/concord/kiosk.conf"
echo "To exit kiosk: Alt+F4 or SSH in and run: pkill chromium"
echo
