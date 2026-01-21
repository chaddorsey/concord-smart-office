/**
 * Sonos Control Service via Home Assistant
 * Handles playback control through HA's media_player integration
 */

const WebSocket = require('ws');

// Configuration
const HA_URL = process.env.HA_URL || 'http://localhost:8123';
const HA_TOKEN = process.env.HA_TOKEN || process.env.HA_WEBHOOK_TOKEN;

// Sonos entity - will be discovered or configured
let SONOS_ENTITY_ID = process.env.SONOS_ENTITY_ID || null;

// WebSocket connection to HA
let ws = null;
let messageId = 1;
let authenticated = false;
let pendingRequests = new Map();
let stateListeners = new Set();
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 5000;

/**
 * Initialize connection to Home Assistant
 */
async function connect() {
  if (!HA_TOKEN) {
    console.log('[Sonos] No HA_TOKEN configured, Sonos control disabled');
    return false;
  }

  const wsUrl = HA_URL.replace(/^http/, 'ws') + '/api/websocket';
  console.log(`[Sonos] Connecting to HA WebSocket: ${wsUrl}`);

  return new Promise((resolve, reject) => {
    try {
      ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error('[Sonos] Failed to create WebSocket:', error);
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      console.error('[Sonos] Connection timeout');
      ws.close();
      resolve(false);
    }, 30000);

    ws.on('open', () => {
      console.log('[Sonos] WebSocket connected');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(message, resolve, reject, timeout);
      } catch (error) {
        console.error('[Sonos] Failed to parse message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('[Sonos] WebSocket error:', error.message);
    });

    ws.on('close', () => {
      console.log('[Sonos] WebSocket closed');
      authenticated = false;
      clearTimeout(timeout);
      attemptReconnect();
    });
  });
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(message, resolve, reject, timeout) {
  switch (message.type) {
    case 'auth_required':
      // Send authentication
      ws.send(JSON.stringify({
        type: 'auth',
        access_token: HA_TOKEN
      }));
      break;

    case 'auth_ok':
      console.log('[Sonos] Authenticated with HA');
      authenticated = true;
      reconnectAttempts = 0;
      clearTimeout(timeout);
      resolve(true);
      break;

    case 'auth_invalid':
      console.error('[Sonos] Authentication failed');
      clearTimeout(timeout);
      resolve(false);
      break;

    case 'result':
      handleResult(message);
      break;

    case 'event':
      handleEvent(message);
      break;

    default:
      // Ignore other message types
      break;
  }
}

/**
 * Handle result messages
 */
function handleResult(message) {
  const pending = pendingRequests.get(message.id);
  if (pending) {
    pendingRequests.delete(message.id);
    if (message.success) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error?.message || 'Unknown error'));
    }
  }
}

/**
 * Handle event messages (state changes)
 */
function handleEvent(message) {
  if (message.event?.event_type === 'state_changed') {
    const { entity_id, new_state } = message.event.data;

    // Notify listeners of Sonos state changes
    if (entity_id === SONOS_ENTITY_ID) {
      for (const listener of stateListeners) {
        try {
          listener(new_state);
        } catch (error) {
          console.error('[Sonos] State listener error:', error);
        }
      }
    }
  }
}

/**
 * Attempt to reconnect after disconnect
 */
