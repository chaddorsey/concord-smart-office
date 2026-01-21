/**
 * Oasis Pattern Scheduler Service
 * Manages continuous pattern playback by polling Oasis state and playing queued patterns
 */

const db = require('../db');
const oasisService = require('./oasisService');

// Scheduler configuration
const POLL_INTERVAL = 10000; // 10 seconds
const MAX_CONSECUTIVE_FAILURES = 5;

// Scheduler state
let pollInterval = null;
let isProcessing = false;
let consecutiveFailures = 0;
let currentPatternSubmissionId = null;

/**
 * Initialize and start the scheduler
 */
async function start() {
  console.log('[OasisScheduler] Starting pattern scheduler...');

  // Initialize scheduler state
  const state = db.getOasisSchedulerState();
  if (!state.is_running) {
    db.updateOasisSchedulerState({ is_running: 1 });
  }

  // Restore current pattern if we have one
  if (state.current_pattern_submission_id) {
    currentPatternSubmissionId = state.current_pattern_submission_id;
    console.log(`[OasisScheduler] Restored current pattern submission: ${currentPatternSubmissionId}`);
  }

  // Start the polling loop
  if (!pollInterval) {
    pollInterval = setInterval(tick, POLL_INTERVAL);
    console.log('[OasisScheduler] Polling started');
  }

  // Do an immediate tick
  tick();
}

/**
 * Stop the scheduler
 */
function stop() {
  console.log('[OasisScheduler] Stopping pattern scheduler...');

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  db.updateOasisSchedulerState({ is_running: 0 });
  console.log('[OasisScheduler] Scheduler stopped');
}

/**
 * Pause the scheduler (stop playing new patterns but keep polling)
 */
function pause() {
  console.log('[OasisScheduler] Pausing scheduler');
  db.updateOasisSchedulerState({ is_paused: 1 });
}

/**
 * Resume the scheduler
 */
function resume() {
  console.log('[OasisScheduler] Resuming scheduler');
  db.updateOasisSchedulerState({ is_paused: 0 });
  // Trigger immediate check
  tick();
}

/**
 * Main scheduler tick - runs every POLL_INTERVAL
 */
async function tick() {
  // Prevent concurrent processing
  if (isProcessing) return;
  isProcessing = true;

  try {
    const state = db.getOasisSchedulerState();

    // Check if scheduler is paused
    if (state.is_paused) {
      isProcessing = false;
      return;
    }

    // Get current Oasis status from Home Assistant
    const oasisStatus = await oasisService.fetchOasisStatusFromHA();

    if (!oasisStatus.connected) {
      console.log('[OasisScheduler] Oasis not connected');
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error('[OasisScheduler] Too many failures, pausing scheduler');
        pause();
      }
      isProcessing = false;
      return;
    }

    // Reset failure counter on successful connection
    consecutiveFailures = 0;

    // Check if current pattern finished (state is idle and we were playing something)
    const isIdle = oasisStatus.state === 'idle';
    const wasPlaying = currentPatternSubmissionId !== null;

    if (isIdle && wasPlaying) {
      // Pattern finished - mark as played
      console.log(`[OasisScheduler] Pattern ${currentPatternSubmissionId} finished`);
      oasisService.markPatternPlayed(currentPatternSubmissionId);
      currentPatternSubmissionId = null;
      db.updateOasisSchedulerState({ current_pattern_submission_id: null });
    }

    // If idle, play next pattern from queue
    if (isIdle) {
      await playNextPattern();
    }

  } catch (error) {
    console.error('[OasisScheduler] Error in tick:', error.message);
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error('[OasisScheduler] Too many failures, pausing scheduler');
      pause();
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Play the next pattern from the queue
 */
async function playNextPattern() {
  const next = oasisService.getNextPattern();

  if (!next) {
    // No patterns in queue or favorites - let Oasis play its native queue
    console.log('[OasisScheduler] No queued patterns, Oasis will use native queue');
    return;
  }

  if (next.source === 'queue') {
    const pattern = next.submission;
    console.log(`[OasisScheduler] Playing queued pattern: ${pattern.pattern_name}`);

    const result = await oasisService.playPatternOnOasis(pattern.pattern_id, pattern.pattern_name);

    if (result.success) {
      currentPatternSubmissionId = pattern.id;
      oasisService.markPatternPlaying(pattern.id);
      db.updateOasisSchedulerState({ current_pattern_submission_id: pattern.id });
      console.log(`[OasisScheduler] Now playing: ${pattern.pattern_name}`);
    } else {
      console.error(`[OasisScheduler] Failed to play pattern: ${result.error}`);
      // Mark as failed so it doesn't block the queue
      db.updateOasisSubmissionStatus(pattern.id, 'failed');
    }
  } else if (next.source === 'favorite') {
    // Play from favorites when queue is empty
    const pattern = next.pattern;
    console.log(`[OasisScheduler] Playing favorite pattern: ${pattern.name}`);

    const result = await oasisService.playPatternOnOasis(pattern.id, pattern.name);

    if (result.success) {
      currentPatternSubmissionId = null; // Favorites don't have submission IDs
      db.updateOasisSchedulerState({ current_pattern_submission_id: null });
    } else {
      console.error(`[OasisScheduler] Failed to play favorite: ${result.error}`);
    }
  }
}

/**
 * Skip the current pattern and play the next one
 */
async function skip() {
  console.log('[OasisScheduler] Skipping current pattern');

  // Mark current as played if we have one
  if (currentPatternSubmissionId) {
    oasisService.markPatternPlayed(currentPatternSubmissionId);
    currentPatternSubmissionId = null;
    db.updateOasisSchedulerState({ current_pattern_submission_id: null });
  }

  // Play next pattern
  await playNextPattern();
}

/**
 * Get scheduler status
 */
function getStatus() {
  const state = db.getOasisSchedulerState();
  return {
    running: !!state.is_running,
    paused: !!state.is_paused,
    currentPatternSubmissionId: state.current_pattern_submission_id
  };
}

/**
 * Check if scheduler is running
 */
function isRunning() {
  return pollInterval !== null;
}

module.exports = {
  start,
  stop,
  pause,
  resume,
  skip,
  getStatus,
  isRunning
};
