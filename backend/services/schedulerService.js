/**
 * Music Scheduler Service
 * Manages continuous playback by polling Sonos state and selecting next tracks
 */

const db = require('../db');
const musicService = require('./musicService');
const sonosService = require('./sonosService');

// Scheduler configuration
const POLL_INTERVAL = 5000; // 5 seconds
const TRACK_END_BUFFER = 3; // seconds before end to consider track finished
const FAILURE_RETRY_DELAY = 10000; // 10 seconds after failure
const MAX_CONSECUTIVE_FAILURES = 5;

// Scheduler state
let pollInterval = null;
let isProcessing = false;
let consecutiveFailures = 0;
let lastPlayedTrackUrl = null;

/**
 * Initialize and start the scheduler
 */
async function start() {
  console.log('[Scheduler] Starting music scheduler...');

  // Connect to Home Assistant
  const connected = await sonosService.connect();
  if (!connected) {
    console.log('[Scheduler] Could not connect to HA - scheduler will retry');
  }

  // Discover Sonos entities
  if (sonosService.isConnected()) {
    await sonosService.discoverSonos();
  }

  // Initialize scheduler state if needed
  const state = db.getSchedulerState();
  if (!state.is_running) {
    db.updateSchedulerState({ is_running: true, is_paused: false });
  }

  // Start the polling loop
  if (!pollInterval) {
    pollInterval = setInterval(tick, POLL_INTERVAL);
    console.log('[Scheduler] Polling started');
  }

  // Do an immediate tick
  tick();
}

/**
 * Stop the scheduler
 */
function stop() {
  console.log('[Scheduler] Stopping music scheduler...');

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  db.updateSchedulerState({ is_running: false });
  sonosService.disconnect();

  console.log('[Scheduler] Scheduler stopped');
}

/**
 * Pause playback (keeps polling but doesn't start new tracks)
 */
function pause() {
  console.log('[Scheduler] Pausing scheduler');
  db.updateSchedulerState({ is_paused: true });
}

/**
 * Resume playback
 */
function resume() {
  console.log('[Scheduler] Resuming scheduler');
  db.updateSchedulerState({ is_paused: false });
  // Trigger immediate check
  tick();
}

/**
 * Main scheduler tick - runs every POLL_INTERVAL
 */
