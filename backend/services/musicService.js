/**
 * Music Control Service
 * Handles taste preferences, submissions, voting, and playback scheduling
 */

const db = require('../db');

// Volume level mappings (0.0 - 1.0)
const VOLUME_LEVELS = {
  super_quiet: 0.07,
  soft: 0.11,
  medium: 0.18
};

/**
 * Get all available tastes
 */
function getTastes() {
  return db.getAllTastes();
}

/**
 * Get user's taste preferences
 */
function getUserPreferences(userId) {
  const tastes = db.getUserTastes(userId);
  const volume = db.getUserVolume(userId);
  return { tastes, volume };
}

/**
 * Set user's taste preferences (up to 3)
 */
function setUserTastes(userId, tasteIds) {
  // Validate taste IDs
  const validTastes = db.getAllTastes().map(t => t.id);
  const invalidTastes = tasteIds.filter(t => !validTastes.includes(t));

  if (invalidTastes.length > 0) {
    throw new Error(`Invalid taste IDs: ${invalidTastes.join(', ')}`);
  }

  if (tasteIds.length > 3) {
    throw new Error('Maximum 3 tastes allowed');
  }

  return db.setUserTastes(userId, tasteIds);
}

/**
 * Set user's volume preference
 */
function setUserVolume(userId, volume) {
  return db.setUserVolume(userId, volume);
}

const spotifyMetadata = require('./spotifyMetadata');

/**
 * Submit a track to the queue
 * Automatically fetches metadata if title/artist not provided
 */
async function submitTrack(userId, trackUrl, title = null, artist = null, thumbnail = null) {
  // Validate URL format
  if (!isValidSpotifyUrl(trackUrl)) {
    throw new Error('Invalid Spotify track URL');
  }

  // If title/artist/thumbnail not provided, try to fetch from Spotify
  if (!title || !artist || !thumbnail) {
    try {
      const metadata = await spotifyMetadata.fetchTrackMetadata(trackUrl);
      if (metadata) {
        title = title || metadata.title;
        artist = artist || metadata.artist;
        thumbnail = thumbnail || metadata.thumbnail;
        console.log(`[Music] Fetched metadata: "${title}" by ${artist}, thumbnail: ${thumbnail ? 'yes' : 'no'}`);
      }
    } catch (error) {
      console.warn('[Music] Failed to fetch track metadata:', error.message);
      // Continue without metadata - user can still submit
    }
  }

  return db.createSubmission({
    trackUrl,
    title,
    artist,
    thumbnail,
    submittedByUserId: userId
  });
}

/**
 * Get the submission queue (ordered by votes)
 */
function getQueue() {
  return db.getQueuedSubmissions();
}

/**
 * Vote on a submission
 * @param {number} userId - User ID
 * @param {number} submissionId - Submission ID
 * @param {number} value - Vote value: 1 (upvote), -1 (downvote), 0 (remove vote)
 */
function vote(userId, submissionId, value) {
  // Verify submission exists and is queued
  const submission = db.getSubmissionById(submissionId);
  if (!submission) {
    throw new Error('Submission not found');
  }
  if (submission.status !== 'queued') {
    throw new Error('Cannot vote on non-queued submissions');
  }

  return db.voteOnSubmission(submissionId, userId, value);
}

/**
 * Remove own submission from queue
 */
function removeSubmission(userId, submissionId) {
  const success = db.deleteSubmission(submissionId, userId);
  if (!success) {
    throw new Error('Cannot delete: submission not found, not yours, or already played');
  }
  return { success: true };
}

/**
 * Get now playing info
 */
function getNowPlaying() {
  const state = db.getSchedulerState();

  if (!state.current_play_id) {
    return null;
  }

  const playHistory = db.getPlayHistoryById(state.current_play_id);
  if (!playHistory || playHistory.result !== 'playing') {
    return null;
  }

  return {
    track_url: playHistory.track_url,
    title: playHistory.title,
    artist: playHistory.artist,
    thumbnail: playHistory.album_art,
    source: playHistory.source,
    taste_id: playHistory.taste_id,
    started_at: playHistory.started_at
  };
}

/**
 * Get upcoming tracks preview
 * Returns submitted tracks (deterministic) + taste preview (probabilistic)
 */
function getUpcoming(count = 10) {
  const queue = db.getQueuedSubmissions();
  const upcoming = [];

  // Add queued submissions
  for (const submission of queue.slice(0, count)) {
    upcoming.push({
      source: 'submission',
      track_url: submission.track_url,
      title: submission.title,
      artist: submission.artist,
      thumbnail: submission.thumbnail,
      submitted_by: submission.submitted_by_name,
      upvotes: submission.upvotes,
      downvotes: submission.downvotes
    });
  }

  // If we need more, add taste preview
  const remaining = count - upcoming.length;
  if (remaining > 0) {
    const tastePreview = generateTastePreview(remaining);
    upcoming.push(...tastePreview);
  }

  return upcoming;
}

/**
 * Generate a preview of taste-based tracks
 * This is probabilistic based on current weights
 */
