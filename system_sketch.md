# Staff Week Presence + Environment System (LLM-Ready Spec)

**Timeline:** Ready by Monday night (MVP), expandable after staff week.  
**User installs:** **One** app (PWA). **No Home Assistant app install** required.  
**Trust model:** Casual (no NFC spoofing concerns); QR uses rotating kiosk token.

---

## 0) Goals

### MVP Goals (must work next week)
1. **Authenticate** staff via Google OAuth (restricted to Workspace domain).
2. **Check-in** via QR (rotating token), with **NFC tap-to-open** highly desirable.
3. **Unlock in-office features** in the PWA after check-in.
4. **Voting/queues controlling Spotify, Oasis table, and photo frames.
5. **Room identity** (6 zones) via BLE tags + BLE proxies (ESP32).
6. **Soft checkout** via BLE absence with sensible timers.
7. **Lighting / occupancy automation** via mmWave + Zigbee plugs.
8. ** Preference weighting of images/colors/music volume/music style when BLE-identified users present.

### Post-MVP Goals (after staff week)
- Visitor/guest mode.
- Welcome screen** near entry reacts quickly to arrivals.

---

## 1) System Overview

### Components
1. **PWA (client)**
   - Google OAuth login
   - QR/NFC entry flows
   - BLE tag claim/reclaim UI
   - Preferences and voting UI
   - Optional install-to-home-screen + web push

2. **Backend (server)**
   - Canonical user/auth/session state
   - Canonical presence state machine
   - BLE tag claim/reclaim/dissociation logic
   - Voting/queue logic (Spotify/Oasis/frames)
   - Sends events to Home Assistant via HA webhooks (server-to-HA)

3. **Home Assistant (HA)**
   - Zigbee (ZHA recommended for MVP)
   - mmWave sensors (room occupancy)
   - BLE proxies (ESPHome Bluetooth proxy)
   - Room inference (Bermuda via HACS recommended)
   - Dashboard displays (welcome/main)
   - Automations responding to events + sensor fusion

4. **BLE Layer**
   - 6+ ESP32 BLE proxies (1 per room/zone)
   - 2 proxies at door recommended (outside-ish + inside-ish)
   - Blue Charm BC021 BLE beacons carried by users

5. **Displays**
   - Entry welcome screen (kiosk) a few meters inside main door
   - Main office dashboard display (optional second screen)

---

## 2) Key Implementation Choices (Recommended)

### Zigbee
- Use **ZHA** in HA for MVP (fast, built-in, fewer moving parts).
- Use **Sonoff ZBDongle-E** as the coordinator.
- THIRDREALITY Zigbee smart plugs act as repeaters; pair a few near coordinator first.

### BLE Room Identity
- Use **ESPHome Bluetooth Proxy** on ESP32 devices.
- Use **Bermuda** (HACS) for "beacon → room/area + distance-ish" inference.

### Beacon Identity Scheme (Recommended)
Use iBeacon identifiers:
- One global `UUID` for the project (e.g., “StaffWeek-2026” UUID)
- Unique `(major, minor)` per physical tag
- QR code on tag encodes `{uuid, major, minor}`

Avoid using MAC addresses (BLE MACs can be unreliable/obscured; iBeacon IDs are stable).

### PWA ↔ HA Communication
- Use **HA Webhook-triggered automations**.
- Backend sends webhook POSTs to HA (never store HA long-lived tokens in the browser).
- Backend is canonical for presence, HA is canonical for device states/sensors.

---

## 3) Identity & Trust Model

### Staff
- Google OAuth restricted to Workspace domain.
- Session cookie/JWT stored by backend.

### Guest Mode (not required for next week)
- Placeholder design: guests get temporary accounts with limited permissions and no BLE tag requirement.

### NFC Trust
- NFC is treated as physical-proximity sufficient for pilot; spoofing not addressed.

### QR Trust
- QR contains a **rotating kiosk token**, validated by backend.
- Backup access: static QR or numeric code allows check-in if kiosk fails.

---

## 4) Data Model (Backend)

### Tables / Entities
**User**
- `id`
- `name`
- `email`
- `role` = `staff|guest`
- `created_at`

**PresenceState**
- `user_id`
- `status` = `OUT|IN|MAYBE_OUT`
- `checked_in_at`
- `last_seen_at` (from BLE)
- `room_id` (best-known)
- `updated_at`

**Beacon**
- `beacon_id` (canonical internal id)
- `uuid`
- `major`
- `minor`
- `claimed_by_user_id` (nullable)
- `claimed_at` (nullable)
- `last_seen_at` (nullable)
- `last_room_id` (nullable)

**PresenceEvent**
- `id` (uuid)
- `ts`
- `type` = `CHECKIN|CHECKOUT|AUTO_CHECKOUT|TAG_CLAIM|TAG_RELEASE|ROOM_CHANGE|WELCOME_TRIGGER|...`
- `source` = `qr|nfc|manual|ble|system|admin`
- `user_id` (nullable for events like anonymous scans)
- `beacon_id` (nullable)
- `room_id` (nullable)
- `payload_json`

**PreferenceProfile**
- `user_id`
- `music_style`
- `color_palette`
- `image_style`
- `etc`

**Vote** (stub for later)
- `id`
- `user_id`
- `target` = `spotify|oasis|frames`
- `item_id`
- `room_id` (optional)
- `ts`

