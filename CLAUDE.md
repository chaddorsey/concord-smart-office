# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Home Assistant-controlled smart office system with a React PWA for staff presence management and group-controlled entertainment (Spotify, photo frames, Oasis sand table).

## Commands

```bash
# PWA
cd pwa && npm run dev      # Vite dev server on :5173
cd pwa && npm run build    # TypeScript + Vite production build
cd pwa && npm run lint     # ESLint

# Backend
cd backend && npm run dev  # Node with --watch on :3001
cd backend && npm start    # Production

# Docker (full stack)
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d

# Server setup
./install.sh               # Configures hostname, .env, Docker on Mac
```

## Architecture

### Three-Tier System
- **PWA** (`pwa/`): React 19 + TypeScript + Vite + TailwindCSS. Mobile-first with Capacitor for NFC/camera.
- **Backend** (`backend/`): Express + SQLite (better-sqlite3). Handles auth, presence, voting queues, SSE to kiosks.
- **Home Assistant** (`homeassistant/`): Automations receive webhooks from backend, controls physical devices.

### Data Flow
1. User scans QR/NFC → Backend validates → Updates SQLite → POSTs webhook to HA
2. User votes on music/pattern → Backend tallies → Threshold triggers HA automation
3. Kiosks receive token updates via SSE from backend

### PWA State Management
React Context API with feature-scoped contexts:
- `AuthContext` - Google OAuth sessions
- `PresenceContext` - Check-in/out state
- `MusicContext` - Spotify voting
- `OasisContext` - Sand patterns, LED effects
- `PhotoFrameContext` - Frame queue voting

Services connect to backend REST API and HA WebSocket (proxied via Vite in dev).

### Home Assistant Config
Uses packages pattern in `homeassistant/packages/`:
- `presence.yaml` - Staff tracking automations
- `entertainment.yaml` - Spotify/Oasis/frame voting triggers
- `photo_frames.yaml` - Frame queue system
- `dev_testing.yaml` - Mock entities for local dev

### Backend Services
Modular services in `backend/services/`:
- `authService.js` - Google OAuth, session management
- `presenceService.js` - Check-in/out, presence state
- `kioskService.js` - QR token rotation (60s expiry)
- `musicService.js` - Spotify voting queue
- `oasisService.js` - Sand pattern queue, LED control
- `customPatternService.js` - User-created patterns

Database schema in `backend/db.js` (SQLite): users, sessions, presence, queues, votes.

## Key Integration Points

- **Backend → HA**: Webhooks for presence changes and vote thresholds
- **PWA → HA**: WebSocket via Vite proxy (`/ha-ws`) for real-time state
- **Backend → Kiosks**: SSE for QR token rotation
- **PWA → Backend**: REST API with cookie-based sessions

## Environment Variables

Required in `backend/.env`:
```
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ALLOWED_DOMAIN
SESSION_SECRET
HA_WEBHOOK_TOKEN
TOKEN_EXPIRY_SECONDS
PIXABAY_API_KEY
PWA_URL, AUTH_CALLBACK_URL
```

## Development Notes

- Vite proxies `/api` → backend:3001 and `/ha-api`, `/ha-ws` → HA:8123
- Backend runs SQLite in-process (no external DB needed)
- Mock mode available in PWA for testing without Google OAuth
- HA automations are YAML-based (version controlled) using packages pattern
