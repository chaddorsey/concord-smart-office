# Office Sonos Music Mixer (No Spotify Developer Access) — LLM-Friendly Spec

**Context:** Office Sonos plays a continuously updating mix of tracks drawn from predefined “taste buckets,” weighted by who is present (in Cafe vs in office). Users can also submit Spotify track URLs and up/downvote them; submitted tracks take precedence over taste mixing at track boundaries.  
**Constraint:** **No Spotify developer access** → no Spotify search API, no reading playlists via Spotify API, no programmatic Spotify playlist creation.

---

## 0) Key Concepts & Terminology

### Sound Zones / Proximities
- **Cafe**: where the Sonos plays; BLE-sensed users *in Cafe* control music completely.
- **Office**: broader office presence; used only when **no one is in Cafe**.

### Taste Buckets
- A **taste** is a label like `chill`, `upbeat`, `focus`, `instrumental`, `default`.
- A **bucket** is a set of tracks associated with a taste.

**You chose:** Buckets must be **track URL lists** (Spotify track URLs), because Spotify playlist reading/manipulation via API is unavailable.

### Submitted Queue
- Users submit **Spotify track URLs** into a priority queue.
- Users can **upvote/downvote** submitted items (one vote per user, changeable).
- Submitted tracks take precedence over taste-bucket tracks **but are never started mid-track**.

### Playback Unit
- A “track boundary” is when the current track ends (or becomes idle/stopped).

---

## 1) Sonos Favorites vs “Track URL Buckets”

You asked if **Sonos Favorites** are effectively the same as Option 1.

### What Sonos Favorites are (practically)
- Sonos Favorites are **pointers** saved inside the Sonos ecosystem (e.g., Spotify playlists, albums, stations, etc.).
- They are great for “play this source,” but they are **not a track list you can reliably enumerate** without Spotify APIs.
- Favorites therefore behave like **opaque sources** rather than granular track inventories.

### Comparison

| Capability | Track URL Buckets (Option 1) | Sonos Favorites |
|---|---|---|
| True per-track weighted mixing (50/50 track distribution) | ✅ Yes | ❌ Not reliably (more like “time spent in a favorite”) |
| Deterministic “next track” selection | ✅ Yes | ❌ Limited (you can start a favorite, but not pick track N) |
| Requires Spotify API | ❌ No | ❌ No |
| Easy to curate quickly | ⚠️ Medium (need track URLs) | ✅ Yes |
| Works as fallback/background “radio” | ✅ Yes | ✅ Yes |
| Ideal use in this project | **Primary mixing inventory** | **Fallback modes + easy ‘stations’** |

### Recommendation
- **Use Track URL Buckets as your primary mixing mechanism** (needed to implement your weighted, random-but-stable track selection).
- Use **Sonos Favorites optionally** as:
  - a “failsafe default” if buckets are empty, or
  - a “manual admin mode” if automation breaks, or
  - a “warm-start background” while buckets build up.

---

## 2) Presence-Driven Weighting Rules (Finalized)

### Proximity precedence
1. If **any BLE-sensed user(s) are in Cafe**:
   - Music weights are computed from **Cafe users only**.
   - Cafe users with preferences determine weights.
   - Cafe users without preferences count as **Default** taste votes.
   - **Office users not in Cafe are ignored**.
   - Result: Cafe presence fully tailors the playlist.

2. If **no BLE-sensed users are in Cafe**:
   - Music weights computed from **all in-office users**.
   - In-office users with preferences contribute to their tastes.
   - In-office users without preferences contribute to **Default**.

### Examples
- Two users in office: Chill + Upbeat → `Chill 50%, Upbeat 50%`
- Two more users enter office with no preferences → `Chill 25%, Upbeat 25%, Default 50%`
- If Chill user enters Cafe (and Upbeat remains elsewhere) → `Chill 100%` (Cafe dominates)

---

## 3) Voting Queue Rules (Finalized)

### Submission
- Users submit **Spotify track URLs**.
- If unplayable: remove from queue immediately; log as unplayable in DB/history.

