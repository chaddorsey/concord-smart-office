/**
 * Map Service - Office floor plan and people positioning
 *
 * Provides positioning data for the dashboard map overlay.
 * Integrates with BLE beacon tracking for signal certainty.
 */

const db = require('../db');

/**
 * Get all rooms from the database
 * @returns {Array} Room objects with position data
 */
function getAllRooms() {
  return db.getAllRooms();
}

/**
 * Calculate signal certainty based on RSSI and time since last seen
 * @param {string|null} lastSeenAt - ISO timestamp of last beacon sighting
 * @param {number|null} lastRssi - Last RSSI value (-30 to -100 typical)
 * @returns {number} Certainty value 0-1
 */
function calculateSignalCertainty(lastSeenAt, lastRssi) {
  if (!lastSeenAt || !lastRssi) return 0;

  const MAX_ABSENCE_MS = 5 * 60 * 1000; // 5 minutes = certainty drops to 0
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();

  // Age factor: 1.0 at 0ms, 0.0 at MAX_ABSENCE_MS
  const ageFactor = Math.max(0, 1 - (ageMs / MAX_ABSENCE_MS));

  // RSSI factor: -30 dBm (very strong) = 1.0, -90 dBm (very weak) = 0.0
  const rssiFactor = Math.max(0, Math.min(1, (lastRssi + 90) / 60));

  return ageFactor * rssiFactor;
}

/**
 * Calculate people positions for the map overlay
 * Separates people into located (have room_id) and unlocated (checked in but no room)
 *
 * @param {Array} presentPeople - Array of presence records from getAllPresent()
 * @returns {Object} { located: [...], unlocated: [...] }
 */
function calculatePeoplePositions(presentPeople) {
  const rooms = db.getAllRooms();
  const roomMap = new Map(rooms.map(r => [r.id, r]));

  // Track how many people are in each room for offset calculation
  const roomOccupancy = new Map();

  const located = [];
  const unlocated = [];

  for (const person of presentPeople) {
    // Get beacon info if user has one
    const beacon = person.user_id ? db.getBeaconByUser(person.user_id) : null;
    const isTracked = beacon && beacon.last_room_id;

    // Use beacon's room_id if available, otherwise presence room_id
    const roomId = beacon?.last_room_id || person.room_id;
    const room = roomId ? roomMap.get(roomId) : null;

    // Calculate signal certainty for BLE-tracked users
    const signalCertainty = isTracked
      ? calculateSignalCertainty(beacon.last_seen_at, beacon.last_rssi)
      : 0;

    const personData = {
      user_id: person.user_id,
      user_name: person.user_name || person.name,
      user_email: person.user_email || person.email,
      avatar_url: person.avatar_url,
      checked_in_at: person.checked_in_at,
      is_tracked: !!isTracked,
      signal_certainty: signalCertainty
    };

    if (room) {
      // Calculate position within room
      const occupancyCount = roomOccupancy.get(roomId) || 0;
      roomOccupancy.set(roomId, occupancyCount + 1);

      // Distribute people in a grid within the room
      const offsetX = (occupancyCount % 3) * 3;
      const offsetY = Math.floor(occupancyCount / 3) * 3;

      // SVG viewBox is 1776 x 590 - convert pixel coords to percentages
      const SVG_WIDTH = 1776;
      const SVG_HEIGHT = 590;

      located.push({
        ...personData,
        room: room.name,
        room_id: roomId,
        position: {
          // Convert room center coordinates to percentage of SVG viewBox
          x: room.center_x !== null ? ((room.center_x + offsetX) / SVG_WIDTH) * 100 : 50,
          y: room.center_y !== null ? ((room.center_y + offsetY) / SVG_HEIGHT) * 100 : 50
        },
        roomColor: getRoomColor(roomId)
      });
    } else {
      // No room assigned - goes in unlocated list
      unlocated.push({
        ...personData,
        room: null,
        room_id: null
      });
    }
  }

  return { located, unlocated };
}

/**
 * Get a color for a room (for visual distinction on map)
 * @param {string} roomId - Room identifier
 * @returns {string} Hex color code
 */
function getRoomColor(roomId) {
  const colors = {
    museum: '#0693e3',
    cafe: '#00d084',
    shop: '#9b51e0',
    bubble: '#ff6900',
    aviary: '#00d084',
    wonder: '#fcb900',
    workstations: '#0693e3'
  };
  return colors[roomId] || '#666666';
}

/**
 * Get room occupancy counts
 * @param {Array} presentPeople - Array of presence records
 * @returns {Object} Room occupancy data
 */
function getRoomOccupancy(presentPeople) {
  const rooms = db.getAllRooms();
  const occupancy = {};

  // Initialize all rooms with 0 count
  for (const room of rooms) {
    occupancy[room.id] = {
      room: room.name,
      count: 0,
      people: []
    };
  }

  // Count people per room
  for (const person of presentPeople) {
    const beacon = person.user_id ? db.getBeaconByUser(person.user_id) : null;
    const roomId = beacon?.last_room_id || person.room_id;

    if (roomId && occupancy[roomId]) {
      occupancy[roomId].count++;
      occupancy[roomId].people.push(person.user_name || person.user_email);
    }
  }

  return occupancy;
}

module.exports = {
  getAllRooms,
  calculatePeoplePositions,
  calculateSignalCertainty,
  getRoomOccupancy,
  getRoomColor
};
