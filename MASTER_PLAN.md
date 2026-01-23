# Concord Smart Office - Master Implementation Plan

## Current State Summary

### Recently Completed (Production)
- **Oasis Pattern Scheduler** - Continuous pattern playback with polling, pause/resume/skip
- **Midnight Auto-Checkout** - Cron job + in-process scheduler for daily reset
- **Quick Check-In (PWA)** - Remembers last user for fast repeat check-ins
- **ESPHome BLE Proxy** - Single tag tracking configured (ble-proxy-office.yaml)
- **Welcome Kiosk Screen** - 1080p display with responsive 3-column layout
- **Improved Queue Sorting** - Net votes-based priority with FIFO tiebreaker
- **Volume Immediate Update** - Sonos volume responds instantly to user changes
- **Session on Manual Check-in** - Creates auth session automatically

### Backend Infrastructure Ready
- Express server with SSE event broadcasting
- SQLite database with users, presence, voting tables
- Google OAuth backend (needs environment config)
- Presence service with check-in/out, webhook integration
- Map service (placeholder room definitions)

### PWA Infrastructure Ready
- React app with routing, Tailwind CSS, Museo fonts
- Auth, Presence, Music, Oasis contexts
- Dashboard, Music, SandTable, PhotoFrames views
- Service worker configured for PWA

### Assets Available
- Floor plan SVGs at:
  - `/kiosk/Office-layout-map-labels.svg` (with room labels)
  - `/kiosk/Office-layout-map-no-labels.svg` (clean version for dashboard)

---

## Parallel Workstreams

The following workstreams can be executed independently by separate agents. Dependencies between workstreams are noted.

---

## Workstream A: Google OAuth Configuration (with Calendar Access)
**Effort**: LOW (1-2 hours)
**Dependencies**: None - User creates project, agent walks through
**Agent Skills**: DevOps, Google Cloud Console guidance

### Overview
User will create the Google Cloud Console project. Agent provides step-by-step guidance to configure OAuth with calendar read/write access.

### Tasks
1. **A1**: Guide user through Google Cloud Console project creation
2. **A2**: Guide OAuth 2.0 credential setup:
   - Create OAuth consent screen
   - Add scopes: `email`, `profile`, `calendar` (read), `calendar.events` (read/write)
   - Create OAuth 2.0 Client ID (Web application)
   - Configure authorized JavaScript origins: `http://concordhq.local`, `https://concordhq.local`
   - Configure authorized redirect URIs: `http://concordhq.local/api/auth/google/callback`
3. **A3**: Guide user to retrieve Client ID and Client Secret
4. **A4**: Update environment variables in docker/.env:
   ```
   GOOGLE_CLIENT_ID=<from-console>
   GOOGLE_CLIENT_SECRET=<from-console>
   GOOGLE_ALLOWED_DOMAIN=concord.org
   AUTH_CALLBACK_URL=http://concordhq.local/api/auth/google/callback
   ```
5. **A5**: Update backend authService.js to request calendar scopes
6. **A6**: Test OAuth flow end-to-end
7. **A7**: Verify domain restriction (non-concord.org emails rejected)

### Verification
- [ ] OAuth login completes successfully
- [ ] Calendar scopes granted
- [ ] Session persists across refreshes
- [ ] Logout clears session
- [ ] Non-concord.org emails rejected

---

## Workstream B: Database Schema Extensions (User Preferences & Attributions)
**Effort**: MEDIUM-HIGH (4-6 hours)
**Dependencies**: None
**Agent Skills**: SQLite, Backend Node.js

### Overview
Extend database to track individual user preferences, favorites, and attributions for all content types.

### Tasks

#### B1: Rooms Table
```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,      -- 'cafe', 'museum', 'shop', 'bubble', 'aviary', 'wonder', 'workstations'
  name TEXT NOT NULL,
  svg_path_id TEXT,
  floor INTEGER DEFAULT 1,
  capacity INTEGER,
  display_order INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### B2: BLE Tables
```sql
CREATE TABLE beacons (
  id INTEGER PRIMARY KEY,
  mac_address TEXT UNIQUE,
  beacon_uuid TEXT,
  major INTEGER,
  minor INTEGER,
  friendly_name TEXT,
  claimed_by_user_id INTEGER,
  last_room_id TEXT,
  last_proxy_id TEXT,
  last_rssi INTEGER,
  last_seen_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (claimed_by_user_id) REFERENCES users(id),
  FOREIGN KEY (last_room_id) REFERENCES rooms(id)
);

