# Concord Smart Office - Docker Setup

## Quick Start (Development)

```bash
# From the docker/ directory
cd docker

# Start Home Assistant
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker logs -f concord-ha

# Stop
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

Home Assistant will be available at: **http://localhost:8123**

## First-Time Setup

### 1. Initial HA Configuration

On first run, HA will prompt you to:
1. Create an admin account
2. Set your location (can skip)
3. Choose integrations (can skip)

### 2. Create a Long-Lived Access Token

1. Go to your profile (click your username in sidebar)
2. Scroll to "Long-Lived Access Tokens"
3. Click "Create Token"
4. Name it "PWA" and copy the token
5. Use this token in the PWA login screen

### 3. Verify Entities

After HA starts, check that these entities exist:
- `input_boolean.staff_alice_present` (and bob, carol, dave, eve, frank)
- `input_datetime.staff_alice_arrival` (and others)
- `sensor.staff_currently_present`

You can verify in Developer Tools > States.

## Testing with Mock Entities

The `dev_testing.yaml` package provides mock entities for:
- **Spotify**: `sensor.mock_spotify_player` with play/pause/next
- **Oasis Sand Table**: `input_select.mock_oasis_pattern`
- **Photo Frames**: `input_boolean.mock_frame_*_online`

These let you test the PWA without real hardware.

## Production Setup

### For Office Deployment

```bash
# Use production compose (includes restart policies)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Install Real Integrations

1. **HACS** (Home Assistant Community Store):
   - Follow: https://hacs.xyz/docs/setup/download

2. **SpotifyPlus** (via HACS):
   - Search "SpotifyPlus" in HACS
   - Configure with Spotify Developer credentials

3. **Oasis Mini** (via HACS):
   - Search "Oasis Mini" in HACS
   - Configure with your Oasis device

### Remove Dev Testing Package

In production, you can remove mock entities by deleting:
```
homeassistant/packages/dev_testing.yaml
```

Or rename it to `dev_testing.yaml.disabled`

## Directory Structure

```
docker/
├── docker-compose.yml      # Base configuration
├── docker-compose.dev.yml  # Development overrides
├── docker-compose.prod.yml # Production overrides
└── README.md               # This file

homeassistant/
├── configuration.yaml      # Main HA config
├── automations.yaml        # Automations
├── scripts.yaml            # Scripts
├── scenes.yaml             # Scenes
└── packages/
    ├── presence.yaml       # Staff presence system
    ├── entertainment.yaml  # Spotify, Oasis, Photo Frames
    └── dev_testing.yaml    # Mock entities for testing
```

## Connecting the PWA

### Development (same machine)
- HA URL: `http://localhost:8123`
- Or use Demo Mode (no HA required)

### Production (office network)
- HA URL: `http://<server-ip>:8123`
- Consider using HTTPS with a reverse proxy

### Mobile App (iOS)
- Build and deploy via Xcode
- Enter HA URL on login screen
- Or use Demo Mode for testing

## Troubleshooting

### HA won't start
```bash
# Check logs
docker logs concord-ha

# Validate config
docker exec concord-ha python -m homeassistant --config /config --script check_config
```

### Entities missing
- Check packages are included in configuration.yaml
- Look for YAML syntax errors in logs
- Restart HA after config changes

### PWA can't connect
- Verify HA is running: `curl http://localhost:8123/api/`
- Check CORS settings if needed
- Verify access token is valid
