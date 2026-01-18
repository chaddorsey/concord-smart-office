# Concord Smart Office - Docker Setup

## Quick Start (Development)

```bash
# From the docker/ directory
cd docker

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings (OAuth, Pixabay, etc.)

# Start Home Assistant + Backend
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker logs -f concord-backend
docker logs -f concord-ha

# Stop
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

**Services:**
- Home Assistant: **http://localhost:8123**
- Backend API: **http://localhost:3001**
- Backend Dashboard: **http://localhost:3001** (shows all endpoints)

## Services Overview

| Service | Port | Description |
|---------|------|-------------|
| `homeassistant` | 8123 | Home Assistant Core |
| `backend` | 3001 | Node.js API server (auth, presence, kiosks, frames) |
| `pwa` (optional) | 5173 | PWA dev server (use `--profile pwa`) |
| `mosquitto` (optional) | 1883 | MQTT broker (use `--profile mqtt`) |

## First-Time Setup

### 1. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
# Required for production auth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_ALLOWED_DOMAIN=yourdomain.com

# Security - generate random string
SESSION_SECRET=$(openssl rand -hex 32)

# Optional
PIXABAY_API_KEY=your-key
HA_WEBHOOK_TOKEN=your-secret
```

### 2. Initial HA Configuration

On first run, HA will prompt you to:
1. Create an admin account
2. Set your location (can skip)
3. Choose integrations (can skip)

### 3. Verify Backend

```bash
# Check health
curl http://localhost:3001/health

# Check config
curl http://localhost:3001/api/config
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Network                          │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Backend    │───▶│Home Assistant│    │   Mosquitto  │  │
│  │   :3001      │    │    :8123     │    │    :1883     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                    │                              │
│         ▼                    ▼                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Volumes                            │  │
│  │  backend-data (SQLite)  │  ha-config (HA config)     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
            │
            ▼ (exposed ports)
┌───────────────────────────────────────┐
│  PWA (localhost:5173) / Kiosk Displays │
│  Users access via browser              │
└───────────────────────────────────────┘
```

## Kiosk Displays

The backend serves several display pages:

| URL | Description |
|-----|-------------|
| `/kiosk/entry1` | QR code check-in kiosk |
| `/kiosk/entry2` | Secondary entrance kiosk |
| `/welcome.html` | Welcome screen (shows greetings) |
| `/dashboard.html` | Office dashboard (presence, music, frames) |
| `/frame/1` - `/frame/4` | Photo frame displays |
| `/browse.html` | Pixabay video browser |

### Kiosk Browser Setup

```bash
# Chrome kiosk mode
chromium --kiosk --app=http://localhost:3001/kiosk/entry1
```

## Development Modes

### Backend + HA Only (recommended)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Run PWA separately for hot reload
cd ../pwa && npm run dev
```

### All Services in Docker
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile pwa up
```

### With MQTT Broker
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile mqtt up
```

## Production Setup

```bash
# Use production compose
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# With nginx reverse proxy
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile proxy up -d
```

### Production Checklist

- [ ] Set strong `SESSION_SECRET`
- [ ] Configure Google OAuth with production callback URL
- [ ] Set up SSL/TLS (use nginx profile or external proxy)
- [ ] Set `PWA_URL` to production PWA URL
- [ ] Update `AUTH_CALLBACK_URL` for production
- [ ] Configure HA webhook token
- [ ] Back up `backend-data` volume (contains SQLite DB)

### Install Real Integrations (HA)

1. **HACS** (Home Assistant Community Store):
   - Follow: https://hacs.xyz/docs/setup/download

2. **SpotifyPlus** (via HACS):
   - Search "SpotifyPlus" in HACS
   - Configure with Spotify Developer credentials

3. **Oasis Mini** (via HACS):
   - Search "Oasis Mini" in HACS
   - Configure with your Oasis device

## Directory Structure

```
docker/
├── docker-compose.yml      # Base configuration
├── docker-compose.dev.yml  # Development overrides
├── docker-compose.prod.yml # Production overrides
├── .env.example            # Environment template
└── README.md               # This file

backend/
├── server.js               # Main Express server
├── db.js                   # SQLite database layer
├── services/               # Auth, kiosk, presence services
├── public/                 # Static files (kiosk, dashboard, frames)
├── Dockerfile              # Production Docker build
└── package.json            # Dependencies

homeassistant/
├── configuration.yaml      # Main HA config
└── packages/
    ├── presence.yaml       # Staff presence system
    ├── photo_frames.yaml   # Frame queue system
    ├── entertainment.yaml  # Spotify, Oasis
    └── dev_testing.yaml    # Mock entities for testing
```

## API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `GET /api/auth/session` - Get current session
- `POST /api/auth/logout` - Log out

### Presence
- `GET /api/presence` - Get all presence states
- `POST /api/presence/checkin` - Check in current user
- `POST /api/presence/checkout` - Check out current user

### Kiosk
- `GET /api/kiosk/token/:id` - Get QR token for kiosk
- `POST /api/kiosk/rotate/:id` - Force rotate token
- `POST /api/kiosk/validate` - Validate scanned token
- `GET /tap/:kioskId?token=xxx` - Handle QR scan redirect

### Frames
- `GET /api/queue` - Get all frame queues
- `POST /api/queue/add` - Add item to queue
- `POST /api/queue/vote` - Vote on queue item
- `GET /api/pixabay/videos` - Search Pixabay videos

## Troubleshooting

### Backend won't start
```bash
# Check logs
docker logs concord-backend

# Verify database
docker exec concord-backend ls -la /app/data
```

### HA won't start
```bash
# Check logs
docker logs concord-ha

# Validate config
docker exec concord-ha python -m homeassistant --config /config --script check_config
```

### OAuth not working
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Check `AUTH_CALLBACK_URL` matches Google Console settings
- Verify `GOOGLE_ALLOWED_DOMAIN` matches your Google Workspace domain

### PWA can't connect
- Verify backend is running: `curl http://localhost:3001/health`
- Check CORS allows PWA origin
- For demo mode, OAuth is not required

### Database issues
```bash
# Reset database (loses all data)
docker compose down
docker volume rm docker_backend-data
docker compose up -d
```
