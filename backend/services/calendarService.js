// Calendar Service - Stub implementation
// TODO: Integrate with Google Calendar API

const configuredRooms = ['Huddle Room 1', 'Huddle Room 2', 'Conference Room'];

function isConfigured() {
  return false; // No calendar integration configured yet
}

function getConfiguredRooms() {
  return configuredRooms;
}

async function getUpcomingEvents() {
  // Return empty events until calendar is configured
  return [];
}

async function getRoomEvents(roomName) {
  return [];
}

async function getNextEventByRoom() {
  const result = {};
  for (const room of configuredRooms) {
    result[room] = null;
  }
  return result;
}

async function isRoomBusy(roomName) {
  return false;
}

module.exports = {
  isConfigured,
  getConfiguredRooms,
  getUpcomingEvents,
  getRoomEvents,
  getNextEventByRoom,
  isRoomBusy
};
