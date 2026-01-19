# Concord Smart Office - Kiosk Setup

This directory contains setup scripts for kiosk displays.

## Mac mini Kiosk

For a Mac mini running as a check-in kiosk:

```bash
cd kiosk/macos
chmod +x setup-kiosk.sh
./setup-kiosk.sh
```

This will:
- Prompt for server hostname and endpoint
- Install a LaunchAgent that starts Chrome in kiosk mode on login
- Auto-restart Chrome if it crashes

### Configuration

Edit `~/.concord-kiosk.conf` to change settings:
```bash
KIOSK_SERVER="concord-server.local"
KIOSK_ENDPOINT="/kiosk/entry1"
KIOSK_FALLBACK_IP="192.168.1.100"  # Optional
```

### Commands

```bash
# Start kiosk
launchctl start com.concord.kiosk

# Stop kiosk
launchctl stop com.concord.kiosk

# View logs
tail -f /tmp/concord-kiosk.log

# Uninstall
launchctl unload ~/Library/LaunchAgents/com.concord.kiosk.plist
rm ~/Library/LaunchAgents/com.concord.kiosk.plist
rm /usr/local/bin/concord-kiosk.sh
rm ~/.concord-kiosk.conf
```

### Recommended macOS Settings

1. **Auto-login**: System Preferences → Users & Groups → Login Options
2. **Disable sleep**: System Preferences → Energy Saver → Never
3. **Hide dock**: `defaults write com.apple.dock autohide -bool true && killall Dock`
4. **Disable screen saver**: System Preferences → Desktop & Screen Saver

---

## Raspberry Pi Kiosk

For a Raspberry Pi running as a check-in kiosk or photo frame display:

### Quick Setup

```bash
# On a fresh Raspberry Pi OS installation:
curl -sL https://raw.githubusercontent.com/your-repo/main/kiosk/rpi/setup-kiosk.sh | bash
```

Or copy the script and run:
```bash
chmod +x setup-kiosk.sh
./setup-kiosk.sh
```

### Configuration

Edit `~/.config/concord/kiosk.conf`:
```bash
KIOSK_SERVER="concord-server.local"
KIOSK_ENDPOINT="/kiosk/entry2"  # or /frame/1 for photo frames
KIOSK_FALLBACK_IP="192.168.1.100"
```

### Raspberry Pi OS Recommendations

- Use **Raspberry Pi OS Lite** (no desktop) for minimal resource usage
- Or **Raspberry Pi OS with Desktop** if you need easier troubleshooting

### Display Rotation

The setup script asks about rotation. Values:
- `0` = Normal (landscape)
- `1` = 90° clockwise
- `2` = 180° (upside down)
- `3` = 270° clockwise (90° counter-clockwise)

### Troubleshooting

```bash
# SSH into the Pi
ssh pi@raspberrypi.local

# Check if kiosk is running
pgrep chromium

# Stop kiosk
pkill chromium

# View X logs
cat ~/.local/share/xorg/Xorg.0.log

# Restart kiosk manually
startx
```

---

## Muse Frames

Muse frames have a built-in kiosk browser. Configure in the Muse app:

1. Open Muse app settings
2. Find "Kiosk" or "Web Display" mode
3. Enter URL: `http://concord-server.local/frame/1`

Replace `/frame/1` with `/frame/2`, `/frame/3`, `/frame/4` for each frame.

---

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/kiosk/entry1` | Main entrance check-in kiosk |
| `/kiosk/entry2` | Secondary entrance kiosk |
| `/frame/1` | Photo frame display 1 |
| `/frame/2` | Photo frame display 2 |
| `/frame/3` | Photo frame display 3 |
| `/frame/4` | Photo frame display 4 |
| `/` | PWA for staff phones |