function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[Sonos] Max reconnect attempts reached');
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts - 1);

  console.log(`[Sonos] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

  setTimeout(() => {
    connect().catch(error => {
      console.error('[Sonos] Reconnect failed:', error);
    });
  }, delay);
}

/**
 * Send a command to HA and wait for response
 */
async function sendCommand(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !authenticated) {
    throw new Error('Not connected to Home Assistant');
  }

  const id = messageId++;
  const message = { ...payload, id };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Command timeout'));
    }, 30000);

    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    });

    ws.send(JSON.stringify(message));
  });
}

/**
 * Call a Home Assistant service
 */
async function callService(domain, service, data = {}, target = null) {
  const payload = {
    type: 'call_service',
    domain,
    service,
    service_data: data
  };

  if (target) {
    payload.target = target;
  }

  return sendCommand(payload);
}

/**
 * Get all states from HA
 */
async function getStates() {
  return sendCommand({ type: 'get_states' });
}

/**
 * Get state of a specific entity
 */
async function getState(entityId) {
  const states = await getStates();
  return states.find(s => s.entity_id === entityId);
}

/**
 * Discover Sonos media_player entities
 */
async function discoverSonos() {
  console.log('[Sonos] Discovering Sonos entities...');

  try {
    const states = await getStates();

    // Find media_player entities that look like Sonos
    const sonosEntities = states.filter(s =>
      s.entity_id.startsWith('media_player.') &&
      (s.attributes.friendly_name?.toLowerCase().includes('sonos') ||
        s.entity_id.toLowerCase().includes('sonos') ||
        s.attributes.device_class === 'speaker')
    );

    if (sonosEntities.length > 0) {
      console.log('[Sonos] Found Sonos entities:');
      for (const entity of sonosEntities) {
        console.log(`  - ${entity.entity_id}: ${entity.attributes.friendly_name}`);
      }

      // Use the first one if not configured
      if (!SONOS_ENTITY_ID) {
        SONOS_ENTITY_ID = sonosEntities[0].entity_id;
        console.log(`[Sonos] Using: ${SONOS_ENTITY_ID}`);
      }

      return sonosEntities.map(e => ({
        entity_id: e.entity_id,
        friendly_name: e.attributes.friendly_name,
        state: e.state
      }));
    } else {
      console.log('[Sonos] No Sonos entities found');
      return [];
    }
  } catch (error) {
    console.error('[Sonos] Discovery failed:', error);
    return [];
  }
}

/**
 * Set the Sonos entity to control
 */
function setSonosEntity(entityId) {
  SONOS_ENTITY_ID = entityId;
  console.log(`[Sonos] Entity set to: ${entityId}`);
}

/**
 * Get the current Sonos entity
 */
function getSonosEntity() {
  return SONOS_ENTITY_ID;
}

// ============================================================================
// Playback Control
// ============================================================================

/**
 * Get current playback state
 */
async function getPlaybackState() {
  if (!SONOS_ENTITY_ID) {
    throw new Error('Sonos entity not configured');
  }

  const state = await getState(SONOS_ENTITY_ID);
  if (!state) {
    throw new Error('Sonos entity not found');
  }

  const attrs = state.attributes;

  return {
    state: state.state, // playing, paused, idle, off
    isPlaying: state.state === 'playing',
    mediaContentId: attrs.media_content_id,
    mediaTitle: attrs.media_title,
    mediaArtist: attrs.media_artist,
    mediaAlbum: attrs.media_album_name,
    mediaDuration: attrs.media_duration,
    mediaPosition: attrs.media_position,
    mediaPositionUpdatedAt: attrs.media_position_updated_at,
    volume: attrs.volume_level,
    isMuted: attrs.is_volume_muted,
    shuffle: attrs.shuffle,
    repeat: attrs.repeat,
    source: attrs.source,
    entityPicture: attrs.entity_picture
  };
}

/**
 * Play a Spotify track
 * @param {string} trackUrl - Spotify track URL or URI (spotify:track:ID)
 */
async function playTrack(trackUrl) {
  if (!SONOS_ENTITY_ID) {
    throw new Error('Sonos entity not configured');
  }

  // Convert spotify:track:ID to Sonos-specific format
  // Format: x-sonos-spotify:spotify%3atrack%3aID?sid=12&flags=8232&sn=4
  let sonosUri = trackUrl;
  if (trackUrl.startsWith('spotify:track:')) {
    const encodedUri = encodeURIComponent(trackUrl);
    // sid=12 is Spotify, flags=8232 enables proper playback, sn=4 is service number
    sonosUri = `x-sonos-spotify:${encodedUri}?sid=12&flags=8232&sn=4`;
  }

  console.log(`[Sonos] Playing track: ${sonosUri}`);

  try {
    // Use enqueue: 'replace' to clear queue and play immediately
    // This replaces any existing queue with our track
    const result = await callService('media_player', 'play_media', {
      media_content_id: sonosUri,
      media_content_type: 'music',
      enqueue: 'replace'
    }, {
      entity_id: SONOS_ENTITY_ID
    });

    // Ensure playback starts (some Sonos states require explicit play command)
    await new Promise(resolve => setTimeout(resolve, 500));
    await callService('media_player', 'media_play', {}, {
      entity_id: SONOS_ENTITY_ID
    });

    return result;
  } catch (error) {
    console.error('[Sonos] Play command error:', error.message);
    throw error;
  }
}

/**
 * Pause playback
 */
async function pause() {
  if (!SONOS_ENTITY_ID) {
    throw new Error('Sonos entity not configured');
  }

  return callService('media_player', 'media_pause', {}, {
    entity_id: SONOS_ENTITY_ID
  });
}

/**
 * Resume playback
 */
async function play() {
  if (!SONOS_ENTITY_ID) {
    throw new Error('Sonos entity not configured');
  }

  return callService('media_player', 'media_play', {}, {
    entity_id: SONOS_ENTITY_ID
  });
}

/**
 * Stop playback
 */
async function stop() {
  if (!SONOS_ENTITY_ID) {
    throw new Error('Sonos entity not configured');
  }

  return callService('media_player', 'media_stop', {}, {
    entity_id: SONOS_ENTITY_ID
  });
}

/**
 * Skip to next track
 */
async function nextTrack() {
  if (!SONOS_ENTITY_ID) {
    throw new Error('Sonos entity not configured');
  }

  return callService('media_player', 'media_next_track', {}, {
    entity_id: SONOS_ENTITY_ID
  });
}

/**
 * Set volume (0.0 - 1.0)
 */
async function setVolume(level) {
  if (!SONOS_ENTITY_ID) {
    throw new Error('Sonos entity not configured');
  }

  const volumeLevel = Math.max(0, Math.min(1, level));
  console.log(`[Sonos] Setting volume to ${volumeLevel}`);

  return callService('media_player', 'volume_set', {
    volume_level: volumeLevel
  }, {
    entity_id: SONOS_ENTITY_ID
  });
}

/**
 * Subscribe to state changes
 */
async function subscribeToStateChanges(callback) {
  // Subscribe to state_changed events
  await sendCommand({
    type: 'subscribe_events',
    event_type: 'state_changed'
  });

  stateListeners.add(callback);

  // Return unsubscribe function
  return () => {
    stateListeners.delete(callback);
  };
}

/**
 * Check if track has finished
 * @param {Object} state - Playback state from getPlaybackState()
 * @returns {boolean} True if track has finished
 */
function isTrackFinished(state) {
  // Track is finished if:
  // 1. State is 'idle' or 'off'
  // 2. Position >= duration - 2 seconds (with some buffer)

  if (state.state === 'idle' || state.state === 'off') {
    return true;
  }

  if (state.mediaDuration && state.mediaPosition) {
    return state.mediaPosition >= state.mediaDuration - 2;
  }

  return false;
}

/**
 * Check if connected to HA
 */
function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN && authenticated;
}

/**
 * Disconnect from HA
 */
function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  authenticated = false;
  pendingRequests.clear();
  stateListeners.clear();
}

module.exports = {
  // Connection
  connect,
  disconnect,
  isConnected,

  // Discovery
  discoverSonos,
  setSonosEntity,
  getSonosEntity,

  // Playback control
  getPlaybackState,
  playTrack,
  play,
  pause,
  stop,
  nextTrack,
  setVolume,

  // State monitoring
  subscribeToStateChanges,
  isTrackFinished,

  // Low-level HA access
  getStates,
  getState,
  callService
};
