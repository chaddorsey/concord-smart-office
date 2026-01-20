// Map Service - Office floor plan and people positioning
// TODO: Configure actual office layout

const rooms = [
  { id: 'main', name: 'Main Area', x: 0, y: 0, width: 100, height: 100 },
  { id: 'huddle1', name: 'Huddle Room 1', x: 100, y: 0, width: 50, height: 50 },
  { id: 'huddle2', name: 'Huddle Room 2', x: 100, y: 50, width: 50, height: 50 },
  { id: 'conference', name: 'Conference Room', x: 150, y: 0, width: 75, height: 100 }
];

function getAllRooms() {
  return rooms;
}

function calculatePeoplePositions(presentPeople) {
  // Distribute people across the main area for now
  return presentPeople.map((person, index) => ({
    ...person,
    position: {
      roomId: 'main',
      x: 20 + (index % 5) * 15,
      y: 20 + Math.floor(index / 5) * 15
    }
  }));
}

function getRoomOccupancy(presentPeople) {
  // For now, put everyone in main area
  const occupancy = {};
  for (const room of rooms) {
    occupancy[room.id] = {
      room: room.name,
      count: room.id === 'main' ? presentPeople.length : 0,
      people: room.id === 'main' ? presentPeople.map(p => p.name || p.email) : []
    };
  }
  return occupancy;
}

module.exports = {
  getAllRooms,
  calculatePeoplePositions,
  getRoomOccupancy
};