### Voting
- **One vote per user**, but changeable (user can switch up ↔ down ↔ neutral).
- Ordering is analogous to photo frame voting.
- Movement rule: “songs with N downvotes move downward in the list **N-1 spaces**.”
  - Implementation note: easiest is to compute a `rank_offset` from votes and apply stable reordering; see algorithm below.

### Queue precedence
- If submitted queue non-empty:
  - play submitted tracks first (in priority order), **at track boundaries** only.
- Taste-bucket track selection only happens when submitted queue is empty.

### Post-play
- Played submitted tracks disappear from the queue.
- All submissions and votes are stored permanently for future reuse.
- Full play history is logged (track + who was present in Cafe/office during playback).

---

## 4) System Architecture (Recommended)

### Components
1. **PWA**
   - Users manage taste preferences.
   - Users submit Spotify track URLs.
   - Users up/downvote submitted items.
   - Shows “Now Playing” and “Upcoming” list (preview).

2. **Backend (canonical for music logic)**
   - Stores buckets (track URLs).
   - Stores submissions and votes.
   - Maintains the scheduler state (recent history, current mode).
   - Maintains play history with presence snapshots.
   - Decides next track.
   - Commands HA to play next track on Sonos.

3. **Home Assistant**
   - Provides Sonos control via `media_player`.
   - Provides presence inputs (Cafe room + office presence) to backend (or backend already has presence canonical).
   - Optional HA dashboards: now playing, presence summary.

### Control choice (recommended)
- Backend controls scheduling and calls HA to play tracks.
- HA is the device execution layer; backend is the “brain.”

---

## 5) Data Model (Backend)

### Users
- `User { id, email, name, role, created_at }`

### Preferences
- `UserTaste { user_id, taste_id, weight? }`
  - For MVP: one taste per user or multiple tastes split evenly.

### Buckets
- `TasteBucket { taste_id, name, tracks: [TrackRef] }`
- `TrackRef { track_url, added_by_user_id?, added_at, tags?, last_played_at? }`

### Submissions / Votes
- `Submission { id, track_url, submitted_by_user_id, created_at, status: queued|playing|played|failed, fail_reason? }`
- `SubmissionVote { submission_id, user_id, value: -1|0|+1, updated_at }`

### Play History (required)
- `PlayEvent { id, started_at, ended_at, track_url, source: submission|taste, taste_id?, submission_id?, result: success|failed, fail_reason? }`
- `PlayContextSnapshot { play_event_id, cafe_users: [UserPresence], office_users: [UserPresence], weights_json }`
- `UserPresence { user_id, in_office: bool, in_cafe: bool, room_id?, confidence? }`

---

## 6) Music Scheduling Algorithms (LLM-Implementable)

### 6.1 Determine active proximity mode

if any_ble_users_in_cafe():
mode = “CAFE”
listeners = cafe_users()
else:
mode = “OFFICE”
listeners = office_users()

### 6.2 Compute weights from listeners
Rules:
- Each listener contributes 1 vote total.
- If listener has no taste preference → contributes 1 vote to `default`.
- If listener has multiple tastes → split evenly (MVP) or use stored weights.

def compute_weights(listeners):
votes = defaultdict(float)

if not listeners:
    votes["default"] = 1.0
    return normalize(votes)

for u in listeners:
    tastes = get_user_tastes(u.user_id)  # [] or ["chill"] or ["chill","focus"]
    if not tastes:
        votes["default"] += 1.0
    else:
        share = 1.0 / len(tastes)
        for t in tastes:
            votes[t] += share

return normalize(votes)

### 6.3 Submitted queue ordering
You specified movement as “N downvotes moves down N-1 spaces,” and voting mirrors the photo-frame approach.

Simplest implementable interpretation that matches the “move by votes” feel:

- Maintain a baseline order by `created_at`.
- Compute `net = upvotes - downvotes`.
- Convert net into a **relative rank shift**:
  - `shift = -max(0, downvotes - 1) + max(0, upvotes - 1)` (mirrors “N votes moves N-1 places”)