---

## 5) Presence State Machine (Authoritative in Backend)

### States
- **OUT**: user not checked in
- **IN**: user checked in and has in-office capabilities
- **MAYBE_OUT**: user checked in, but BLE evidence suggests they may have left

### Inputs
1. Manual check-in via QR/NFC/manual button
2. Manual check-out via QR/manual button
3. BLE seen/unseen + room inference
4. Door sensor open event (from HA, optional fusion)
5. Kiosk token validation (QR)

### State Transitions (Recommended)
#### CHECK-IN
- `OUT → IN` immediately upon successful check-in
- Set `checked_in_at = now`

#### Soft Checkout (BLE-driven)
- If `IN` and beacon unseen anywhere for `T_absent` (default **15 min**):
  - `IN → MAYBE_OUT`
- If `MAYBE_OUT` and beacon still unseen for additional `T_grace` (default **5 min**):
  - `MAYBE_OUT → OUT`
  - record `AUTO_CHECKOUT`

#### Reappearance
- If `MAYBE_OUT` and beacon reappears:
  - `MAYBE_OUT → IN`
  - cancel checkout timers

#### Manual CHECK-OUT
- `IN|MAYBE_OUT → OUT` immediately

### Beacon Dissociation Rule (Your Policy)
When a user checks out manually:
- If the user’s claimed beacon is seen **inside** the building for > **2 minutes** after checkout:
  - automatically unclaim the beacon (make it available)
  - notify user (“Looks like you left your tag behind; we unlinked it.”)
  - notify admin optionally

---

## 6) BLE Tag Claim/Reclaim Workflow (Informal)

### Claiming
- User visits PWA “Claim BLE Tag”
- Scans QR on beacon (or enters short code)
- Backend sets beacon `claimed_by_user_id = user.id`
- If the beacon was previously claimed:
  - previous user is implicitly dissociated
  - record event `TAG_CLAIM` with “reclaimed=true”

### Unclaiming
- Manual unclaim in PWA (optional)
- Auto-unclaim triggered by “checkout but beacon still inside” rule above

### Missing Tag Admin Alerts
- HA should trigger admin notifications when:
  - a beacon hasn’t been seen in `X hours` but is still claimed (battery dead / lost)
  - proxies offline
- Backend can also detect “claimed but never seen” and surface in admin UI.

---

## 7) HA Entity Model & Helpers

### Required HA Devices/Sensors
- `binary_sensor.entry_door` (Zigbee contact sensor)
- `sensor.<room>_mmwave_presence` (per room; occupancy/presence)
- ESPHome BLE proxies assigned to Areas (rooms)
- Bermuda entities for beacons:
  - `sensor.beacon_<id>_area` (best room)
  - `sensor.beacon_<id>_distance` (optional)
  - `sensor.beacon_<id>_last_seen` (or similar)

### Required HA Helpers (create via HA UI)
**Welcome helpers**
- `input_boolean.welcome_active`
- `input_text.welcome_user_name`
- `input_text.welcome_user_id`
- `input_text.welcome_room_id`
- `input_datetime.welcome_time`

**Optional (room state)**
- `input_select.active_scene_<room>`
- `input_number.volume_<room>`

---

## 8) PWA + Backend Flows

### 8.1 Login
- Google OAuth → backend session
- Restrict to Workspace domain
- After login: prompt “Install to Home Screen” (optional; for notifications later)

### 8.2 QR Check-in (MVP)
#### On kiosk (display)
- Show QR that links to:
  - `/tap/entry?token=<rotating_token>&kiosk=entry1`
- Token rotates every **30 seconds** (configurable).
- Also show numeric backup code.

#### In PWA
- Scan QR OR open link → login if needed → backend validates token.
- Backend writes `PresenceEvent(CHECKIN)` and sets state `IN`.
- Backend POSTs to HA webhook `staffweek_checkin`.
- Backend redirects to `/app/status` (PWA scope) which shows unlocked features.

### 8.3 NFC Tap-to-Open (Highly Desired)
- NFC tag stores URL: `/tap/entry`
- If PWA installed and URL in scope, it opens in PWA; otherwise in Safari.
- Backend requires auth; if not logged in, redirects to login, then completes.
- Backend creates check-in event, calls HA webhook, redirects to PWA status.

### 8.4 Check-out
- PWA “Check Out” button
- Optional QR `/tap/exit`
- Backend sets OUT and hits `staffweek_checkout` HA webhook.

---

## 9) Backend ↔ HA Communication Contract

### Use HA Webhook Automations
Backend triggers HA using HTTP POST to HA webhook URL.

**Webhook IDs**
- `staffweek_checkin`
- `staffweek_checkout`
- `staffweek_welcome` (optional direct trigger)
- `staffweek_vote` (stub)
- `staffweek_preferences` (stub)

### JSON Envelope (Standard)
```json
{
  "event_id": "uuid",
  "ts": "ISO-8601",
  "type": "checkin|checkout|welcome|vote|pref_update",
  "source": "qr|nfc|manual|ble|system",
  "user": { "id": "u123", "name": "Chad", "email": "c@org.org" },
  "room_id": "entry|open_office|conf|kitchen|...",
  "beacon": { "uuid": "...", "major": 1, "minor": 42 },
  "meta": { "kiosk_id": "entry1", "door_token": "abcd" }
}