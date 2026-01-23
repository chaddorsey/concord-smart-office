/**
 * BLE Beacon Service
 *
 * Manages BLE beacon registration, claiming, sightings, and entrance detection.
 * Implements a state machine for detecting when users enter/exit the office.
 */

const db = require('../db');
const { getProfile, suggestStateFromRssi, ENTRANCE_STATES } = require('../config/entranceDetection');
const presenceService = require('./presenceService');

// In-memory state machines for each beacon (keyed by beacon ID)
const beaconStateMachines = new Map();

/**
 * Entrance State Machine
 * Tracks the state of a beacon as it transitions from outside to inside
 */
class EntranceStateMachine {
  constructor(beaconId, profile) {
    this.beaconId = beaconId;
    this.profile = profile;
    this.state = ENTRANCE_STATES.UNKNOWN;
    this.rssiHistory = [];
    this.lastStateChange = null;
    this.transitionStartTime = null;
    this.confirmationCount = 0;
    this.pendingState = null;
  }

  /**
   * Process a new RSSI sighting
   * @param {number} rssi - RSSI value
   * @param {string} proxyId - Proxy that saw the beacon
   * @returns {Object} State change info { stateChanged, newState, shouldCheckIn, shouldCheckOut }
   */
  processSighting(rssi, proxyId) {
    const now = Date.now();
    const suggestedState = suggestStateFromRssi(rssi, this.profile);

    // Add to history (keep last 10 readings)
    this.rssiHistory.push({ rssi, timestamp: now, proxyId });
    if (this.rssiHistory.length > 10) {
      this.rssiHistory.shift();
    }

    // Check debounce
    if (this.lastStateChange && (now - this.lastStateChange) < this.profile.debounce_ms) {
      return { stateChanged: false, newState: this.state };
    }

    let result = { stateChanged: false, newState: this.state, shouldCheckIn: false, shouldCheckOut: false };

    // State machine logic
    switch (this.state) {
      case ENTRANCE_STATES.UNKNOWN:
        // Initialize to suggested state
        this.state = suggestedState;
        this.lastStateChange = now;
        result.stateChanged = true;
        result.newState = this.state;
        if (this.state === ENTRANCE_STATES.INSIDE) {
          result.shouldCheckIn = true;
        }
        break;

      case ENTRANCE_STATES.OUTSIDE:
        if (suggestedState === ENTRANCE_STATES.TRANSITIONING || suggestedState === ENTRANCE_STATES.INSIDE) {
          // Start transition
          if (!this.transitionStartTime) {
            this.transitionStartTime = now;
            this.pendingState = ENTRANCE_STATES.TRANSITIONING;
            this.confirmationCount = 1;
          } else if (suggestedState === ENTRANCE_STATES.INSIDE) {
            this.confirmationCount++;
            if (this.confirmationCount >= this.profile.confirmation_readings) {
              // Confirmed inside
              this.state = ENTRANCE_STATES.INSIDE;
              this.lastStateChange = now;
              this.transitionStartTime = null;
              this.confirmationCount = 0;
              result.stateChanged = true;
              result.newState = this.state;
              result.shouldCheckIn = true;
            }
          }
          // Check if transition timed out
          if (this.transitionStartTime && (now - this.transitionStartTime) > this.profile.door_open_duration_ms) {
            // Transition timed out, stay outside
            this.transitionStartTime = null;
            this.confirmationCount = 0;
          }
        }
        break;

      case ENTRANCE_STATES.TRANSITIONING:
        if (suggestedState === ENTRANCE_STATES.INSIDE) {
          this.confirmationCount++;
          if (this.confirmationCount >= this.profile.confirmation_readings) {
            this.state = ENTRANCE_STATES.INSIDE;
            this.lastStateChange = now;
            this.transitionStartTime = null;
            this.confirmationCount = 0;
            result.stateChanged = true;
            result.newState = this.state;
            result.shouldCheckIn = true;
          }
        } else if (suggestedState === ENTRANCE_STATES.OUTSIDE) {
          // Went back outside
          this.state = ENTRANCE_STATES.OUTSIDE;
          this.lastStateChange = now;
          this.transitionStartTime = null;
          this.confirmationCount = 0;
          result.stateChanged = true;
          result.newState = this.state;
        }
        break;

      case ENTRANCE_STATES.INSIDE:
        if (suggestedState === ENTRANCE_STATES.OUTSIDE) {
          this.confirmationCount++;
          if (this.confirmationCount >= this.profile.confirmation_readings) {
            this.state = ENTRANCE_STATES.OUTSIDE;
            this.lastStateChange = now;
            this.confirmationCount = 0;
            result.stateChanged = true;
            result.newState = this.state;
            result.shouldCheckOut = true;
          }
        } else {
          // Reset confirmation count if still inside
          this.confirmationCount = 0;
        }
        break;
    }

    return result;
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Force a state (for testing/admin)
   */
  forceState(newState) {
    this.state = newState;
    this.lastStateChange = Date.now();
    this.confirmationCount = 0;
    this.transitionStartTime = null;
  }
}

/**
 * Get or create state machine for a beacon
 * @param {number} beaconId - Beacon ID
 * @returns {EntranceStateMachine} State machine instance
 */
function getStateMachine(beaconId) {
  if (!beaconStateMachines.has(beaconId)) {
    const beacon = db.getBeaconById(beaconId);
    const profileName = beacon?.entrance_profile || 'default';
    const profile = getProfile(profileName);
    beaconStateMachines.set(beaconId, new EntranceStateMachine(beaconId, profile));
  }
  return beaconStateMachines.get(beaconId);
}

/**
 * Register a new beacon
 * @param {Object} beaconData - Beacon registration data
 * @returns {Object} Created beacon
 */
function registerBeacon({ macAddress, beaconUuid, major, minor, friendlyName }) {
  return db.registerBeacon({ macAddress, beaconUuid, major, minor, friendlyName });
}

/**
 * Get beacon by MAC address
 * @param {string} macAddress - MAC address
 * @returns {Object|null} Beacon or null
 */
function getBeaconByMac(macAddress) {
  return db.getBeaconByMac(macAddress);
}

/**
 * Get beacon by user ID
 * @param {number} userId - User ID
 * @returns {Object|null} Beacon or null
 */
function getBeaconByUser(userId) {
  return db.getBeaconByUser(userId);
}

/**
 * Get all unclaimed beacons
 * @returns {Array} Unclaimed beacons
 */
function getUnclaimedBeacons() {
  return db.getUnclaimedBeacons();
}

/**
 * Get all beacons
 * @returns {Array} All beacons
 */
function getAllBeacons() {
  return db.getAllBeacons();
}

/**
 * Claim a beacon for a user
 * @param {number} beaconId - Beacon ID
 * @param {number} userId - User ID
 * @returns {Object|null} Updated beacon or null if already claimed
 */
function claimBeacon(beaconId, userId) {
  // First unclaim any existing beacon for this user
  const existingBeacon = db.getBeaconByUser(userId);
  if (existingBeacon) {
    db.unclaimBeacon(existingBeacon.id);
    beaconStateMachines.delete(existingBeacon.id);
  }

  const result = db.claimBeacon(beaconId, userId);
  if (result) {
    // Initialize state machine for the claimed beacon
    getStateMachine(beaconId);
  }
  return result;
}

/**
 * Claim a beacon by MAC address
 * @param {string} macAddress - MAC address from QR code
 * @param {number} userId - User ID
 * @returns {Object|null} Updated beacon or null
 */
function claimBeaconByMac(macAddress, userId) {
  let beacon = db.getBeaconByMac(macAddress);

  // Auto-register if not found
  if (!beacon) {
    beacon = registerBeacon({ macAddress, friendlyName: `Beacon ${macAddress.slice(-5)}` });
  }

  if (beacon.claimed_by_user_id && beacon.claimed_by_user_id !== userId) {
    return null; // Already claimed by someone else
  }

  return claimBeacon(beacon.id, userId);
}

/**
 * Unclaim a beacon
 * @param {number} beaconId - Beacon ID
 * @returns {boolean} True if unclaimed
 */
function unclaimBeacon(beaconId) {
  beaconStateMachines.delete(beaconId);
  return db.unclaimBeacon(beaconId);
}

/**
 * Delete a beacon
 * @param {number} beaconId - Beacon ID
 * @returns {boolean} True if deleted
 */
function deleteBeacon(beaconId) {
  beaconStateMachines.delete(beaconId);
  return db.deleteBeacon(beaconId);
}

/**
 * Process a beacon sighting from a BLE proxy
 * @param {string} macAddress - Beacon MAC address
 * @param {string} proxyId - Proxy ID that saw the beacon
 * @param {number} rssi - Signal strength
 * @returns {Object} Processing result
 */
async function processSighting(macAddress, proxyId, rssi) {
  // Find beacon
  let beacon = db.getBeaconByMac(macAddress);
  if (!beacon) {
    // Unknown beacon - ignore for now (could auto-register in future)
    return { processed: false, reason: 'unknown_beacon' };
  }

  // Get proxy info to determine room
  const proxy = db.getBleProxyById(proxyId);
  const roomId = proxy?.room_id || null;

  // Record sighting
  db.recordBeaconSighting({
    beaconId: beacon.id,
    proxyId,
    roomId,
    rssi
  });

  // If beacon is claimed, process entrance state
  if (beacon.claimed_by_user_id) {
    const stateMachine = getStateMachine(beacon.id);
    const result = stateMachine.processSighting(rssi, proxyId);

    // Update beacon's entrance state in DB
    if (result.stateChanged) {
      db.updateBeaconEntranceState(beacon.id, result.newState);
    }

    // Handle check-in/out
    if (result.shouldCheckIn) {
      try {
        await presenceService.checkIn(beacon.claimed_by_user_id, 'ble', roomId);
        console.log(`[Beacon] Auto check-in for user ${beacon.claimed_by_user_id} via BLE`);
      } catch (error) {
        console.error(`[Beacon] Failed to auto check-in user ${beacon.claimed_by_user_id}:`, error.message);
      }
    }

    if (result.shouldCheckOut) {
      try {
        await presenceService.checkOut(beacon.claimed_by_user_id, 'ble');
        console.log(`[Beacon] Auto check-out for user ${beacon.claimed_by_user_id} via BLE`);
      } catch (error) {
        console.error(`[Beacon] Failed to auto check-out user ${beacon.claimed_by_user_id}:`, error.message);
      }
    }

    return {
      processed: true,
      beaconId: beacon.id,
      userId: beacon.claimed_by_user_id,
      ...result
    };
  }

  return { processed: true, beaconId: beacon.id, userId: null };
}

/**
 * Get entrance state for a beacon
 * @param {number} beaconId - Beacon ID
 * @returns {string} Current entrance state
 */
function getEntranceState(beaconId) {
  const stateMachine = beaconStateMachines.get(beaconId);
  if (stateMachine) {
    return stateMachine.getState();
  }

  const beacon = db.getBeaconById(beaconId);
  return beacon?.entrance_state || ENTRANCE_STATES.UNKNOWN;
}

/**
 * Set entrance detection profile for a beacon
 * @param {number} beaconId - Beacon ID
 * @param {string} profileName - Profile name
 * @returns {Object|null} Updated beacon
 */
function setEntranceProfile(beaconId, profileName) {
  const profile = getProfile(profileName);
  if (!profile) {
    throw new Error(`Unknown profile: ${profileName}`);
  }

  // Update in database
  db.run('UPDATE beacons SET entrance_profile = ? WHERE id = ?', [profileName, beaconId]);

  // Reset state machine with new profile
  beaconStateMachines.delete(beaconId);
  getStateMachine(beaconId);

  return db.getBeaconById(beaconId);
}

/**
 * Get all entrance profiles
 * @returns {Array} Available profiles
 */
function getEntranceProfiles() {
  const { getAllProfiles } = require('../config/entranceDetection');
  return getAllProfiles();
}

/**
 * Calculate signal certainty for a beacon
 * Used for dashboard display (fading effect)
 * @param {number} beaconId - Beacon ID
 * @returns {number} Certainty value 0-1
 */
function calculateSignalCertainty(beaconId) {
  const beacon = db.getBeaconById(beaconId);
  if (!beacon || !beacon.last_seen_at) {
    return 0;
  }

  const MAX_ABSENCE_MS = 15 * 60 * 1000; // 15 minutes
  const ageMs = Date.now() - new Date(beacon.last_seen_at).getTime();
  const ageFactor = Math.max(0, 1 - (ageMs / MAX_ABSENCE_MS));

  // RSSI factor: -90 to -50 dBm -> 0 to 1
  const rssiFactor = beacon.last_rssi
    ? Math.max(0, Math.min(1, (beacon.last_rssi + 90) / 40))
    : 0.5;

  return ageFactor * rssiFactor;
}

/**
 * Get presence map data with BLE tracking info
 * @returns {Array} People with positions and tracking info
 */
function getMapData() {
  const present = db.getAllPresent();
  const rooms = db.getAllRooms();
  const roomMap = new Map(rooms.map(r => [r.id, r]));

  return present.map(p => {
    const beacon = db.getBeaconByUser(p.user_id);
    const room = beacon?.last_room_id ? roomMap.get(beacon.last_room_id) : null;
    const certainty = beacon ? calculateSignalCertainty(beacon.id) : 0;

    return {
      user_id: p.user_id,
      first_name: p.user_name?.split(' ')[0] || 'Unknown',
      full_name: p.user_name,
      room_id: beacon?.last_room_id || null,
      position: room ? { x: room.center_x, y: room.center_y } : null,
      signal_certainty: certainty,
      is_tracked: !!beacon,
      checked_in_at: p.checked_in_at
    };
  });
}

module.exports = {
  registerBeacon,
  getBeaconByMac,
  getBeaconByUser,
  getUnclaimedBeacons,
  getAllBeacons,
  claimBeacon,
  claimBeaconByMac,
  unclaimBeacon,
  deleteBeacon,
  processSighting,
  getEntranceState,
  setEntranceProfile,
  getEntranceProfiles,
  calculateSignalCertainty,
  getMapData,
  ENTRANCE_STATES
};