- Apply stable ordering by an “effective rank index.”

Example method:
1. Start with list ordered by created time.
2. For each item, compute `effective_index = base_index - shift`.
3. Sort by `effective_index`, tie-break by `created_at`.

def order_submissions(submissions):
# submissions in created_at ascending baseline
enriched = []
for base_index, s in enumerate(submissions):
ups = count_votes(s.id, +1)
downs = count_votes(s.id, -1)
shift = max(0, ups - 1) - max(0, downs - 1)
effective = base_index - shift
enriched.append((effective, s.created_at, s))

enriched.sort(key=lambda x: (x[0], x[1]))  # stable-ish
return [x[2] for x in enriched]

> Note: If you want “more votes = more movement” beyond this, you can make shift linear in net votes; but the above matches your explicit “N-1 spaces” rule.

### 6.4 Next track selection precedence
At each track boundary:
1. If any queued submissions → play top submission
2. Else → pick next taste track by weighted sampling + smoothing

def choose_next_track():
queued = get_queued_submissions()
if queued:
ordered = order_submissions(queued)
return NextTrack(source=“submission”, submission_id=ordered[0].id, track_url=ordered[0].track_url)

listeners = cafe_users() if any_cafe_users() else office_users()
weights = compute_weights(listeners)
taste_id = choose_taste_with_smoothing(weights)
track_url = choose_track_from_bucket(taste_id)
return NextTrack(source="taste", taste_id=taste_id, track_url=track_url, weights=weights)

### 6.5 Smoothing to avoid oscillation
Maintain:
- `recent_tastes`: last 5 taste_ids played
- `recent_tracks`: last 20 track_urls played

Penalty:
- if taste == last played taste: multiply weight by 0.3
- if taste appears twice in last 3: multiply by 0.5, etc.

def choose_taste_with_smoothing(weights):
adjusted = dict(weights)
last = recent_tastes[-1] if recent_tastes else None
if last and last in adjusted:
adjusted[last] *= 0.3

# optional: additional penalties
for t in adjusted:
    count_recent = recent_tastes[-3:].count(t)
    if count_recent >= 2:
        adjusted[t] *= 0.5

return weighted_random_choice(adjusted)

Track selection:
- Prefer tracks not in `recent_tracks`.
- If none available, allow repeats.

---

## 7) Playback Control (HA + Sonos)

### 7.1 Desired behavior
- Never stop a track mid-track.
- When a track ends, decide and start the next track.

### 7.2 If HA `media_player` is reliable
Use a **watcher loop** that queries the Sonos `media_player` state:

**Loop every 5 seconds:**
- Read:
  - `state` (`playing`, `paused`, `idle`)
  - `media_content_id`
  - `media_duration`
  - `media_position`
- Determine “track finished” if:
  - state is `idle` OR
  - `media_duration` exists and `media_position >= media_duration - 2`

When finished:
- `next = choose_next_track()`
- Send command to HA: `media_player.play_media` with `media_content_id = next.track_url`
- Record play start + snapshot of current listeners/weights.

### 7.3 If HA `media_player` is *not* reliable (viable alternative)
Fallback strategy:
- Maintain a conservative timer:
  - If `media_duration` not available, assume typical track duration (e.g., 210s) and check for state changes.
- Or:
  - Use Sonos eventing (if available in your HA environment) to detect track transitions.
  
**MVP fallback approach:** keep the same watcher loop, but if duration/position missing, treat a change in `media_content_id` or state `idle` as the transition signal.

### 7.4 Command interface to HA
Backend should call HA to play:
- **Service**: `media_player.play_media`
- **Entity**: `media_player.<cafe_sonos>`
- **Payload**:
  - `media_content_id`: Spotify track URL
  - `media_content_type`: `"music"` (or omit if testing proves unnecessary)

### 7.5 Handling unplayable URLs
On play attempt:
- If HA/Sonos returns error OR player goes idle immediately:
  - Mark as failed/unplayable
  - Remove from submission queue (if it was submitted)
  - Log unplayable in history
  - Immediately choose another next track

---

