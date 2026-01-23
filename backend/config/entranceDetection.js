/**
 * Entrance Detection Configuration
 *
 * Defines profiles for detecting when a user transitions from outside to inside
 * using BLE signal strength patterns.
 */

/**
 * Entrance detection profiles
 * Each profile defines thresholds and timing for entrance state detection
 */
const ENTRANCE_PROFILES = {
  default: {
    name: 'Default',
    description: 'Standard entrance detection for typical office environments',
    // RSSI thresholds (dBm) - more negative = weaker signal
    outside_rssi_threshold: -75,   // Below this = likely outside
    inside_rssi_threshold: -55,    // Above this = likely inside
    // Timing
    door_open_duration_ms: 5000,   // Max time for outside->inside transition
    confirmation_readings: 3,      // Readings needed to confirm state change
    debounce_ms: 1000,             // Minimum time between state changes
    // Auto-checkout
    absence_warning_ms: 15 * 60 * 1000,  // 15 minutes - trigger MAYBE_OUT
    absence_checkout_ms: 20 * 60 * 1000  // 20 minutes - auto checkout
  },

  sensitive: {
    name: 'Sensitive',
    description: 'More responsive detection for quick transitions',
    outside_rssi_threshold: -80,
    inside_rssi_threshold: -50,
    door_open_duration_ms: 7000,
    confirmation_readings: 2,
    debounce_ms: 500,
    absence_warning_ms: 10 * 60 * 1000,
    absence_checkout_ms: 15 * 60 * 1000
  },

  relaxed: {
    name: 'Relaxed',
    description: 'Less sensitive detection for noisy RF environments',
    outside_rssi_threshold: -70,
    inside_rssi_threshold: -60,
    door_open_duration_ms: 10000,
    confirmation_readings: 5,
    debounce_ms: 2000,
    absence_warning_ms: 30 * 60 * 1000,
    absence_checkout_ms: 45 * 60 * 1000
  }
};

/**
 * Entrance states
 */
const ENTRANCE_STATES = {
  UNKNOWN: 'unknown',
  OUTSIDE: 'outside',
  TRANSITIONING: 'transitioning',
  INSIDE: 'inside'
};

/**
 * Get a profile by name
 * @param {string} profileName - Profile name
 * @returns {Object} Profile configuration
 */
function getProfile(profileName) {
  return ENTRANCE_PROFILES[profileName] || ENTRANCE_PROFILES.default;
}

/**
 * Get all available profiles
 * @returns {Object} All profiles
 */
function getAllProfiles() {
  return Object.entries(ENTRANCE_PROFILES).map(([id, profile]) => ({
    id,
    name: profile.name,
    description: profile.description
  }));
}

/**
 * Determine entrance state from RSSI reading
 * @param {number} rssi - RSSI value in dBm
 * @param {Object} profile - Profile configuration
 * @returns {string} Suggested state
 */
function suggestStateFromRssi(rssi, profile) {
  if (rssi >= profile.inside_rssi_threshold) {
    return ENTRANCE_STATES.INSIDE;
  } else if (rssi <= profile.outside_rssi_threshold) {
    return ENTRANCE_STATES.OUTSIDE;
  }
  return ENTRANCE_STATES.TRANSITIONING;
}

module.exports = {
  ENTRANCE_PROFILES,
  ENTRANCE_STATES,
  getProfile,
  getAllProfiles,
  suggestStateFromRssi
};
