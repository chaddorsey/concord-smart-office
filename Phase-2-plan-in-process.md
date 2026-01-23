# Concord Smart Office - Feature Implementation Plan

## Overview

This plan covers four high-level feature sets for the Concord Smart Office system:

1. **Dashboard with Map and BLE Presence Display**
2. **Google OAuth Integration**
3. **In-App Notification Framework**
4. **BLE-Based Entrance Sensing with Auto Check-In**

---

## Feature 1: Dashboard with Map and BLE Presence Display

### Current State
- Dashboard overview with cards (Who's In, Now Playing, Sand Table, Cafe Screens) - COMPLETE
- Backend map service exists with room definitions (`mapService.js`) - PARTIAL
- Backend API endpoints exist (`/api/map/rooms`, `/api/map/people`) - COMPLETE
- **PWA map component** - MISSING
- **Location/room tracking context** - MISSING
- **Database beacon location tables** - MISSING

### User Decisions
- **Floor plan**: User will provide floor plan image to trace/convert to SVG
- **Tracking level**: Room-level tracking (shows which room each person is in)

### Implementation Plan

#### Phase 1: Floor Plan Asset
- User provides floor plan image
- Convert to interactive SVG with room regions
- Store in `pwa/src/assets/office-floorplan.svg`

#### Phase 2: Database Schema
**File**: `backend/db.js`
- Add `rooms` table (id, name, svg_path_id, floor, capacity)
- Add `beacon_locations` table (beacon_id, room_id, rssi, last_seen)
- Seed room data matching SVG region IDs

#### Phase 3: Backend Enhancements
**File**: `backend/services/mapService.js`
- Migrate from hardcoded rooms to database
- Add real-time position calculation based on beacon RSSI
- Add SSE events for location updates

**File**: `backend/server.js`
- Enhance `/api/map/people` to include room assignments
- Add `/api/map/stream` SSE endpoint for real-time updates

#### Phase 4: PWA Map Component
**New File**: `pwa/src/stores/MapContext.tsx`
- Location state management
- SSE connection for real-time updates
- Room occupancy tracking

**New File**: `pwa/src/components/OfficeMap.tsx`
- Load floor plan SVG as React component
- Highlight rooms on hover/tap
- Show staff avatars positioned by room
- Real-time position updates via SSE
- Room detail popup on click

**File**: `pwa/src/views/Dashboard.tsx`
- Add compact map widget to dashboard
- Link to full map view

**New File**: `pwa/src/views/MapView.tsx`
- Full-screen interactive map
- Room occupancy sidebar
- Staff list grouped by room
- Filter/search functionality

### Dependencies
- Requires BLE beacon infrastructure (Feature 4) for room detection
- Can show check-in status (in/out) before BLE room tracking is complete

### Estimated Effort: HIGH (12-16 hours)

---

## Feature 2: Google OAuth Integration

### Current State
- Backend OAuth fully implemented - COMPLETE
- PWA login UI exists - COMPLETE
- Session management works - COMPLETE
- **Environment variables not configured** - NEEDS SETUP

### Implementation Plan

#### Phase 1: Google Cloud Console Setup
- Create OAuth 2.0 credentials in Google Cloud Console
- Configure authorized JavaScript origins
- Configure authorized redirect URIs
- Enable Google+ API (for profile access)

#### Phase 2: Environment Configuration
**File**: `docker/.env`
```
GOOGLE_CLIENT_ID=<from-console>
GOOGLE_CLIENT_SECRET=<from-console>
GOOGLE_ALLOWED_DOMAIN=concord.org
AUTH_CALLBACK_URL=http://concordhq.local/api/auth/google/callback
```

#### Phase 3: Testing
- Test OAuth flow end-to-end
- Verify domain restriction works
- Test session persistence
- Test logout flow

#### Phase 4: Production Hardening (Optional)
- Configure HTTPS for secure cookies
- Consider Redis for OAuth state store (multi-instance)
- Add user role enforcement

### Dependencies
- Google Cloud Console access
- Domain verification (if required)

### Estimated Effort: LOW (1-2 hours for setup, already implemented)

---

## Feature 3: In-App Notification Framework (with Web Push)

### Current State
- SSE endpoint exists (`/api/events`) - COMPLETE
- Event broadcasting works (checkin, checkout events) - COMPLETE
- Service worker configured for PWA - COMPLETE
- **Notifications database table** - MISSING
- **Notification API endpoints** - MISSING
- **PWA NotificationContext** - MISSING
- **Toast UI component** - MISSING
- **Web Push integration** - MISSING

### User Decisions
- **Include Web Push**: Yes - implement background notifications from the start

### Implementation Plan

#### Phase 1: Database Schema
**File**: `backend/db.js`
```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,           -- NULL for group notifications
  group_type TEXT,           -- 'checked_in', 'all_staff', NULL for individual
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',  -- 'info', 'success', 'warning', 'error'
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

#### Phase 2: Web Push Setup
**File**: `docker/.env`
- Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
- Generate with: `npx web-push generate-vapid-keys`

**File**: `backend/package.json`
- Add `web-push` dependency

#### Phase 3: Backend Service
**New File**: `backend/services/notificationService.js`
- `createNotification(userId, title, message, type, actionUrl)`
- `createGroupNotification(groupType, title, message, type)`
- `getUnreadNotifications(userId)`
- `markAsRead(notificationId)`
- `sendPushNotification(userId, title, body, data)`
- `sendGroupPush(groupType, title, body, data)`
- `saveSubscription(userId, subscription)`
- `removeSubscription(endpoint)`

**File**: `backend/server.js`
- `POST /api/notifications` - Create notification (admin)
- `GET /api/notifications` - List user's unread notifications
- `PATCH /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/broadcast` - Send to checked-in group
- `POST /api/push/subscribe` - Save push subscription
- `DELETE /api/push/unsubscribe` - Remove subscription
- `GET /api/push/vapid-public-key` - Return public key for PWA

#### Phase 4: SSE Enhancement
**File**: `backend/server.js`
- Add `notification` event type to SSE
- Filter notifications by recipient (individual vs group)
- Track which users are connected via SSE
- Send push notification if user not connected to SSE

#### Phase 5: PWA Service Worker
**File**: `pwa/src/sw.ts` (or update vite PWA config)
- Add push event listener
- Show native notification on push
- Handle notification click (open app to action_url)

#### Phase 6: PWA Context
**New File**: `pwa/src/stores/NotificationContext.tsx`
- EventSource connection to `/api/events`
- Notification state (unread list, count)
- Auto-reconnect on disconnect
- `showNotification()` for local toast
- `markAsRead()` action
- `requestPushPermission()` - asks user, subscribes if granted
- `isPushEnabled` state

#### Phase 7: Toast Component
**New File**: `pwa/src/components/NotificationToast.tsx`
- Animated slide-in from top/bottom
- Auto-dismiss (configurable, default 5s)
- Stack multiple notifications
- Variants: info, success, warning, error
- Optional action button
- Dismiss on click/swipe

**File**: `pwa/src/App.tsx`
- Wrap with NotificationProvider
- Render NotificationToast at root level
- Prompt for push permission after first check-in

### Use Cases
1. Welcome notification on BLE check-in
2. Music voting results announced
3. Pattern submission approved
4. Admin announcements to checked-in staff
5. System alerts (HA disconnected, etc.)
6. **Background push when app closed** (e.g., "Meeting starting in 5 min")

### Dependencies
- None (can be built independently)

### Estimated Effort: MEDIUM-HIGH (8-10 hours) - increased for Web Push

---

## Feature 4: BLE-Based Entrance Sensing with Auto Check-In

### Current State
- ESPHome BLE proxy configured (single tag) - PARTIAL
- HA Bluetooth Proxy enabled - COMPLETE
- Backend BLE API routes exist but orphaned - PARTIAL
- Presence service supports 'ble' source - COMPLETE
- **Database beacon tables** - MISSING
- **Auto check-in trigger** - MISSING
- **Welcome screen** - MISSING
- **Multi-beacon support** - MISSING
- **Room-level tracking** - MISSING

### User Decisions
- **Tracking level**: Room-level (track which room each person is in)
- **Auto check-out**: Decide later (implement check-in first, add check-out as enhancement)

### Implementation Plan

#### Phase 1: Database Schema
**File**: `backend/db.js`
```sql
CREATE TABLE beacons (
  id INTEGER PRIMARY KEY,
  mac_address TEXT UNIQUE,
  beacon_uuid TEXT,
  major INTEGER,
  minor INTEGER,
  friendly_name TEXT,
  claimed_by_user_id INTEGER,
  last_room_id INTEGER,
  last_proxy_id TEXT,
  last_rssi INTEGER,
  last_seen_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (claimed_by_user_id) REFERENCES users(id)
);

CREATE TABLE beacon_sightings (
  id INTEGER PRIMARY KEY,
  beacon_id INTEGER NOT NULL,
  proxy_id TEXT NOT NULL,
  room_id INTEGER,
  rssi INTEGER,
  seen_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (beacon_id) REFERENCES beacons(id)
);

CREATE TABLE ble_proxies (
  id TEXT PRIMARY KEY,        -- ESPHome device name
  friendly_name TEXT,
  room_id INTEGER,            -- Which room this proxy covers
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### Phase 2: Backend Beacon Service
**New File**: `backend/services/beaconService.js`
- `registerBeacon(macAddress, friendlyName)`
- `claimBeacon(beaconId, userId)`
- `unclaimBeacon(beaconId)`
- `recordSighting(macAddress, proxyId, rssi)` - records sighting, determines room
- `processEntranceDetection(beaconId)` - triggers auto check-in on first detection
- `updateUserRoom(userId, roomId)` - updates presence with current room
- `getBeaconByUser(userId)`
- `getUserCurrentRoom(userId)`

**File**: `backend/server.js`
- Implement existing orphaned BLE routes with new service
- Add `/api/ble/sighting` webhook for HA (room tracking)
- Add `/api/ble/entrance-detected` webhook for HA (check-in trigger)

#### Phase 3: ESPHome Multi-Beacon & Room Support
**File**: `esphome/ble-proxy-office.yaml`
- Configure bluetooth_proxy to forward all advertisements to HA
- Add on_ble_advertise trigger to call backend webhook with RSSI

**Alternative**: Use Bermuda integration in HA for triangulation
- Bermuda calculates room based on multiple proxy RSSIs
- Sends room updates to backend

#### Phase 4: Home Assistant Automation
**New File**: `homeassistant/packages/ble_presence.yaml`
```yaml
# Register BLE proxies with their room assignments
rest_command:
  ble_sighting:
    url: "http://backend:3001/api/ble/sighting"
    method: POST
    content_type: "application/json"
    payload: '{"mac_address": "{{ mac }}", "proxy_id": "{{ proxy }}", "rssi": {{ rssi }}}'

automation:
  - alias: "BLE Room Update"
    trigger:
      - platform: event
        event_type: esphome.ble_tracking
    action:
      - service: rest_command.ble_sighting
        data:
          mac: "{{ trigger.event.data.mac }}"
          proxy: "{{ trigger.event.data.source }}"
          rssi: "{{ trigger.event.data.rssi }}"
```

#### Phase 5: Auto Check-In Logic
**File**: `backend/services/beaconService.js`
- On first sighting of a claimed beacon:
  1. Look up beacon by MAC
  2. Find claimed user
  3. Check if already checked in today
  4. If not, call `presenceService.checkIn(userId, 'ble', roomId)`
  5. Send welcome notification via notificationService
- On subsequent sightings:
  1. Update user's current room in presence_state
  2. Broadcast room change via SSE

#### Phase 6: Welcome Screen
**New File**: `pwa/src/views/WelcomeScreen.tsx`
- Full-screen greeting display
- Shows user name and avatar
- Animated entrance effect
- Auto-dismiss after 5 seconds
- Triggered by SSE `ble_checkin` event

**File**: `pwa/src/App.tsx`
- Add route for `/welcome`
- Or: Modal overlay triggered by notification

#### Phase 7: Beacon Management UI
**New File**: `pwa/src/views/BeaconSettings.tsx`
- List available (unclaimed) beacons
- Claim/unclaim beacon for current user
- Show beacon status (last seen, signal strength, current room)
- Admin: register new beacons, assign proxies to rooms

### Flow Summary
```
BLE Tag broadcasts → ESP32 detects → HA receives →
HA automation calls /api/ble/sighting →
beaconService.recordSighting() →
  - If first sighting today: presenceService.checkIn(userId, 'ble')
  - Update user's room_id in presence_state
  - Broadcast SSE event
→ PWA/Kiosk receives event →
  - Welcome screen (if new check-in)
  - Map updates (room position)
```

### Future Enhancement: Auto Check-Out
(Deferred - implement after check-in is working)
- Track time since last sighting
- If beacon not seen for X minutes, trigger check-out
- Consider: what if someone leaves beacon at desk?

### Dependencies
- Notification framework (Feature 3) for welcome notification
- Physical BLE tags for testing
- Multiple ESP32 proxies for room-level accuracy (optional: can start with 1)

### Estimated Effort: HIGH (12-16 hours) - increased for room tracking

---

## Implementation Order Recommendation

1. **Google OAuth** (1-2 hrs) - Just configuration, already built
2. **Notification Framework** (6-8 hrs) - Foundation for other features
3. **BLE Entrance Sensing** (10-14 hrs) - Uses notifications
4. **Dashboard Map** (12-16 hrs) - Uses BLE location data

Total estimated effort: 29-40 hours

---

## Verification Plan

### Google OAuth
- [ ] OAuth flow completes successfully
- [ ] Non-concord.org emails are rejected
- [ ] Session persists across page refreshes
- [ ] Logout clears session

### Notification Framework
- [ ] Toast appears on manual trigger
- [ ] SSE delivers notifications in real-time
- [ ] Group notifications reach all checked-in users
- [ ] Notifications persist in database
- [ ] Mark as read works

### BLE Entrance Sensing
- [ ] Beacon sighting recorded in database
- [ ] Auto check-in triggers on entrance detection
- [ ] Welcome screen displays
- [ ] User can claim/unclaim beacon
- [ ] Multiple beacons work simultaneously

### Dashboard Map
- [ ] Map renders office floor plan
- [ ] Staff avatars appear in correct rooms
- [ ] Real-time updates when people move
- [ ] Room occupancy counts accurate

---

## Questions for User

1. For the map: Do you have an office floor plan image/SVG, or should we create a schematic representation?
2. For notifications: Should we implement Web Push (background notifications when app closed)?
3. For BLE: How many entrance zones? Just main entrance, or multiple?
4. For BLE: What's the desired behavior when someone leaves (auto check-out)?
