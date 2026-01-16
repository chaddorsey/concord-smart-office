# Concord Smart Office

## Project Overview

A Home Assistant-controlled smart office system with a mobile PWA for staff presence management and group-controlled entertainment systems.

## Architecture

### Core Components

1. **Home Assistant (Dockerized)**
   - Central hub for all integrations and automations
   - Supports dev/test/prod environment parity via Docker Compose
   - Custom components via HACS

2. **PWA Mobile Interface**
   - Individual staff authentication via HA
   - QR and NFC-based scan-in/scan-out
   - Presence-aware feature permissions

3. **Physical Integrations**
   - Flipper Zero: NFC tag detector for scan-in/out
   - Four web-based photo frame displays
   - Spotify-connected audio system
   - Oasis Mini sand table

### Tech Stack

- **Backend**: Home Assistant Core (Docker)
- **PWA**: TypeScript, modern framework (React/Vue/Svelte TBD)
- **Database**: HA's built-in recorder + optional external DB
- **Integrations**: SpotifyPlus, Oasis Mini (HACS), custom Flipper Zero integration
- **Container Orchestration**: Docker Compose

## Key Features

### Staff Presence System
- QR code scan-in/scan-out (camera-based)
- NFC scan-in/scan-out via Flipper Zero with on-screen confirmation
- Real-time dashboard of who's currently in office with arrival times
- Presence status drives feature permissions

### Entertainment Controls (Scanned-In Users Only)
- **Spotify**: Group voting for playlist control via SpotifyPlus
- **Photo Frames**: Group-curated image playlists with upvote/downvote
- **Oasis Sand Table**: Group voting for sand pattern playlist

### Dashboards
- Central office dashboard (wall-mounted displays)
- Mobile dashboard (all users): presence list, current song, current sand pattern
- Mobile controls (scanned-in users only): voting interfaces

## Directory Structure

```
concord-smart-office/
├── docker/                    # Docker configurations
│   ├── docker-compose.yml     # Main compose file
│   ├── docker-compose.dev.yml # Dev overrides
│   ├── docker-compose.prod.yml# Prod overrides
│   └── ha-config/             # HA config volume mount
├── homeassistant/             # Home Assistant configuration
│   ├── configuration.yaml     # Main HA config
│   ├── automations/           # Automation YAML files
│   ├── scripts/               # Script definitions
│   ├── custom_components/     # Custom integrations
│   └── www/                   # Static assets for HA frontend
├── pwa/                       # Progressive Web App
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── services/          # HA API, NFC, QR services
│   │   ├── stores/            # State management
│   │   └── views/             # Page views
│   ├── public/
│   └── package.json
├── flipper/                   # Flipper Zero integration
│   └── nfc-bridge/            # NFC event bridge to HA
├── scripts/                   # Deployment & utility scripts
├── docs/                      # Documentation
└── tests/                     # Integration tests
```

## Development Guidelines

### Home Assistant
- Use packages pattern for organizing HA config by feature
- Prefer YAML automations over UI-created (version control)
- Use secrets.yaml for all credentials (gitignored)
- Test automations in dev before deploying to prod

### PWA Development
- Mobile-first responsive design
- Offline capability for basic presence display
- Real-time updates via HA WebSocket API
- Graceful degradation when HA unavailable

### Docker Strategy
- Dev: Hot-reload HA config, mock integrations available
- Test: Full integration testing with simulated devices
- Prod: Optimized, minimal logging, proper secrets management

## Integration References

- **SpotifyPlus**: https://github.com/thlucas1/homeassistantcomponent_spotifyplus/wiki
- **Oasis Mini**: https://github.com/natekspencer/hacs-oasis_mini
- **HA WebSocket API**: https://developers.home-assistant.io/docs/api/websocket
- **HA REST API**: https://developers.home-assistant.io/docs/api/rest

## Environment Variables

Required in production (use .env file, never commit):
- `HA_POSTGRES_PASSWORD` - Database password (if using external DB)
- `SPOTIFY_CLIENT_ID` - Spotify API credentials
- `SPOTIFY_CLIENT_SECRET`
- `FLIPPER_BRIDGE_TOKEN` - Auth token for Flipper NFC bridge

## Commands

```bash
# Development
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up

# Production
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d

# PWA development
cd pwa && npm run dev

# Run tests
npm run test
```

## Current Status

Project initialization phase. Next steps:
1. Set up Docker Compose for HA dev environment
2. Configure basic HA with SpotifyPlus and Oasis integrations
3. Scaffold PWA with HA authentication
4. Implement presence system (QR first, then NFC)
5. Build voting/control interfaces

## Notes for Claude

- This project runs in a sandboxed devpod environment
- Feel free to create files, run Docker commands, install packages
- Prefer iterative development with working increments
- Test integrations with mock data before requiring physical devices
- Keep HA configuration modular and well-documented
