# Sand Table (Oasis Mini) Control System

## Overview

Queue-based control system for the Oasis Mini sand table, mirroring the PhotoFrames UX with two parallel queues:
1. **Sand Pattern Queue** - Drawing patterns with voting
2. **LED Pattern Queue** - Lighting effects that rotate on a schedule

## Oasis Mini Integration

### Home Assistant Entities (via HACS oasis_mini)

**Media Player** (`media_player.oasis_mini`):
- `state` - IDLE, PLAYING, PAUSED, etc.
- `media_position` - Current position in seconds
- `media_duration` - Pattern duration in seconds
- `media_title` - Current pattern name
- `media_image_url` - Pattern thumbnail URL
- Services: play_media, media_pause, media_play, media_next_track, browse_media

**Light** (`light.oasis_mini`):
- `brightness` - 0-255
- `rgb_color` - (R, G, B) tuple
- `effect` - Current effect name
- `effect_list` - Available effects (Rainbow, Glitter, Confetti, BPM, Juggle, etc.)
- Services: turn_on (with brightness, rgb_color, effect), turn_off

### Drawing Progress Calculation
```javascript
const progress = (media_position / media_duration) * 100
```

---

## Database Schema

### Pattern Queue Tables

```sql
-- Available patterns (cached from Oasis browse_media)
CREATE TABLE oasis_patterns (
  id TEXT PRIMARY KEY,           -- Pattern ID from Oasis
  name TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  cached_at TEXT DEFAULT (datetime('now'))
);

-- Pattern submissions (queue)
CREATE TABLE oasis_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_id TEXT NOT NULL,
  pattern_name TEXT,
  thumbnail_url TEXT,
  submitted_by_user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'playing', 'played', 'failed')),
  played_at TEXT,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Votes on pattern submissions
CREATE TABLE oasis_votes (
  submission_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  value INTEGER NOT NULL CHECK(value IN (-1, 0, 1)),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (submission_id, user_id),
  FOREIGN KEY (submission_id) REFERENCES oasis_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Favorite patterns (for empty queue fallback)
CREATE TABLE oasis_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_id TEXT NOT NULL UNIQUE,
  pattern_name TEXT,
  thumbnail_url TEXT,
  added_by_user_id INTEGER,
  added_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

### LED Queue Tables

```sql
-- LED pattern submissions
CREATE TABLE oasis_led_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effect_name TEXT NOT NULL,      -- e.g., "Rainbow", "Solid", "Glitter"
  color_hex TEXT,                 -- e.g., "#FF5500" (null for multi-color effects)
  brightness INTEGER DEFAULT 128, -- 0-255
  submitted_by_user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'active', 'played')),
  activated_at TEXT,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Votes on LED submissions
CREATE TABLE oasis_led_votes (
  submission_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  value INTEGER NOT NULL CHECK(value IN (-1, 0, 1)),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (submission_id, user_id),
  FOREIGN KEY (submission_id) REFERENCES oasis_led_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Default LED patterns (for empty queue)
CREATE TABLE oasis_led_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effect_name TEXT NOT NULL,
  color_hex TEXT,
  brightness INTEGER DEFAULT 128,
  added_at TEXT DEFAULT (datetime('now'))
);

-- Scheduler state
CREATE TABLE oasis_scheduler_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_running INTEGER DEFAULT 0,
  current_pattern_submission_id INTEGER,
  current_led_submission_id INTEGER,
  led_change_interval_minutes INTEGER DEFAULT 15,
  last_led_change_at TEXT,
  last_poll_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## Backend Services

### oasisService.js

```javascript
// Pattern queue management
submitPattern(userId, patternId, patternName, thumbnailUrl)
getPatternQueue()
votePattern(userId, submissionId, value)
trashPattern(submissionId)
removeSubmission(userId, submissionId)

// LED queue management
submitLedPattern(userId, effectName, colorHex, brightness)
getLedQueue()
voteLed(userId, submissionId, value)
trashLed(submissionId)

// Playback info
getNowPlaying()        // { pattern, led, drawingProgress }
getDrawingProgress()   // percentage 0-100

// Favorites management
addPatternFavorite(patternId, patternName, thumbnailUrl)
removePatternFavorite(patternId)
getPatternFavorites()
addLedFavorite(effectName, colorHex, brightness)
getLedFavorites()
```

### oasisSchedulerService.js

```javascript
// Polls Oasis state every 5 seconds
// When pattern completes (position >= duration):
//   1. Mark current submission as 'played'
//   2. Get next from queue (by vote-adjusted order) or random favorite
//   3. Call media_player.play_media

// LED rotation (every N minutes, configurable):
//   1. Get next LED from queue or random favorite
//   2. Call light.turn_on with effect/color/brightness
```

---

## API Endpoints

