/**
 * Oasis Sand Table Service
 * Handles pattern queue, LED queue, voting, and favorites management
 */

const db = require('../db');

// Available LED effects (from Oasis Mini integration)
const LED_EFFECTS = [
  { id: 'rainbow', name: 'Rainbow', supportsColor: false },
  { id: 'glitter', name: 'Glitter', supportsColor: true },
  { id: 'confetti', name: 'Confetti', supportsColor: false },
  { id: 'bpm', name: 'BPM', supportsColor: false },
  { id: 'juggle', name: 'Juggle', supportsColor: false },
  { id: 'solid', name: 'Solid Color', supportsColor: true },
  { id: 'breathe', name: 'Breathe', supportsColor: true },
  { id: 'pulse', name: 'Pulse', supportsColor: true }
];

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

  // Constants
  LED_EFFECTS
};
