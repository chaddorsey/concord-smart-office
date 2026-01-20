// MBTA Train Schedule Service - Stub implementation
// TODO: Implement actual MBTA API integration

const CONCORD_STOP_ID = 'place-cntsq'; // Concord station

async function getPredictions() {
  // Return empty predictions for now
  return [];
}

function formatMinutesUntil(minutes) {
  if (minutes < 1) return 'Now';
  if (minutes === 1) return '1 min';
  return `${Math.round(minutes)} mins`;
}

module.exports = {
  CONCORD_STOP_ID,
  getPredictions,
  formatMinutesUntil
};