### Pattern Queue
```
GET  /api/oasis/patterns          - List available patterns (from cache/Oasis)
GET  /api/oasis/queue             - Get pattern queue with votes
POST /api/oasis/submit            - Submit pattern to queue
POST /api/oasis/vote              - Vote on submission
POST /api/oasis/submission/:id/trash - Trash submission (rate limited)
DELETE /api/oasis/submission/:id  - Remove own submission
```

### LED Queue
```
GET  /api/oasis/led/effects       - List available LED effects
GET  /api/oasis/led/queue         - Get LED queue with votes
POST /api/oasis/led/submit        - Submit LED pattern
POST /api/oasis/led/vote          - Vote on LED submission
POST /api/oasis/led/:id/trash     - Trash LED submission
```

### Status
```
GET  /api/oasis/now-playing       - Current pattern + LED + progress
GET  /api/oasis/status            - Scheduler status
```

### Favorites
```
GET  /api/oasis/favorites         - Get pattern favorites
POST /api/oasis/favorites         - Add pattern favorite
GET  /api/oasis/led/favorites     - Get LED favorites
POST /api/oasis/led/favorites     - Add LED favorite
```

---

## PWA Components

### OasisContext.tsx

State:
- `patterns` - Available patterns (cached)
- `ledEffects` - Available LED effects
- `patternQueue` - Queued pattern submissions with votes
- `ledQueue` - Queued LED submissions with votes
- `nowPlaying` - Current pattern info
- `currentLed` - Current LED settings
- `drawingProgress` - 0-100 percentage
- `patternFavorites` - Fallback patterns
- `ledFavorites` - Fallback LED settings
- `trashRateLimit` - Rate limit state

Actions:
- `submitPattern(patternId)`
- `submitLed(effect, color, brightness)`
- `votePattern(submissionId, value)`
- `voteLed(submissionId, value)`
- `trashPattern(submissionId)`
- `trashLed(submissionId)`

### SandTable.tsx

UI Structure:
```
┌─────────────────────────────────────┐
│ ← Sand Table                        │
├─────────────────────────────────────┤
│ [Browse Patterns]                   │
├─────────────────────────────────────┤
│ Now Drawing                         │
│ ┌─────────────────────────────────┐ │
│ │ [Thumbnail]   "Spiral Galaxy"   │ │
│ │               ████████░░ 78%    │ │
│ │ 👍 👎 🗑️              [Skip]    │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Pattern Queue (3)                   │
│ ┌───┬────────────────┬─────┬─────┐ │
│ │ 1 │ [img] Zen Gard │ +2  │👍👎🗑│ │
│ │ 2 │ [img] Ocean Wa │ -1  │👍👎🗑│ │
│ │ 3 │ [img] Mandala  │  0  │👍👎🗑│ │
│ └───┴────────────────┴─────┴─────┘ │
├─────────────────────────────────────┤
│ Current Lighting      [Change LED] │
│ ┌─────────────────────────────────┐ │
│ │ 🌈 Rainbow          Brightness: │ │
│ │ by @user            ████░ 60%   │ │
│ │ 👍 👎               next: 12min │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ LED Queue (2)                       │
│ • Glitter #FF5500 +1  👍👎🗑       │
│ • Solid #0066FF    0  👍👎🗑       │
└─────────────────────────────────────┘
```

### PatternBrowser.tsx (new)

Browse and submit patterns from Oasis library:
- Grid of pattern thumbnails with names
- Search/filter
- Tap to preview, tap again to queue
- Shows if already in queue

### LedPicker.tsx (new)

Submit LED patterns:
- Effect dropdown (Rainbow, Glitter, Confetti, etc.)
- Color picker (for solid/applicable effects)
- Brightness slider
- Preview swatch
- Submit button

---

## Voting Algorithm

Same as PhotoFrames/Music:
```javascript
// Effective position = base_position - shift
// shift = max(0, upvotes-1) - max(0, downvotes-1)

// Example: Item at position 3 with 3 upvotes, 1 downvote
// shift = max(0, 3-1) - max(0, 1-1) = 2 - 0 = 2
// effective_position = 3 - 2 = 1 (moves up!)
```

---

## Empty Queue Behavior

When pattern queue is empty:
1. Pick random pattern from `oasis_favorites`
2. If no favorites, use Oasis default playlist

When LED queue is empty:
1. Pick random from `oasis_led_favorites`
2. If no favorites, use Rainbow at 50% brightness

---

## LED Rotation Schedule

- Default: Every 15 minutes
- Configurable via settings
- Timer resets when new LED is manually queued/voted to top
- Shows "next change in X min" in UI

---

## Implementation Order

1. Database schema (add to db.js)
2. oasisService.js (queue management, no HA yet)
3. API routes (add to server.js)
4. OasisContext.tsx (PWA state)
5. SandTable.tsx rewrite
6. PatternBrowser.tsx
7. LedPicker.tsx
8. oasisSchedulerService.js (HA integration)
9. Test with real Oasis device
