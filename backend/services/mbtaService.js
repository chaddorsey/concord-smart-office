/**
 * MBTA Train Schedule Service
 *
 * Fetches real-time predictions for Concord commuter rail station
 * on the Fitchburg Line (CR-Fitchburg).
 */

const MBTA_API_KEY = process.env.MBTA_API_KEY || '9aff12d4f48449a4b533fe7e14646960';
const MBTA_BASE_URL = 'https://api-v3.mbta.com';

// Concord station on Fitchburg Line
const CONCORD_STOP_ID = 'place-FR-0201';
const FITCHBURG_ROUTE = 'CR-Fitchburg';

// Key stops for arrival times
const PORTER_STOP_ID = 'place-portr';  // Porter Square (inbound)
const FITCHBURG_STOP_ID = 'place-FR-0494';  // Fitchburg (outbound)
const WACHUSETT_STOP_ID = 'place-FR-3338';  // Wachusett (outbound terminus)

// Key stops for display
const STOPS = {
  'place-north': { name: 'North Station', abbrev: 'North Sta' },
  'place-portr': { name: 'Porter Square', abbrev: 'Porter' },
  'place-FR-0201': { name: 'Concord', abbrev: 'Concord' },
  'place-FR-0219': { name: 'West Concord', abbrev: 'W. Concord' },
  'place-FR-0253': { name: 'South Acton', abbrev: 'S. Acton' },
  'place-FR-0301': { name: 'Littleton/Route 495', abbrev: 'Littleton' },
  'place-FR-0361': { name: 'Ayer', abbrev: 'Ayer' },
  'place-FR-0494': { name: 'Fitchburg', abbrev: 'Fitchburg' },
  'place-FR-3338': { name: 'Wachusett', abbrev: 'Wachusett' },
};

// Direction mapping (base - outbound terminus determined per-trip)
const DIRECTIONS = {
  0: { name: 'Outbound', arrow: '→' },
  1: { name: 'Inbound', arrow: '←', terminus: 'North Station', arrivalStop: PORTER_STOP_ID, arrivalStopName: 'Porter Square' }
};

/**
 * Make authenticated request to MBTA API
 */