async function tick() {
  // Prevent overlapping ticks
  if (isProcessing) {
    return;
  }

  const state = db.getSchedulerState();

  // Don't process if paused
  if (state.is_paused) {
    return;
  }

  // Check if connected
  if (!sonosService.isConnected()) {
    console.log('[Scheduler] Not connected to HA, attempting reconnect...');
    await sonosService.connect();
    if (sonosService.isConnected()) {
      await sonosService.discoverSonos();
    }
    return;
  }

  // Check if Sonos entity is configured
  if (!sonosService.getSonosEntity()) {
    console.log('[Scheduler] No Sonos entity configured, discovering...');
    await sonosService.discoverSonos();
    if (!sonosService.getSonosEntity()) {
      console.log('[Scheduler] No Sonos entity found');
      return;
    }
  }

  isProcessing = true;

  try {
    await processPlaybackState();
    consecutiveFailures = 0;
  } catch (error) {
    console.error('[Scheduler] Tick error:', error.message);
    consecutiveFailures++;

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error('[Scheduler] Too many consecutive failures, pausing...');
      pause();
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Process current playback state and decide next action
 */
async function processPlaybackState() {
  const playbackState = await sonosService.getPlaybackState();

  // Check if track has finished
  const trackFinished = sonosService.isTrackFinished(playbackState);

  // Also check if we're idle/stopped without an active track
  const needsNewTrack = trackFinished ||
    playbackState.state === 'idle' ||
    playbackState.state === 'off' ||
    (playbackState.state === 'paused' && !playbackState.mediaContentId);

  if (needsNewTrack) {
    console.log('[Scheduler] Track finished or idle, selecting next track...');

    // Finalize current play if there is one
    const schedulerState = db.getSchedulerState();
    if (schedulerState.current_play_id) {
      finalizeCurrentPlay(schedulerState.current_play_id, 'completed');
    }

    // Select and play next track
    await playNextTrack();
  } else if (playbackState.isPlaying) {
    // Track is playing - update position tracking if needed
    const schedulerState = db.getSchedulerState();

    // Check if this is a different track than we started
    if (playbackState.mediaContentId &&
        lastPlayedTrackUrl &&
        playbackState.mediaContentId !== lastPlayedTrackUrl) {
      console.log('[Scheduler] Detected track change (external or skip)');
      // Track was changed externally, finalize the old one
      if (schedulerState.current_play_id) {
        finalizeCurrentPlay(schedulerState.current_play_id, 'skipped');
        db.updateSchedulerState({ current_play_id: null });
      }
    }
  }

  // Update volume based on presence preferences
  await updateVolumeIfNeeded();
}

/**
 * Select and play the next track
 */
async function playNextTrack() {
  const nextTrack = chooseNextTrack();

  if (!nextTrack) {
    console.log('[Scheduler] No tracks available to play');
    return;
  }

  console.log(`[Scheduler] Playing next track: ${nextTrack.trackUrl} (source: ${nextTrack.source})`);

  try {
    // Start playback
    await sonosService.playTrack(nextTrack.trackUrl);

    // Record play start
    const playId = recordPlayStart(nextTrack);

    // Update scheduler state
    lastPlayedTrackUrl = nextTrack.trackUrl;
    db.updateSchedulerState({
      current_play_id: playId,
      last_track_url: nextTrack.trackUrl
    });

    // Update recent tracks list for smoothing
    updateRecentTracks(nextTrack);

    // If this was a submission, mark it as playing
    if (nextTrack.source === 'submission' && nextTrack.submissionId) {
      db.run(
        `UPDATE music_submissions SET status = 'playing' WHERE id = ?`,
        [nextTrack.submissionId]
      );
    }

    console.log('[Scheduler] Track started successfully');
  } catch (error) {
    console.error('[Scheduler] Failed to play track:', error.message);

    // Handle unplayable track
    if (nextTrack.source === 'submission' && nextTrack.submissionId) {
      // Mark submission as failed
      db.run(
        `UPDATE music_submissions SET status = 'failed', fail_reason = ? WHERE id = ?`,
        [error.message, nextTrack.submissionId]
      );
    }

    // Try the next track after a brief delay
    setTimeout(() => playNextTrack(), 2000);
  }
}

/**
 * Choose the next track to play based on queue and taste weights
 */
function chooseNextTrack() {
  // First, check submission queue
  const queue = db.getQueuedSubmissions();

  if (queue.length > 0) {
    const submission = queue[0]; // Already ordered by votes
    return {
      source: 'submission',
      submissionId: submission.id,
      trackUrl: submission.track_url,
      title: submission.title,
      artist: submission.artist
    };
  }

  // No submissions, use taste-based selection
  const weights = musicService.computeCurrentWeights();
  const tasteId = chooseTasteWithSmoothing(weights);

  if (!tasteId) {
    console.log('[Scheduler] No taste available');
    return null;
  }

  const track = chooseTrackFromBucket(tasteId);

  if (!track) {
    console.log(`[Scheduler] No tracks in bucket: ${tasteId}`);
    // Try default bucket
    if (tasteId !== 'default') {
      return chooseTrackFromBucket('default');
    }
    return null;
  }

  return {
    source: 'taste',
    tasteId: tasteId,
    trackUrl: track.track_url,
    title: track.title,
    artist: track.artist,
    weights: weights
  };
}

/**
 * Choose a taste with smoothing to avoid repetition
 */
function chooseTasteWithSmoothing(weights) {
  const state = db.getSchedulerState();
  const recentTastes = state.recent_taste_ids || [];

  // Create adjusted weights
  const adjusted = { ...weights };

  // Penalize the last played taste
  const lastTaste = recentTastes[recentTastes.length - 1];
  if (lastTaste && adjusted[lastTaste]) {
    adjusted[lastTaste] *= 0.3;
  }

  // Additional penalty for tastes appearing twice in last 3
  for (const taste of Object.keys(adjusted)) {
    const recentCount = recentTastes.slice(-3).filter(t => t === taste).length;
    if (recentCount >= 2) {
      adjusted[taste] *= 0.5;
    }
  }

  // Weighted random selection
  return musicService.weightedRandomChoice(adjusted);
}

/**
 * Choose a track from a taste bucket, avoiding recent tracks
 */
function chooseTrackFromBucket(tasteId) {
  const state = db.getSchedulerState();
  const recentTracks = new Set(state.recent_track_urls || []);
  const tracks = db.getTasteTracks(tasteId);

  if (tracks.length === 0) {
    return null;
  }

  // Prefer tracks not recently played
  const available = tracks.filter(t => !recentTracks.has(t.track_url));

  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }

  // All tracks are recent, pick any
  return tracks[Math.floor(Math.random() * tracks.length)];
}

/**
 * Record the start of a play event
 */
function recordPlayStart(nextTrack) {
  // Get current presence for context
  const allPresent = db.getAllPresent();

  // For now, treat all present users as office users
  // TODO: When BLE is implemented, split into cafe vs office
  const cafeUsers = [];
  const officeUsers = allPresent;

  const weights = musicService.computeCurrentWeights();
  const volume = musicService.computeVolumeLevel();

  // Create play history entry
  const playId = db.createPlayHistory({
    trackUrl: nextTrack.trackUrl,
    title: nextTrack.title,
    artist: nextTrack.artist,
    source: nextTrack.source,
    tasteId: nextTrack.tasteId || null,
    submissionId: nextTrack.submissionId || null,
    cafeUsers: cafeUsers,
    officeUsers: officeUsers,
    weights: weights,
    volumeLevel: volume
  });

  return playId;
}

/**
 * Finalize a play event
 */
function finalizeCurrentPlay(playId, result) {
  try {
    db.run(
      `UPDATE play_history SET ended_at = datetime('now'), result = ? WHERE id = ?`,
      [result, playId]
    );

    // If it was a submission that finished playing, mark as played
    const playHistory = db.getPlayHistoryById(playId);
    if (playHistory && playHistory.source === 'submission' && playHistory.submission_id) {
      db.run(
        `UPDATE music_submissions SET status = 'played' WHERE id = ?`,
        [playHistory.submission_id]
      );
    }
  } catch (error) {
    console.error('[Scheduler] Failed to finalize play:', error.message);
  }
}

/**
 * Update recent tracks list for smoothing
 */
function updateRecentTracks(nextTrack) {
  const state = db.getSchedulerState();
  const recentTracks = state.recent_track_urls || [];
  const recentTastes = state.recent_taste_ids || [];

  // Add to recent tracks (keep last 20)
  recentTracks.push(nextTrack.trackUrl);
  if (recentTracks.length > 20) {
    recentTracks.shift();
  }

  // Add to recent tastes (keep last 5)
  if (nextTrack.tasteId) {
    recentTastes.push(nextTrack.tasteId);
    if (recentTastes.length > 5) {
      recentTastes.shift();
    }
  }

  db.updateSchedulerState({
    recent_track_urls: recentTracks,
    recent_taste_ids: recentTastes
  });
}

/**
 * Update volume based on current presence preferences
 */
async function updateVolumeIfNeeded() {
  try {
    const currentVolume = musicService.computeVolumeLevel();
    const volumeValue = musicService.getVolumeValue(currentVolume);

    // Get current Sonos volume
    const playbackState = await sonosService.getPlaybackState();

    // Only adjust if significantly different (avoid constant small adjustments)
    const diff = Math.abs((playbackState.volume || 0) - volumeValue);
    if (diff > 0.05) {
      console.log(`[Scheduler] Adjusting volume to ${currentVolume} (${volumeValue})`);
      await sonosService.setVolume(volumeValue);
    }
  } catch (error) {
    // Volume adjustment failures are not critical
    console.error('[Scheduler] Volume adjustment failed:', error.message);
  }
}

/**
 * Skip the current track (user-initiated)
 */
async function skipTrack() {
  console.log('[Scheduler] Skip requested');

  const state = db.getSchedulerState();
  if (state.current_play_id) {
    finalizeCurrentPlay(state.current_play_id, 'skipped');
    db.updateSchedulerState({ current_play_id: null });
  }

  // Play next track immediately
  await playNextTrack();
}

/**
 * Get scheduler status
 */
function getStatus() {
  const state = db.getSchedulerState();
  const connected = sonosService.isConnected();
  const sonosEntity = sonosService.getSonosEntity();

  return {
    running: !!pollInterval,
    paused: state.is_paused,
    connected: connected,
    sonosEntity: sonosEntity,
    currentPlayId: state.current_play_id,
    lastTrackUrl: state.last_track_url,
    consecutiveFailures: consecutiveFailures
  };
}

/**
 * Force play a specific track (admin/testing)
 */
async function forcePlay(trackUrl, source = 'admin') {
  console.log(`[Scheduler] Force playing: ${trackUrl}`);

  // Finalize current play if any
  const state = db.getSchedulerState();
  if (state.current_play_id) {
    finalizeCurrentPlay(state.current_play_id, 'interrupted');
  }

  const nextTrack = {
    source: source,
    trackUrl: trackUrl,
    title: null,
    artist: null
  };

  try {
    await sonosService.playTrack(trackUrl);
    const playId = recordPlayStart(nextTrack);
    lastPlayedTrackUrl = trackUrl;
    db.updateSchedulerState({
      current_play_id: playId,
      last_track_url: trackUrl
    });
    return { success: true, playId };
  } catch (error) {
    console.error('[Scheduler] Force play failed:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  start,
  stop,
  pause,
  resume,
  skipTrack,
  forcePlay,
  getStatus
};
