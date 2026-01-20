/**
 * Oasis Sand Table Service
 * Handles pattern queue, LED queue, voting, and favorites management
 * Integrates with Home Assistant Oasis Mini integration
 */

const db = require('../db');

// Home Assistant configuration
const HA_URL = process.env.HA_URL || 'http://localhost:8123';
const HA_TOKEN = process.env.HA_TOKEN;

// Oasis Mini entity IDs (discovered from HA)
const OASIS_ENTITIES = {
  mediaPlayer: 'media_player.coffee_table_ct251020897',
  led: 'light.coffee_table_ct251020897_led',
  playlist: 'select.coffee_table_ct251020897_playlist',
  queue: 'select.coffee_table_ct251020897_queue',
  ballSpeed: 'number.coffee_table_ct251020897_ball_speed',
  ledSpeed: 'number.coffee_table_ct251020897_led_speed',
  progress: 'sensor.coffee_table_ct251020897_drawing_progress',
  image: 'image.coffee_table_ct251020897'
};

// Default LED effects (fallback if HA unavailable)
let LED_EFFECTS = [
  { id: 'solid', name: 'Solid', supportsColor: true },
  { id: 'rainbow', name: 'Rainbow', supportsColor: false },
  { id: 'glitter', name: 'Glitter', supportsColor: true },
  { id: 'confetti', name: 'Confetti', supportsColor: false },
  { id: 'bpm', name: 'BPM', supportsColor: false },
  { id: 'juggle', name: 'Juggle', supportsColor: false },
  { id: 'aurora_flow', name: 'Aurora Flow', supportsColor: false },
  { id: 'breathing_exercise', name: 'Breathing Exercise 4-7-8', supportsColor: true }
];

// ----------------------------------------------------------------------------
// Home Assistant API helpers
// ----------------------------------------------------------------------------