CREATE TABLE beacon_sightings (
  id INTEGER PRIMARY KEY,
  beacon_id INTEGER NOT NULL,
  proxy_id TEXT NOT NULL,
  room_id TEXT,
  rssi INTEGER,
  seen_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (beacon_id) REFERENCES beacons(id)
);

CREATE TABLE ble_proxies (
  id TEXT PRIMARY KEY,
  friendly_name TEXT,
  room_id TEXT,
  zone_type TEXT,           -- 'room', 'entrance_outside', 'entrance_inside'
  rssi_threshold INTEGER,   -- Configurable proximity threshold
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### B3: Oasis Design Favorites (User-specific)
```sql
CREATE TABLE user_oasis_favorites (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  pattern_id TEXT NOT NULL,
  pattern_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, pattern_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### B4: Music Track Preferences (Thumbs up/down)
```sql
CREATE TABLE user_track_votes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  track_uri TEXT NOT NULL,
  track_name TEXT,
  artist_name TEXT,
  vote INTEGER NOT NULL,     -- 1 = thumbs up, -1 = thumbs down
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, track_uri),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### B5: User-Added Spotify Tracks
```sql
CREATE TABLE user_added_tracks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  track_uri TEXT NOT NULL,
  track_name TEXT,
  artist_name TEXT,
  taste_id INTEGER,          -- Optional: which taste/playlist added to
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### B6: Music Vibe Preferences & Overrides
```sql
CREATE TABLE user_music_preferences (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  preferred_taste_id INTEGER,
  volume_override REAL,      -- NULL = use computed, otherwise specific level
  playback_enabled INTEGER DEFAULT 1,  -- Future: individual playback control
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### B7: Color Preferences (Future Feature)
```sql
CREATE TABLE user_color_preferences (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  led_color TEXT,            -- Hex color for Oasis LEDs
  ambient_color TEXT,        -- Hex color for room ambient
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### B8: Photo/Video Preferences (Thumbs up/down/deleted)
```sql
CREATE TABLE user_media_votes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT,           -- 'image', 'video'
  vote INTEGER NOT NULL,     -- 1 = thumbs up, -1 = thumbs down, -2 = deleted/hidden
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, media_url),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### B9: Sand Pattern Attribution
```sql
-- Modify existing oasis_submissions table to ensure attribution
ALTER TABLE oasis_submissions ADD COLUMN creator_user_id INTEGER REFERENCES users(id);
ALTER TABLE oasis_submissions ADD COLUMN submission_source TEXT DEFAULT 'queue';  -- 'queue', 'created', 'imported'
```