function generateTastePreview(count) {
  const preview = [];
  const state = db.getSchedulerState();
  const weights = computeCurrentWeights();

  // Get tracks from each taste bucket
  const tracksByTaste = {};
  for (const tasteId of Object.keys(weights)) {
    tracksByTaste[tasteId] = db.getTasteTracks(tasteId);
  }

  // Generate preview picks
  const recentTracks = new Set(state.recent_track_urls);

  for (let i = 0; i < count; i++) {
    const tasteId = weightedRandomChoice(weights);
    const tracks = tracksByTaste[tasteId] || [];

    // Filter out recently played
    const available = tracks.filter(t => !recentTracks.has(t.track_url));

    if (available.length > 0) {
      const track = available[Math.floor(Math.random() * available.length)];
      preview.push({
        source: 'taste',
        taste_id: tasteId,
        track_url: track.track_url,
        title: track.title,
        artist: track.artist,
        thumbnail: track.album_art,
        preview: true // Indicates this is probabilistic
      });
      recentTracks.add(track.track_url);
    } else if (tracks.length > 0) {
      // Allow repeat if nothing else available
      const track = tracks[Math.floor(Math.random() * tracks.length)];
      preview.push({
        source: 'taste',
        taste_id: tasteId,
        track_url: track.track_url,
        title: track.title,
        artist: track.artist,
        thumbnail: track.album_art,
        preview: true
      });
    }
  }

  return preview;
}

/**
 * Compute current weights based on presence
 * Cafe users take priority; fallback to office users
 */
function computeCurrentWeights() {
  // Get presence data
  const allPresent = db.getAllPresent();

  // For now, without BLE, treat all present users as "office" users
  // TODO: When BLE is implemented, split into cafe vs office
  const cafeUsers = []; // Will be populated by BLE
  const officeUsers = allPresent;

  // Use cafe users if any, otherwise office users
  const listeners = cafeUsers.length > 0 ? cafeUsers : officeUsers;

  return computeWeightsFromListeners(listeners);
}

/**
 * Compute taste weights from a list of listeners
 */
function computeWeightsFromListeners(listeners) {
  const votes = {};

  if (listeners.length === 0) {
    // No one present, use default
    return { default: 1.0 };
  }

  for (const listener of listeners) {
    const tastes = db.getUserTastes(listener.user_id);

    if (tastes.length === 0) {
      // No preferences, contribute to default
      votes['default'] = (votes['default'] || 0) + 1.0;
    } else {
      // Split contribution across their tastes
      const share = 1.0 / tastes.length;
      for (const taste of tastes) {
        votes[taste] = (votes[taste] || 0) + share;
      }
    }
  }

  // Normalize to sum to 1.0
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  const normalized = {};
  for (const [taste, weight] of Object.entries(votes)) {
    normalized[taste] = weight / total;
  }

  return normalized;
}

/**
 * Compute volume level based on present users' preferences
 */
function computeVolumeLevel() {
  const allPresent = db.getAllPresent();

  if (allPresent.length === 0) {
    return 'medium'; // Default when no one present
  }

  // Get volume preferences for all present users
  const volumes = allPresent.map(p => db.getUserVolume(p.user_id));

  // Use the quietest preference (most conservative)
  const volumeOrder = ['super_quiet', 'soft', 'medium'];
  let quietest = 'medium';

  for (const vol of volumes) {
    if (volumeOrder.indexOf(vol) < volumeOrder.indexOf(quietest)) {
      quietest = vol;
    }
  }

  return quietest;
}

/**
 * Get the numeric volume level for Sonos
 */
function getVolumeValue(volumeLevel) {
  return VOLUME_LEVELS[volumeLevel] || VOLUME_LEVELS.medium;
}

/**
 * Get play history
 */
function getHistory(limit = 20) {
  const history = db.getRecentPlayHistory(limit);
  // Map album_art to thumbnail for PWA compatibility
  return history.map(h => ({
    ...h,
    thumbnail: h.album_art
  }));
}

/**
 * Get music stats
 */
function getStats() {
  const history = db.getRecentPlayHistory(100);
  const queue = db.getQueuedSubmissions();
  const state = db.getSchedulerState();

  const tastePlayCounts = {};
  const submissionCount = history.filter(h => h.source === 'submission').length;

  for (const play of history) {
    if (play.source === 'taste' && play.taste_id) {
      tastePlayCounts[play.taste_id] = (tastePlayCounts[play.taste_id] || 0) + 1;
    }
  }

  return {
    scheduler_running: state.is_running,
    scheduler_paused: state.is_paused,
    queue_length: queue.length,
    recent_plays: history.length,
    submissions_played: submissionCount,
    taste_distribution: tastePlayCounts,
    current_weights: computeCurrentWeights(),
    current_volume: computeVolumeLevel()
  };
}

// ----------------------------------------------------------------------------
// Utility Functions
// ----------------------------------------------------------------------------

/**
 * Validate Spotify URL format
 */
function isValidSpotifyUrl(url) {
  if (!url) return false;

  // Accept spotify:track:ID format
  if (/^spotify:track:[a-zA-Z0-9]+$/.test(url)) {
    return true;
  }

  // Accept https://open.spotify.com/track/ID format
  if (/^https?:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/.test(url)) {
    return true;
  }

  return false;
}

/**
 * Weighted random choice from a weights object
 */
function weightedRandomChoice(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);

  let random = Math.random() * total;

  for (const [key, weight] of entries) {
    random -= weight;
    if (random <= 0) {
      return key;
    }
  }

  // Fallback to first key
  return entries[0]?.[0] || 'default';
}

module.exports = {
  // Tastes and preferences
  getTastes,
  getUserPreferences,
  setUserTastes,
  setUserVolume,

  // Submissions and voting
  submitTrack,
  getQueue,
  vote,
  removeSubmission,

  // Playback info
  getNowPlaying,
  getUpcoming,
  getHistory,
  getStats,

  // Weight computation (used by scheduler)
  computeCurrentWeights,
  computeWeightsFromListeners,
  computeVolumeLevel,
  getVolumeValue,

  // Utilities
  isValidSpotifyUrl,
  weightedRandomChoice,

  // Constants
  VOLUME_LEVELS
};