async function haFetch(endpoint, options = {}) {
  if (!HA_TOKEN) {
    throw new Error('HA_TOKEN not configured');
  }

  const url = `${HA_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`HA API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function haCallService(domain, service, data, returnResponse = false) {
  const url = `/api/services/${domain}/${service}${returnResponse ? '?return_response' : ''}`;
  return haFetch(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

async function haGetState(entityId) {
  return haFetch(`/api/states/${entityId}`);
}

// ----------------------------------------------------------------------------
// Home Assistant Integration
// ----------------------------------------------------------------------------

/**
 * Fetch current Oasis status from Home Assistant
 */
async function fetchOasisStatusFromHA() {
  try {
    const [mediaPlayer, led, progress] = await Promise.all([
      haGetState(OASIS_ENTITIES.mediaPlayer),
      haGetState(OASIS_ENTITIES.led),
      haGetState(OASIS_ENTITIES.progress)
    ]);

    return {
      connected: true,
      state: mediaPlayer.state, // idle, playing, paused
      currentPattern: {
        name: mediaPlayer.attributes.media_title,
        thumbnailUrl: mediaPlayer.attributes.entity_picture,
        duration: mediaPlayer.attributes.media_duration,
        position: mediaPlayer.attributes.media_position
      },
      led: {
        state: led.state, // on, off
        effect: led.attributes.effect,
        brightness: led.attributes.brightness,
        color: led.attributes.rgb_color,
        availableEffects: led.attributes.effect_list || []
      },
      progress: parseFloat(progress.state) || 0
    };
  } catch (error) {
    console.error('Failed to fetch Oasis status from HA:', error.message);
    return { connected: false, error: error.message };
  }
}

/**
 * Fetch available patterns from HA browse_media
 */
async function fetchPatternsFromHA() {
  try {
    // Use browse_media with return_response to get pattern library
    // First browse into tracks_root to get actual patterns
    const result = await haCallService('media_player', 'browse_media', {
      entity_id: OASIS_ENTITIES.mediaPlayer,
      media_content_id: 'tracks_root',
      media_content_type: 'oasis_tracks'
    }, true); // returnResponse = true

    // Extract patterns from service response
    const entityResponse = result.service_response?.[OASIS_ENTITIES.mediaPlayer];
    const children = entityResponse?.children || [];

    console.log(`[Oasis] Fetched ${children.length} patterns from HA`);

    const patterns = children
      .filter(item => item.can_play !== false)
      .map(item => ({
        id: item.media_content_id,
        name: item.title,
        thumbnailUrl: item.thumbnail
      }));

    // Cache patterns in database
    for (const pattern of patterns) {
      db.cacheOasisPattern(pattern);
    }

    console.log(`[Oasis] Cached ${patterns.length} patterns`);
    return patterns;
  } catch (error) {
    console.error('Failed to fetch patterns from HA:', error.message);
    // Return cached patterns on error
    return db.getOasisPatterns();
  }
}

/**
 * Fetch playlists from HA
 */
async function fetchPlaylistsFromHA() {
  try {
    const playlistEntity = await haGetState(OASIS_ENTITIES.playlist);
    return playlistEntity.attributes.options || [];
  } catch (error) {
    console.error('Failed to fetch playlists from HA:', error.message);
    return [];
  }
}

/**
 * Update LED effects list from HA
 */
async function updateLedEffectsFromHA() {
  try {
    const ledEntity = await haGetState(OASIS_ENTITIES.led);
    const effectList = ledEntity.attributes.effect_list || [];

    // Map to our format
    LED_EFFECTS = effectList.map(name => ({
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name: name,
      supportsColor: ['Solid', 'Glitter', 'Breathing Exercise 4-7-8', 'Palette Mode'].includes(name)
    }));

    return LED_EFFECTS;
  } catch (error) {
    console.error('Failed to update LED effects from HA:', error.message);
    return LED_EFFECTS;
  }
}

/**
 * Play a pattern on the Oasis
 */
async function playPatternOnOasis(patternId, patternName) {
  try {
    await haCallService('media_player', 'play_media', {
      entity_id: OASIS_ENTITIES.mediaPlayer,
      media_content_id: patternId,
      media_content_type: 'track'
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to play pattern on Oasis:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Set LED effect on the Oasis
 */
async function setLedEffectOnOasis(effectName, rgbColor = null, brightness = null) {
  try {
    const serviceData = {
      entity_id: OASIS_ENTITIES.led,
      effect: effectName
    };

    if (rgbColor) {
      serviceData.rgb_color = rgbColor;
    }
    if (brightness !== null) {
      serviceData.brightness = brightness;
    }

    await haCallService('light', 'turn_on', serviceData);
    return { success: true };
  } catch (error) {
    console.error('Failed to set LED effect on Oasis:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Set playlist on the Oasis
 */
async function setPlaylistOnOasis(playlistName) {
  try {
    await haCallService('select', 'select_option', {
      entity_id: OASIS_ENTITIES.playlist,
      option: playlistName
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to set playlist on Oasis:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch native queue from Oasis
 * Returns the patterns currently in the Oasis's own queue
 */
async function fetchNativeQueueFromHA() {
  try {
    const queueEntity = await haGetState(OASIS_ENTITIES.queue);
    const queueOptions = queueEntity.attributes.options || [];
    const currentPattern = queueEntity.state;

    // Map queue items to pattern objects
    // The queue options are pattern names, we need to get thumbnails from media player
    const mediaPlayer = await haGetState(OASIS_ENTITIES.mediaPlayer);
    const currentThumbnail = mediaPlayer.attributes.entity_picture;

    // Get cached patterns to look up thumbnails
    const cachedPatterns = db.getOasisPatterns();
    const thumbnailMap = {};
    for (const p of cachedPatterns) {
      // Match by name (case-insensitive)
      thumbnailMap[p.name.toLowerCase()] = p.thumbnail_url;
    }

    // Helper to find thumbnail, with fallback for numbered duplicates like "Pattern Name (2)"
    function findThumbnail(name) {
      const lowerName = name.toLowerCase();
      if (thumbnailMap[lowerName]) {
        return thumbnailMap[lowerName];
      }
      // Try stripping "(N)" suffix for playlist duplicates
      const baseMatch = name.match(/^(.+?)\s*\(\d+\)$/);
      if (baseMatch) {
        const baseName = baseMatch[1].toLowerCase();
        return thumbnailMap[baseName] || null;
      }
      return null;
    }

    return {
      current: currentPattern,
      patterns: queueOptions.map((name, index) => ({
        name,
        // Use current thumbnail for first item, otherwise look up from cache
        thumbnailUrl: index === 0 ? currentThumbnail : findThumbnail(name),
        isNative: true,
        position: index
      }))
    };
  } catch (error) {
    console.error('Failed to fetch native queue from HA:', error.message);
    return { current: null, patterns: [] };
  }
}

// ----------------------------------------------------------------------------
// Pattern Queue Management
// ----------------------------------------------------------------------------

/**
 * Get available patterns (from cache)
 */
function getPatterns() {
  return db.getOasisPatterns();
}

/**
 * Cache patterns from Oasis browse_media response
 * @param {Array} patterns - Patterns from Oasis
 */
function cachePatterns(patterns) {
  for (const pattern of patterns) {
    db.cacheOasisPattern(pattern);
  }
}

/**
 * Submit a pattern to the queue
 * @param {number} userId - User ID
 * @param {string} patternId - Pattern ID
 * @param {string} patternName - Pattern name
 * @param {string} thumbnailUrl - Pattern thumbnail URL
 */
function submitPattern(userId, patternId, patternName, thumbnailUrl = null) {
  return db.createOasisSubmission({
    patternId,
    patternName,
    thumbnailUrl,
    submittedByUserId: userId
  });
}

/**
 * Get the pattern queue (ordered by votes)
 */
function getPatternQueue() {
  return db.getOasisQueuedSubmissions();
}

/**
 * Vote on a pattern submission
 * @param {number} userId - User ID
 * @param {number} submissionId - Submission ID
 * @param {number} value - Vote value: 1, -1, or 0 (remove)
 */
function votePattern(userId, submissionId, value) {
  const submission = db.getOasisSubmissionById(submissionId);
  if (!submission) {
    throw new Error('Submission not found');
  }
  if (submission.status !== 'queued') {
    throw new Error('Cannot vote on non-queued submissions');
  }
  return db.voteOasisSubmission(submissionId, userId, value);
}

/**
 * Remove own pattern submission
 */
function removePatternSubmission(userId, submissionId) {
  const success = db.deleteOasisSubmission(submissionId, userId);
  if (!success) {
    throw new Error('Cannot delete: submission not found, not yours, or already played');
  }
  return { success: true };
}

/**
 * Trash any pattern submission (for rate-limited trash)
 */
function trashPattern(submissionId) {
  return db.trashOasisSubmission(submissionId);
}

/**
 * Get next pattern to play
 * Returns first in queue, or random favorite if queue empty
 */
function getNextPattern() {
  const queue = db.getOasisQueuedSubmissions();
  if (queue.length > 0) {
    return { source: 'queue', submission: queue[0] };
  }

  // Queue empty - try favorites
  const favorite = db.getRandomOasisFavorite();
  if (favorite) {
    return {
      source: 'favorite',
      pattern: {
        id: favorite.pattern_id,
        name: favorite.pattern_name,
        thumbnailUrl: favorite.thumbnail_url
      }
    };
  }

  // No favorites - return null (scheduler will use Oasis default)
  return null;
}

/**
 * Mark pattern submission as playing
 */
function markPatternPlaying(submissionId) {
  return db.updateOasisSubmissionStatus(submissionId, 'playing');
}

/**
 * Mark pattern submission as played
 */
function markPatternPlayed(submissionId) {
  return db.updateOasisSubmissionStatus(submissionId, 'played');
}

// ----------------------------------------------------------------------------
// LED Queue Management
// ----------------------------------------------------------------------------

/**
 * Get available LED effects
 */
function getLedEffects() {
  return LED_EFFECTS;
}

/**
 * Submit LED pattern to queue
 * @param {number} userId - User ID
 * @param {string} effectName - Effect name
 * @param {string} colorHex - Color hex (optional)
 * @param {number} brightness - Brightness 0-255
 */
function submitLed(userId, effectName, colorHex = null, brightness = 128) {
  // Validate effect
  const effect = LED_EFFECTS.find(e => e.id === effectName || e.name === effectName);
  if (!effect) {
    throw new Error(`Invalid effect: ${effectName}`);
  }

  // Validate color for effects that support it
  if (colorHex && !effect.supportsColor) {
    colorHex = null; // Ignore color for effects that don't support it
  }

  return db.createOasisLedSubmission({
    effectName: effect.name,
    colorHex,
    brightness: Math.max(0, Math.min(255, brightness)),
    submittedByUserId: userId
  });
}

/**
 * Get LED queue
 */
function getLedQueue() {
  return db.getOasisLedQueuedSubmissions();
}

/**
 * Vote on LED submission
 */
function voteLed(userId, submissionId, value) {
  const submission = db.getOasisLedSubmissionById(submissionId);
  if (!submission) {
    throw new Error('LED submission not found');
  }
  if (submission.status !== 'queued') {
    throw new Error('Cannot vote on non-queued submissions');
  }
  return db.voteOasisLedSubmission(submissionId, userId, value);
}

/**
 * Trash LED submission
 */
function trashLed(submissionId) {
  return db.trashOasisLedSubmission(submissionId);
}

/**
 * Get next LED to activate
 */
function getNextLed() {
  const queue = db.getOasisLedQueuedSubmissions();
  if (queue.length > 0) {
    return { source: 'queue', submission: queue[0] };
  }

  // Queue empty - try favorites
  const favorite = db.getRandomOasisLedFavorite();
  if (favorite) {
    return {
      source: 'favorite',
      led: {
        effectName: favorite.effect_name,
        colorHex: favorite.color_hex,
        brightness: favorite.brightness
      }
    };
  }

  // Default: Rainbow at 50%
  return {
    source: 'default',
    led: {
      effectName: 'Rainbow',
      colorHex: null,
      brightness: 128
    }
  };
}

/**
 * Mark LED submission as active
 */
function markLedActive(submissionId) {
  return db.updateOasisLedSubmissionStatus(submissionId, 'active');
}

/**
 * Mark LED submission as played
 */
function markLedPlayed(submissionId) {
  return db.updateOasisLedSubmissionStatus(submissionId, 'played');
}

// ----------------------------------------------------------------------------
// Favorites Management
// ----------------------------------------------------------------------------

/**
 * Add pattern to favorites
 */
function addPatternFavorite(userId, patternId, patternName, thumbnailUrl) {
  db.addOasisFavorite({
    patternId,
    patternName,
    thumbnailUrl,
    addedByUserId: userId
  });
  return { success: true };
}

/**
 * Remove pattern from favorites
 */
function removePatternFavorite(patternId) {
  db.removeOasisFavorite(patternId);
  return { success: true };
}

/**
 * Get pattern favorites
 */
function getPatternFavorites() {
  return db.getOasisFavorites();
}

/**
 * Add LED to favorites
 */
function addLedFavorite(effectName, colorHex, brightness) {
  db.addOasisLedFavorite({ effectName, colorHex, brightness });
  return { success: true };
}

/**
 * Get LED favorites
 */
function getLedFavorites() {
  return db.getOasisLedFavorites();
}

// ----------------------------------------------------------------------------
// Scheduler State
// ----------------------------------------------------------------------------

/**
 * Get scheduler state
 */
function getSchedulerState() {
  return db.getOasisSchedulerState();
}

/**
 * Update scheduler state
 */
function updateSchedulerState(updates) {
  db.updateOasisSchedulerState(updates);
  return db.getOasisSchedulerState();
}

/**
 * Get LED change interval in minutes
 */
function getLedChangeInterval() {
  const state = db.getOasisSchedulerState();
  return state?.led_change_interval_minutes || 10;
}

/**
 * Set LED change interval
 */
function setLedChangeInterval(minutes) {
  db.updateOasisSchedulerState({ led_change_interval_minutes: minutes });
}

/**
 * Check if it's time to change LED
 */
function isTimeToChangeLed() {
  const state = db.getOasisSchedulerState();
  if (!state.last_led_change_at) return true;

  const lastChange = new Date(state.last_led_change_at + 'Z').getTime();
  const intervalMs = (state.led_change_interval_minutes || 10) * 60 * 1000;
  return Date.now() - lastChange >= intervalMs;
}

/**
 * Get time until next LED change in minutes
 */
function getTimeUntilNextLedChange() {
  const state = db.getOasisSchedulerState();
  if (!state.last_led_change_at) return 0;

  const lastChange = new Date(state.last_led_change_at + 'Z').getTime();
  const intervalMs = (state.led_change_interval_minutes || 10) * 60 * 1000;
  const elapsed = Date.now() - lastChange;
  const remaining = Math.max(0, intervalMs - elapsed);
  return Math.ceil(remaining / 60000);
}

/**
 * Record LED change
 */
function recordLedChange() {
  db.updateOasisSchedulerState({
    last_led_change_at: new Date().toISOString().replace('T', ' ').replace('Z', '')
  });
}

// ----------------------------------------------------------------------------
// Mock Patterns for Development
// ----------------------------------------------------------------------------

/**
 * Seed mock patterns for development when HA isn't available
 * These match the categories defined in the PWA for auto-categorization
 */
const MOCK_PATTERNS = [
  // Animals
  { id: 'cat', name: 'Cat' },
  { id: 'dragon', name: 'Dragon' },
  { id: 'butterfly', name: 'Butterfly' },
  { id: 'koi-fish', name: 'Koi Fish' },
  { id: 'owl', name: 'Owl' },
  { id: 'dolphin', name: 'Dolphin' },
  { id: 'wolf', name: 'Wolf' },
  { id: 'phoenix', name: 'Phoenix Bird' },
  { id: 'turtle', name: 'Sea Turtle' },
  { id: 'seahorse', name: 'Seahorse' },
  { id: 'jellyfish', name: 'Jellyfish' },
  { id: 'octopus', name: 'Octopus' },

  // Nature
  { id: 'lotus-flower', name: 'Lotus Flower' },
  { id: 'rose', name: 'Rose' },
  { id: 'tree-of-life', name: 'Tree of Life' },
  { id: 'mountain-sunset', name: 'Mountain Sunset' },
  { id: 'ocean-wave', name: 'Ocean Wave' },
  { id: 'bamboo', name: 'Bamboo Forest' },
  { id: 'aurora', name: 'Aurora Borealis' },
  { id: 'sun-moon', name: 'Sun and Moon' },
  { id: 'garden', name: 'Zen Garden' },
  { id: 'leaf', name: 'Autumn Leaf' },

  // Shapes & Spirals
  { id: 'spiral-1', name: 'Classic Spiral' },
  { id: 'spiral-fibonacci', name: 'Fibonacci Spiral' },
  { id: 'mandala-1', name: 'Mandala' },
  { id: 'mandala-lotus', name: 'Lotus Mandala' },
  { id: 'star-burst', name: 'Star Burst' },
  { id: 'heart', name: 'Heart' },
  { id: 'geometric-1', name: 'Geometric Pattern' },
  { id: 'hexagon', name: 'Hexagon Grid' },
  { id: 'kaleidoscope', name: 'Kaleidoscope' },
  { id: 'spirograph-1', name: 'Spirograph' },
  { id: 'fractal-1', name: 'Fractal Tree' },
  { id: 'tessellation', name: 'Tessellation' },

  // Holidays
  { id: 'christmas-tree', name: 'Christmas Tree' },
  { id: 'snowflake', name: 'Snowflake' },
  { id: 'halloween-pumpkin', name: 'Halloween Pumpkin' },
  { id: 'valentine-heart', name: 'Valentine Heart' },
  { id: 'easter-egg', name: 'Easter Egg' },
  { id: 'fireworks', name: 'Fireworks' },

  // Abstract
  { id: 'zen-circles', name: 'Zen Circles' },
  { id: 'abstract-flow', name: 'Abstract Flow' },
  { id: 'wave-pattern', name: 'Wave Pattern' },
  { id: 'minimal-1', name: 'Minimal Lines' },
  { id: 'swirl', name: 'Swirl' },
  { id: 'dizzy', name: 'Dizzy Spiral' },

  // Celtic & Tribal
  { id: 'celtic-knot', name: 'Celtic Knot' },
  { id: 'celtic-trinity', name: 'Celtic Trinity' },
  { id: 'tribal-sun', name: 'Tribal Sun' },
  { id: 'viking-rune', name: 'Viking Rune' },
  { id: 'aztec', name: 'Aztec Pattern' },

  // Additional popular patterns
  { id: 'yin-yang', name: 'Yin Yang' },
  { id: 'infinity', name: 'Infinity' },
  { id: 'labyrinth', name: 'Labyrinth' },
  { id: 'compass', name: 'Compass Rose' },
  { id: 'galaxy', name: 'Galaxy Spiral' },
  { id: 'dna', name: 'DNA Helix' },
];

/**
 * Seed mock patterns if database is empty
 * @returns {number} Number of patterns seeded
 */
function seedMockPatterns() {
  console.log('[Oasis] Seeding mock patterns for development...');
  for (const pattern of MOCK_PATTERNS) {
    db.cacheOasisPattern({
      id: pattern.id,
      name: pattern.name,
      thumbnailUrl: null, // No thumbnails for mock patterns
      durationSeconds: Math.floor(Math.random() * 300) + 120 // Random 2-7 minutes
    });
  }
  console.log(`[Oasis] Seeded ${MOCK_PATTERNS.length} mock patterns`);
  return MOCK_PATTERNS.length;
}

/**
 * Initialize patterns - try HA first, fall back to mock patterns
 * Called on server startup
 */
async function initializePatterns() {
  const existing = db.getOasisPatterns();
  if (existing.length > 0) {
    console.log(`[Oasis] ${existing.length} patterns already cached`);
    return existing.length;
  }

  // Try to fetch from HA first
  if (HA_TOKEN) {
    console.log('[Oasis] Attempting to fetch patterns from Home Assistant...');
    try {
      const patterns = await fetchPatternsFromHA();
      if (patterns && patterns.length > 0) {
        console.log(`[Oasis] Successfully cached ${patterns.length} patterns from HA`);
        return patterns.length;
      }
    } catch (error) {
      console.log('[Oasis] HA fetch failed:', error.message);
    }
  } else {
    console.log('[Oasis] HA_TOKEN not configured, skipping HA fetch');
  }

  // Fall back to mock patterns for development
  console.log('[Oasis] Falling back to mock patterns for development');
  return seedMockPatterns();
}

/**
 * Get total pattern count
 */
function getPatternCount() {
  return db.getOasisPatterns().length;
}

// ----------------------------------------------------------------------------
// Status
// ----------------------------------------------------------------------------

/**
 * Get current status including now playing and queues
 */
function getStatus() {
  const state = db.getOasisSchedulerState();
  const patternQueue = db.getOasisQueuedSubmissions();
  const ledQueue = db.getOasisLedQueuedSubmissions();

  let currentPattern = null;
  if (state.current_pattern_submission_id) {
    currentPattern = db.getOasisSubmissionById(state.current_pattern_submission_id);
  }

  let currentLed = null;
  if (state.current_led_submission_id) {
    currentLed = db.getOasisLedSubmissionById(state.current_led_submission_id);
  }

  return {
    isRunning: !!state.is_running,
    currentPattern,
    currentLed,
    patternQueueLength: patternQueue.length,
    ledQueueLength: ledQueue.length,
    ledChangeIntervalMinutes: state.led_change_interval_minutes,
    timeUntilNextLedChange: getTimeUntilNextLedChange()
  };
}

module.exports = {
  // Home Assistant integration
  fetchOasisStatusFromHA,
  fetchPatternsFromHA,
  fetchPlaylistsFromHA,
  fetchNativeQueueFromHA,
  updateLedEffectsFromHA,
  playPatternOnOasis,
  setLedEffectOnOasis,
  setPlaylistOnOasis,
  OASIS_ENTITIES,

  // Pattern queue
  getPatterns,
  cachePatterns,
  submitPattern,
  getPatternQueue,
  votePattern,
  removePatternSubmission,
  trashPattern,
  getNextPattern,
  markPatternPlaying,
  markPatternPlayed,

  // LED queue
  getLedEffects,
  submitLed,
  getLedQueue,
  voteLed,
  trashLed,
  getNextLed,
  markLedActive,
  markLedPlayed,

  // Favorites
  addPatternFavorite,
  removePatternFavorite,
  getPatternFavorites,
  addLedFavorite,
  getLedFavorites,

  // Scheduler
  getSchedulerState,
  updateSchedulerState,
  getLedChangeInterval,
  setLedChangeInterval,
  isTimeToChangeLed,
  getTimeUntilNextLedChange,
  recordLedChange,

  // Status
  getStatus,

  // Mock patterns / initialization
  initializePatterns,
  seedMockPatterns,
  getPatternCount,
  MOCK_PATTERNS,

  // Constants
  LED_EFFECTS
};