#### B10: Notifications & Push
```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  group_type TEXT,           -- 'checked_in', 'all_staff', NULL for individual
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  action_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  read_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### B11: Seed Initial Room Data
```javascript
const ROOMS = [
  { id: 'cafe', name: 'The Café', display_order: 1 },
  { id: 'museum', name: 'The Museum', display_order: 2 },
  { id: 'shop', name: 'The Shop', display_order: 3 },
  { id: 'bubble', name: 'The Bubble Room', display_order: 4 },
  { id: 'aviary', name: 'The Aviary', display_order: 5 },
  { id: 'wonder', name: 'The Wonder Room', display_order: 6 },
  { id: 'workstations', name: 'Work Stations', display_order: 7 }
];
```

#### B12: Add CRUD Functions for All New Tables

### Verification
- [ ] All tables created on startup
- [ ] Room seed data populated
- [ ] User preferences CRUD works
- [ ] Attribution shows in queue listings

---

## Workstream C: BLE Beacon Service (with Entrance Detection)
**Effort**: HIGH (8-10 hours)
**Dependencies**: B (Database Schema)
**Agent Skills**: Backend Node.js, BLE concepts, State machines

### Overview
Implement entrance detection with "outside → door open → inside" sequence detection and adjustable proximity profiles.

### Tasks

#### C1: Create Entrance Detection Configuration
```javascript
// backend/config/entranceDetection.js
const ENTRANCE_PROFILES = {
  default: {
    outside_rssi_threshold: -75,   // Weak signal = outside
    inside_rssi_threshold: -55,    // Strong signal = inside
    door_open_duration_ms: 5000,   // Max time for transition
    confirmation_readings: 3,      // Readings needed to confirm state
    debounce_ms: 1000              // Debounce rapid changes
  },
  sensitive: {
    outside_rssi_threshold: -80,
    inside_rssi_threshold: -50,
    door_open_duration_ms: 7000,
    confirmation_readings: 2,
    debounce_ms: 500
  }
};
```

#### C2: Create `backend/services/beaconService.js`
- `registerBeacon(macAddress, friendlyName)`
- `claimBeacon(beaconId, userId)`
- `unclaimBeacon(beaconId)`
- `getBeaconByUser(userId)`
- `getBeaconByMac(macAddress)` - for QR code claiming
- `getUnclaimedBeacons()`
- `recordSighting(macAddress, proxyId, rssi)`
- `determineRoom(beaconId)` - calculate room from RSSI
- `getEntranceState(beaconId)` - returns 'outside', 'transitioning', 'inside'

#### C3: Implement Entrance State Machine
```javascript
// States: OUTSIDE -> TRANSITIONING -> INSIDE
// TRANSITIONING requires signal strengthening within door_open_duration_ms
class EntranceStateMachine {
  constructor(beaconId, profile) { ... }
  processSighting(rssi, proxyId) {
    // Track RSSI history
    // Detect outside -> inside transition
    // Trigger check-in when confirmed inside
  }
}
```

#### C4: Add Beacon API Routes
- `GET /api/beacons` - List all beacons (admin)
- `GET /api/beacons/available` - List unclaimed beacons
- `GET /api/beacons/mine` - Current user's beacon
- `POST /api/beacons/claim` - Claim by ID
- `POST /api/beacons/claim-by-mac` - Claim by MAC address (from QR scan)
- `POST /api/beacons/unclaim` - Release beacon
- `DELETE /api/beacons/mine` - Remove/dissociate beacon
- `POST /api/beacons/register` - Admin: register new beacon
- `POST /api/ble/sighting` - Webhook for HA
- `GET /api/ble/entrance-profiles` - Get available profiles
- `PUT /api/ble/entrance-profiles/:beaconId` - Set profile for beacon

#### C5: Implement Auto Check-in Logic
- On confirmed inside state → check in user
- Update user's room_id in presence_state
- Broadcast SSE event for real-time updates
- Send welcome notification

#### C6: Add Beacon Position to Presence API
- `/api/presence` includes room_id from BLE tracking
- `/api/map/people` includes position confidence

### Verification
- [ ] Beacon registration works
- [ ] Claim by MAC address (QR scan) works
- [ ] Delete/remove beacon association works
- [ ] Entrance state machine detects transitions
- [ ] Adjustable profiles work
- [ ] Auto check-in triggers correctly

---

## Workstream D: Notification Service (with Group Messaging)
**Effort**: MEDIUM-HIGH (6-8 hours)
**Dependencies**: B (Database Schema)
**Agent Skills**: Backend Node.js, Web Push

### Overview
Implement notification system with quick messages and user selection UI.

### Tasks

#### D1: Generate VAPID Keys
```bash
npx web-push generate-vapid-keys
```

#### D2: Create `backend/services/notificationService.js`
- `createNotification(userId, title, message, type, actionUrl)`
- `createGroupNotification(groupType, title, message, type)`
- `getUnreadNotifications(userId)`
- `markAsRead(notificationId)`
- `sendPushNotification(userId, title, body, data)`
- `sendGroupPush(groupType, title, body, data)`
- `saveSubscription(userId, subscription)`
- `removeSubscription(endpoint)`
- `getCheckedInUsers()` - for recipient selection

#### D3: Add Quick Message Templates
```javascript
const QUICK_MESSAGES = [
  { id: 'coffee', title: '☕ Coffee Run', message: "Going for coffee – join me?" },
  { id: 'lunch', title: '🍽️ Lunch', message: "Having lunch in the cafe now..." },
  { id: 'icecream', title: '🍦 Ice Cream', message: "Anyone wanna go get ice cream??" }
];
```

#### D4: Add Notification API Routes
- `POST /api/notifications` - Create notification with recipient options:
  ```json
  {
    "title": "...",
    "message": "...",
    "sendToAll": true,           // Default checked
    "excludeUserIds": [1, 2],    // Optional: uncheck specific users
    "quickMessageId": "coffee"   // Optional: use template
  }
  ```
- `GET /api/notifications` - List user's unread
- `GET /api/notifications/quick-messages` - Get templates
- `PATCH /api/notifications/:id/read` - Mark as read
- `GET /api/notifications/recipients` - Get checked-in users for selection
- `POST /api/push/subscribe` - Save push subscription
- `DELETE /api/push/unsubscribe` - Remove subscription
- `GET /api/push/vapid-public-key` - Return public key

#### D5: Add `notification` Event Type to SSE

#### D6: Smart Push Delivery
- Track connected SSE users
- Send push if user not connected to SSE

### Verification
- [ ] Notification created and stored
- [ ] Quick message templates work
- [ ] Send to all (default) works
- [ ] Exclude specific users works
- [ ] SSE delivers notification in real-time
- [ ] Push notification when app closed

---

## Workstream E: Office Map SVG Processing
**Effort**: LOW-MEDIUM (2-3 hours)
**Dependencies**: None
**Agent Skills**: SVG manipulation

### Overview
Process provided floor plan SVGs for dashboard display.

### Rooms to Track
- `cafe` - The Café
- `museum` - The Museum
- `shop` - The Shop
- `bubble` - The Bubble Room
- `aviary` - The Aviary
- `wonder` - The Wonder Room
- `workstations` - Work Stations

### Tasks
1. **E1**: Copy no-labels SVG to `backend/public/office-map.svg`
2. **E2**: If needed, add room region IDs to SVG paths
3. **E3**: Create room coordinate mapping for avatar placement
4. **E4**: Test SVG loads correctly in dashboard

### Verification
- [ ] SVG renders in dashboard
- [ ] Room regions identifiable

---

## Workstream F: PWA Map Components
**DEFERRED** - Focus on dashboard first per user request

---

## Workstream G: PWA Notification Components
**Effort**: MEDIUM (4-6 hours)
**Dependencies**: D (Notification Service)
**Agent Skills**: React, TypeScript, Service Worker

### Tasks
1. **G1**: Create `pwa/src/stores/NotificationContext.tsx`
2. **G2**: Create `pwa/src/components/NotificationToast.tsx`
3. **G3**: Create notification compose UI with:
   - Message input
   - Quick message buttons (coffee, lunch, ice cream)
   - Default-checked "Send to all" checkbox
   - Checklist of checked-in users to exclude
4. **G4**: Update service worker for push events
5. **G5**: Update `pwa/src/App.tsx` with providers

### Verification
- [ ] Toast appears on notification
- [ ] Quick messages work
- [ ] Recipient selection works
- [ ] Push when app closed

---

## Workstream H: BLE PWA Components (with QR Claiming)
**Effort**: MEDIUM (4-6 hours)
**Dependencies**: C (Beacon Service)
**Agent Skills**: React, TypeScript, Camera/QR

### Tasks
1. **H1**: Create `pwa/src/views/BeaconSettings.tsx`:
   - Show current beacon status (if claimed)
   - QR code scanner to read MAC address from beacon tag
   - Claim beacon by scanned MAC
   - Delete/remove beacon association button
   - List available unclaimed beacons

2. **H2**: Create `pwa/src/components/BeaconStatus.tsx`:
   - Small status indicator
   - Show signal strength
   - Show last detected room

3. **H3**: Add QR scanner component:
   - Use camera to scan beacon QR code
   - Extract MAC address from QR data
   - Call `/api/beacons/claim-by-mac`

4. **H4**: Create welcome modal on BLE check-in

### Verification
- [ ] QR scan identifies MAC address
- [ ] Claim by QR scan works
- [ ] Delete/remove beacon works
- [ ] Status shows correctly
- [ ] Welcome displays on BLE check-in

---

## Workstream I: Dashboard Map with BLE Presence Display
**Effort**: HIGH (8-10 hours)
**Dependencies**: B (Database), C (Beacon Service), E (SVG)
**Agent Skills**: HTML, JavaScript, CSS, SVG

### Overview
Display office map on kiosk dashboard with silhouette indicators for staff positions.

### Visual Design
- **Present (tracked)**: Orange bust silhouette with name overlay
- **Present (untracked)**: Gray bust silhouette with name overlay
- **Fading presence**: Color gradually fades from orange → gray as BLE signal drops and certainty decreases

### Tasks

#### I1: Update `backend/public/dashboard.html` Map Section
- Load office-map.svg
- Create SVG overlay layer for people markers

#### I2: Create Silhouette Marker Component
```javascript
function createPersonMarker(person) {
  const certainty = person.signal_certainty || 0; // 0-1
  const isTracked = person.room_id !== null;

  // Orange (#F3B100) for tracked, Gray (#888) for untracked
  // Interpolate based on certainty
  const color = isTracked
    ? interpolateColor('#F3B100', '#888888', 1 - certainty)
    : '#888888';

  return `
    <g class="person-marker" transform="translate(${x}, ${y})">
      <path d="..." fill="${color}" /> <!-- Bust silhouette SVG path -->
      <text>${person.first_name}</text>
    </g>
  `;
}
```

#### I3: Implement Signal Certainty Calculation
```javascript
// In presenceService or mapService
function calculateSignalCertainty(lastSeenAt, lastRssi) {
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  const ageFactor = Math.max(0, 1 - (ageMs / MAX_ABSENCE_MS));
  const rssiFactor = Math.max(0, (lastRssi + 90) / 40); // -90 to -50 -> 0 to 1
  return ageFactor * rssiFactor;
}
```

#### I4: Add API Endpoint for Map Data
```javascript
// GET /api/map/people
// Returns:
{
  people: [
    {
      user_id: 1,
      first_name: "Chad",
      room_id: "cafe",        // null if untracked
      position: { x: 45, y: 32 },
      signal_certainty: 0.85, // 0-1, affects color fade
      is_tracked: true
    }
  ]
}
```

#### I5: Real-time Updates via SSE
- Subscribe to presence and BLE events
- Update marker positions and certainty in real-time
- Smooth animation for position changes

#### I6: Room Position Mapping
```javascript
const ROOM_POSITIONS = {
  cafe: { x: 150, y: 100 },
  museum: { x: 350, y: 100 },
  shop: { x: 550, y: 100 },
  // ... etc
};
```

### Verification
- [ ] Map displays floor plan
- [ ] Orange silhouettes for tracked present
- [ ] Gray silhouettes for untracked present
- [ ] Color fades as signal certainty drops
- [ ] Names display correctly
- [ ] Real-time updates work

---

## Workstream J: Home Assistant BLE Integration
**Effort**: MEDIUM (4-6 hours)
**Dependencies**: C (Beacon Service)
**Agent Skills**: Home Assistant, YAML, ESPHome

### Tasks
1. **J1**: Configure additional ESPHome proxies for rooms
2. **J2**: Create `homeassistant/packages/ble_presence.yaml`
3. **J3**: Configure entrance proxies (inside/outside sensors)
4. **J4**: Test beacon → HA → backend flow

### Verification
- [ ] ESP32 proxies connect to HA
- [ ] Sightings flow to backend
- [ ] Entrance detection works

---

## Implementation Order (Suggested)

### Phase 1 (Can Start Immediately - Parallel)
- **Workstream A**: Google OAuth Configuration (user-guided)
- **Workstream B**: Database Schema Extensions
- **Workstream E**: Office Map SVG Processing

### Phase 2 (After B Completes - Parallel)
- **Workstream C**: BLE Beacon Service
- **Workstream D**: Notification Service

### Phase 3 (After C, D, E Complete - Parallel)
- **Workstream G**: PWA Notification Components
- **Workstream H**: BLE PWA Components (with QR claiming)
- **Workstream I**: Dashboard Map with BLE Presence
- **Workstream J**: Home Assistant BLE Integration

### Phase 4 (Integration & Testing)
- End-to-end testing
- Entrance detection calibration
- Bug fixes

---

## Estimated Total Effort

| Workstream | Effort | Hours |
|------------|--------|-------|
| A: OAuth Config (guided) | LOW | 1-2 |
| B: Database Schema | MEDIUM-HIGH | 4-6 |
| C: BLE Beacon Service | HIGH | 8-10 |
| D: Notification Service | MEDIUM-HIGH | 6-8 |
| E: Office Map SVG | LOW-MEDIUM | 2-3 |
| G: PWA Notification | MEDIUM | 4-6 |
| H: BLE PWA Components | MEDIUM | 4-6 |
| I: Dashboard Map | HIGH | 8-10 |
| J: HA BLE Integration | MEDIUM | 4-6 |

**Total: 41-57 hours** (can be parallelized to ~20-25 hours with multiple agents)

---

## Files to Create/Modify Summary

### New Files
- `backend/config/entranceDetection.js`
- `backend/services/beaconService.js`
- `backend/services/notificationService.js`
- `pwa/src/stores/NotificationContext.tsx`
- `pwa/src/components/NotificationToast.tsx`
- `pwa/src/components/NotificationCompose.tsx`
- `pwa/src/components/BeaconStatus.tsx`
- `pwa/src/views/BeaconSettings.tsx`
- `backend/public/office-map.svg`
- `homeassistant/packages/ble_presence.yaml`

### Modified Files
- `backend/db.js` - Add all new tables, CRUD functions
- `backend/server.js` - Add API routes
- `backend/services/authService.js` - Add calendar scopes
- `backend/services/mapService.js` - Use database rooms, certainty
- `backend/services/presenceService.js` - Add BLE tracking
- `backend/public/dashboard.html` - Map with silhouettes
- `pwa/src/App.tsx` - Add providers, routes
- `docker/.env` - OAuth and VAPID keys