async function mbtaFetch(endpoint, params = {}) {
  const url = new URL(`${MBTA_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': MBTA_API_KEY,
      'Accept': 'application/vnd.api+json'
    }
  });

  if (!response.ok) {
    throw new Error(`MBTA API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get current time in Eastern timezone
 */
function getEasternNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

/**
 * Get today's date in Eastern timezone as YYYY-MM-DD
 */
function getEasternDateString() {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // en-CA gives YYYY-MM-DD
}

/**
 * Get current time in Eastern timezone as HH:MM
 */
function getEasternTimeString() {
  const now = new Date();
  return now.toLocaleTimeString('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Get real-time predictions for Concord station
 */
async function getPredictions() {
  try {
    // Get predictions for Concord station on Fitchburg line
    const data = await mbtaFetch('/predictions', {
      'filter[stop]': CONCORD_STOP_ID,
      'filter[route]': FITCHBURG_ROUTE,
      'sort': 'departure_time',
      'include': 'trip,schedule,route'
    });

    if (!data.data || data.data.length === 0) {
      // Fall back to schedule if no predictions
      return getSchedule();
    }

    const now = new Date();
    const predictions = await Promise.all(
      data.data
        .filter(pred => {
          const depTime = pred.attributes.departure_time;
          return depTime && new Date(depTime) > now;
        })
        .slice(0, 10)
        .map(async pred => {
          const attrs = pred.attributes;
          const depTime = new Date(attrs.departure_time);
          const directionId = attrs.direction_id;
          const direction = DIRECTIONS[directionId] || DIRECTIONS[1];
          const tripId = pred.relationships?.trip?.data?.id;

          // Get arrival time and terminus info
          const arrivalInfo = tripId ? await getArrivalTime(tripId, directionId) : null;

          return {
            id: pred.id,
            departureTime: depTime.toISOString(),
            departureTimeFormatted: formatTime(depTime),
            minutesUntil: Math.round((depTime - now) / 60000),
            direction: direction.name,
            directionArrow: direction.arrow,
            destination: arrivalInfo?.terminus || direction.terminus || 'Unknown',
            arrivalStopName: arrivalInfo?.arrivalStopName || direction.arrivalStopName,
            arrivalTime: arrivalInfo?.time,
            arrivalTimeFormatted: arrivalInfo?.formatted,
            status: attrs.status || 'On time',
            tripId
          };
        })
    );

    return predictions.filter(pred => pred.minutesUntil >= 0);
  } catch (error) {
    console.error('[MBTA] Predictions error:', error.message);
    return getSchedule();
  }
}

/**
 * Get arrival time at destination stop for a trip
 * Fetches all stops for the trip to find actual terminus and key arrival times
 */
async function getArrivalTime(tripId, directionId) {
  try {
    // Get all schedules for this trip to find actual terminus
    const data = await mbtaFetch('/schedules', {
      'filter[trip]': tripId,
      'include': 'stop',
      'sort': 'stop_sequence'
    });

    if (!data.data || data.data.length === 0) {
      return directionId === 1
        ? { terminus: 'North Station', arrivalStopName: 'Porter Square' }
        : { terminus: 'Outbound', arrivalStopName: null };
    }

    // Build stop info map from included data
    const stopInfo = {};
    if (data.included) {
      for (const item of data.included) {
        if (item.type === 'stop') {
          stopInfo[item.id] = item.attributes.name;
        }
      }
    }

    // Sort by stop_sequence to find terminus (last stop)
    const sortedStops = data.data.sort((a, b) =>
      (a.attributes.stop_sequence || 0) - (b.attributes.stop_sequence || 0)
    );

    const lastStop = sortedStops[sortedStops.length - 1];
    const lastStopId = lastStop.relationships?.stop?.data?.id;
    const terminusName = getStopName(lastStopId, stopInfo);
    const terminusArrival = lastStop.attributes.arrival_time;

    if (directionId === 1) {
      // Inbound - find Porter Square arrival time, terminus is North Station
      // Porter Square ID can be FR-0034-xx or contain 'portr'
      const porterStop = sortedStops.find(s => {
        const stopId = s.relationships?.stop?.data?.id;
        if (!stopId) return false;
        // Check ID patterns and also check the stop name
        if (stopId.includes('portr') || stopId.includes('FR-0034')) return true;
        // Check stop name from included data
        const stopName = stopInfo[stopId];
        return stopName && stopName.toLowerCase().includes('porter');
      });

      if (porterStop && porterStop.attributes.arrival_time) {
        return {
          time: new Date(porterStop.attributes.arrival_time).toISOString(),
          formatted: formatTime(new Date(porterStop.attributes.arrival_time)),
          terminus: 'North Station',
          arrivalStopName: 'Porter Square'
        };
      }
      return { terminus: 'North Station', arrivalStopName: 'Porter Square' };
    } else {
      // Outbound - use actual terminus from schedule
      if (terminusArrival) {
        return {
          time: new Date(terminusArrival).toISOString(),
          formatted: formatTime(new Date(terminusArrival)),
          terminus: terminusName,
          arrivalStopName: terminusName
        };
      }
      return { terminus: terminusName, arrivalStopName: terminusName };
    }
  } catch (error) {
    console.error('[MBTA] Arrival time error:', error.message);
    return directionId === 1
      ? { terminus: 'North Station', arrivalStopName: 'Porter Square' }
      : { terminus: 'Outbound', arrivalStopName: null };
  }
}

/**
 * Get human-readable stop name from stop ID
 */
function getStopName(stopId, stopInfo = {}) {
  if (!stopId) return 'Unknown';

  // Check included stop info first
  if (stopInfo[stopId]) {
    return stopInfo[stopId];
  }

  // Map platform IDs to station names
  // Platform IDs look like "FR-0494-01", station IDs look like "place-FR-0494"
  const stationMappings = {
    'BNT-0000': 'North Station',
    'north': 'North Station',
    'portr': 'Porter Square',
    'FR-0034': 'Porter Square',
    'FR-0201': 'Concord',
    'FR-0219': 'West Concord',
    'FR-0253': 'South Acton',
    'FR-0301': 'Littleton/495',
    'FR-0361': 'Ayer',
    'FR-0494': 'Fitchburg',
    'FR-3338': 'Wachusett',
  };

  // Try to match the stop ID against our mappings
  for (const [key, name] of Object.entries(stationMappings)) {
    if (stopId.includes(key)) {
      return name;
    }
  }

  return stopId; // Return raw ID if no match
}

/**
 * Get scheduled trains when predictions unavailable
 */
async function getSchedule() {
  try {
    const dateStr = getEasternDateString();
    const timeStr = getEasternTimeString();
    const now = new Date();

    // Fetch schedules for Concord departures
    const concordData = await mbtaFetch('/schedules', {
      'filter[stop]': CONCORD_STOP_ID,
      'filter[route]': FITCHBURG_ROUTE,
      'filter[min_time]': timeStr,
      'filter[date]': dateStr,
      'sort': 'departure_time'
    });

    if (!concordData.data || concordData.data.length === 0) return [];

    // Get trip IDs for arrival time lookups
    const schedules = concordData.data
      .filter(sched => {
        const depTime = sched.attributes.departure_time;
        return depTime && new Date(depTime) > now;
      })
      .slice(0, 10);

    // Fetch arrival times for each trip
    const results = await Promise.all(
      schedules.map(async sched => {
        const attrs = sched.attributes;
        const depTime = new Date(attrs.departure_time);
        const directionId = attrs.direction_id;
        const direction = DIRECTIONS[directionId] || DIRECTIONS[1];
        const tripId = sched.relationships?.trip?.data?.id;

        // Get arrival time and terminus info
        const arrivalInfo = tripId ? await getArrivalTime(tripId, directionId) : null;

        return {
          id: sched.id,
          departureTime: depTime.toISOString(),
          departureTimeFormatted: formatTime(depTime),
          minutesUntil: Math.round((depTime - now) / 60000),
          direction: direction.name,
          directionArrow: direction.arrow,
          destination: arrivalInfo?.terminus || direction.terminus || 'Unknown',
          arrivalStopName: arrivalInfo?.arrivalStopName || direction.arrivalStopName,
          arrivalTime: arrivalInfo?.time,
          arrivalTimeFormatted: arrivalInfo?.formatted,
          status: 'Scheduled',
          isSchedule: true,
          tripId
        };
      })
    );

    return results.filter(sched => sched.minutesUntil >= 0);
  } catch (error) {
    console.error('[MBTA] Schedule error:', error.message);
    return [];
  }
}

/**
 * Format time for display in Eastern timezone (e.g., "3:45 PM")
 */
function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format minutes until train arrives as "Nh, NNmin" or just "NNmin"
 */
function formatMinutesUntil(minutes) {
  if (minutes < 1) return 'Now';

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) {
    return `${mins}min`;
  } else if (mins === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h, ${mins}min`;
  }
}

module.exports = {
  CONCORD_STOP_ID,
  FITCHBURG_ROUTE,
  DIRECTIONS,
  STOPS,
  getPredictions,
  getSchedule,
  formatTime,
  formatMinutesUntil
};