## 8) “Upcoming Songs” in the PWA

The system produces two “upcoming” sources:

1. **Submitted queue** (deterministic)
2. **Taste mix preview** (probabilistic)

### Endpoint: `GET /api/music/upcoming?k=10`
Return:
- First: ordered submissions (up to k)
- Then: generate `k_remaining` simulated taste picks using current weights and smoothing state

The preview is a projection and may change when presence changes.

---

## 9) Logging Requirements (Finalized)

### Store permanently:
- Every submitted track URL + submitting user
- Every vote change (+1/0/-1) with voting user and timestamp
- Every play event (submission or taste):
  - track_url
  - start/end timestamps
  - source type, taste_id/submission_id
  - result (success/failed) and fail reason if any
- Presence context snapshot for each play:
  - users in office
  - users in cafe
  - weights used for selection

---

## 10) What Still Needs Final Specification (Minimal Remaining)

1. **Taste list** (enumeration)
   - e.g., `default`, `chill`, `upbeat`, `focus`, `instrumental`, `jazz`, etc.

2. **Bucket population plan**
   - How many tracks per bucket to start (recommend 30–50 minimum)
   - How tracks get into buckets:
     - admin curation, or
     - reuse from historical submissions, or
     - staff contribution workflow (“tag your submission with a taste”)

3. **User preference model**
   - One taste or multiple tastes allowed?
   - If multiple, evenly split vs weighted sliders?

4. **Presence confidence thresholds**
   - What counts as “in Cafe” vs “in office” (you already have BLE; define the cutoff/hysteresis)

5. **Operational toggles**
   - Admin pause
   - Max consecutive submissions from same person (optional fairness rule)
   - Quiet hours / volume policy (optional)

---

## 11) Implementation Checklist (Coding LLM To-Do)

1. Create DB schema (Users, Buckets, Tracks, Submissions, Votes, PlayHistory, ContextSnapshots).
2. Implement taste preference endpoints:
   - `POST /api/me/tastes`
   - `GET /api/me/tastes`
3. Implement submission endpoints:
   - `POST /api/music/submit`
   - `POST /api/music/vote`
   - `GET /api/music/queue`
4. Implement scheduler core:
   - `compute_weights(listeners)`
   - `order_submissions(submissions)`
   - `choose_taste_with_smoothing(weights, recent_tastes)`
   - `choose_track_from_bucket(taste_id, recent_tracks)`
   - `choose_next_track()`
5. Implement playback controller loop:
   - poll HA player state every 5s
   - detect track boundary
   - select next and call HA play_media
   - handle failures/unplayable
6. Implement history logging:
   - create PlayEvent + ContextSnapshot at start
   - finalize at end/failure
7. Implement upcoming/preview endpoint:
   - combine deterministic submissions + probabilistic taste preview
8. Add HA configuration:
   - identify `media_player.cafe`
   - test playing Spotify track URLs
9. Add admin tools:
   - bucket track management
   - queue moderation
   - playback status and last errors

---

## 12) Notes on Using Sonos Favorites (Optional Enhancements)

If you want a “fallback radio” mode:
- Define `default_favorite_id` (a Sonos Favorite pointing to a Spotify playlist/station).
- If **bucket tracks are empty** or the system errors repeatedly:
  - switch to playing the favorite until recovered.

But Favorites are not suitable as the primary mixing source if you require track-level weighting.

---

## Appendix: Minimal JSON Objects

### Submission
```json
{
  "id": "sub_123",
  "track_url": "https://open.spotify.com/track/…",
  "submitted_by": "u_1",
  "created_at": "2026-01-18T10:00:00Z",
  "votes": { "u_1": 1, "u_2": -1 },
  "status": "queued"
}

NextTrack returned by scheduler

{
  "source": "submission",
  "submission_id": "sub_123",
  "track_url": "https://open.spotify.com/track/…"
}

or

{
  "source": "taste",
  "taste_id": "chill",
  "track_url": "https://open.spotify.com/track/…",
  "weights": { "chill": 0.5, "upbeat": 0.5 }
}

