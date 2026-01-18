/**
 * Presence Management Service for Concord Smart Office
 *
 * Handles user check-in/check-out operations with Home Assistant webhook integration.
 * Implements retry logic with exponential backoff for failed webhook calls.
 */

const db = require('../db');

// Environment configuration
const HA_URL = process.env.HA_URL || 'http://localhost:8123';
const HA_WEBHOOK_TOKEN = process.env.HA_WEBHOOK_TOKEN || '';

// Webhook retry configuration
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_QUEUED_EVENTS = 100;
const RETRY_INTERVAL_MS = 30000;

// In-memory queue for failed webhook calls
const webhookQueue = [];

// Retry interval reference (for cleanup)
let retryIntervalId = null;

/**
 * Valid check-in sources
 */
const VALID_SOURCES = ['qr', 'nfc', 'ble', 'manual'];

/**
 * Sleep utility for exponential backoff
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
const getBackoffDelay = (attempt) => {
  return INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
};

/**
 * Send webhook to Home Assistant with retry logic
 * @param {string} endpoint - Webhook endpoint ('checkin' or 'checkout')
 * @param {Object} payload - Webhook payload
 * @returns {Promise<boolean>} Success status
 */
async function sendWebhook(endpoint, payload) {
  const url = `${HA_URL}/api/webhook/staffweek_${endpoint}`;
  const webhookPayload = {
    ...payload,
    token: HA_WEBHOOK_TOKEN
  };

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookPayload)
      });

      if (response.ok) {
        return true;
      }

      console.error(
        `Webhook ${endpoint} failed (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}): ` +
        `HTTP ${response.status} ${response.statusText}`
      );
    } catch (error) {
      console.error(
        `Webhook ${endpoint} error (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}):`,
        error.message
      );
    }

    // Wait before retrying (except on last attempt)
    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      await sleep(getBackoffDelay(attempt));
    }
  }

  return false;
}

/**
 * Queue a failed webhook for later retry
 * @param {string} endpoint - Webhook endpoint
 * @param {Object} payload - Webhook payload
 */
function queueWebhook(endpoint, payload) {
  // Drop oldest events if queue is full
  while (webhookQueue.length >= MAX_QUEUED_EVENTS) {
    const dropped = webhookQueue.shift();
    console.warn(`Webhook queue full, dropping oldest event for user ${dropped.payload.user_id}`);
  }

  webhookQueue.push({
    endpoint,
    payload,
    queuedAt: new Date().toISOString(),
    retryCount: 0
  });

  console.log(`Queued webhook ${endpoint} for user ${payload.user_id}, queue size: ${webhookQueue.length}`);
}

/**
 * Process webhook and queue on failure
 * @param {string} endpoint - Webhook endpoint
 * @param {Object} payload - Webhook payload
 */
async function processWebhook(endpoint, payload) {
  const success = await sendWebhook(endpoint, payload);

  if (!success) {
    queueWebhook(endpoint, payload);
  }
}

/**
 * Check a user into the office
 * @param {string} userId - User ID
 * @param {string} source - Check-in source ('qr', 'nfc', 'ble', 'manual')
 * @param {string} [roomId] - Optional room ID
 * @returns {Promise<Object>} Updated presence state
 * @throws {Error} If source is invalid or database operation fails
 */
async function checkIn(userId, source, roomId = null) {
  // Validate source
  if (!VALID_SOURCES.includes(source)) {
    throw new Error(`Invalid source: ${source}. Must be one of: ${VALID_SOURCES.join(', ')}`);
  }

  // Validate userId
  if (!userId) {
    throw new Error('userId is required');
  }

  const timestamp = new Date().toISOString();

  // Update presence state
  const presenceState = db.setPresenceState(userId, {
    status: 'in',
    room_id: roomId,
    checked_in_at: timestamp
  });

  // Create presence event record
  db.createPresenceEvent({
    user_id: userId,
    type: 'check_in',
    source: source,
    room_id: roomId,
    timestamp: timestamp
  });

  // Get user details for webhook (may be null if not available)
  const userDetails = presenceState.user || {};

  // Prepare webhook payload
  const webhookPayload = {
    user_id: userId,
    user_email: userDetails.email || null,
    user_name: userDetails.name || null,
    timestamp: timestamp,
    source: source,
    room_id: roomId
  };

  // Send webhook to Home Assistant (non-blocking)
  processWebhook('checkin', webhookPayload).catch(error => {
    console.error('Webhook processing error:', error.message);
  });

  return presenceState;
}

/**
 * Check a user out of the office
 * @param {string} userId - User ID
 * @param {string} source - Check-out source ('qr', 'nfc', 'ble', 'manual')
 * @returns {Promise<Object>} Updated presence state
 * @throws {Error} If source is invalid or database operation fails
 */
async function checkOut(userId, source) {
  // Validate source
  if (!VALID_SOURCES.includes(source)) {
    throw new Error(`Invalid source: ${source}. Must be one of: ${VALID_SOURCES.join(', ')}`);
  }

  // Validate userId
  if (!userId) {
    throw new Error('userId is required');
  }

  const timestamp = new Date().toISOString();

  // Get current presence state for user details
  const currentState = db.getPresenceState(userId);
  const userDetails = currentState?.user || {};

  // Update presence state
  const presenceState = db.setPresenceState(userId, {
    status: 'out',
    room_id: null,
    checked_in_at: null
  });

  // Create presence event record
  db.createPresenceEvent({
    user_id: userId,
    type: 'check_out',
    source: source,
    room_id: null,
    timestamp: timestamp
  });

  // Prepare webhook payload
  const webhookPayload = {
    user_id: userId,
    user_email: userDetails.email || null,
    user_name: userDetails.name || null,
    timestamp: timestamp,
    source: source,
    room_id: null
  };

  // Send webhook to Home Assistant (non-blocking)
  processWebhook('checkout', webhookPayload).catch(error => {
    console.error('Webhook processing error:', error.message);
  });

  return presenceState;
}

/**
 * Get a single user's presence state
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Presence state or null if not found
 */
async function getPresence(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  return db.getPresenceState(userId);
}

/**
 * Get all users currently checked in
 * @returns {Promise<Array>} Array of present users with their presence states
 */
async function getAllPresent() {
  return db.getAllPresent();
}

/**
 * Get presence history for a user
 * @param {string} userId - User ID
 * @param {number} [limit=50] - Maximum number of events to return
 * @returns {Promise<Array>} Array of presence events
 */
async function getPresenceHistory(userId, limit = 50) {
  if (!userId) {
    throw new Error('userId is required');
  }

  return db.getPresenceEvents({ user_id: userId, limit: limit });
}

/**
 * Retry all failed webhooks in the queue
 * @returns {Promise<Object>} Results summary { processed, succeeded, failed, remaining }
 */
async function retryFailedWebhooks() {
  const initialQueueSize = webhookQueue.length;

  if (initialQueueSize === 0) {
    return { processed: 0, succeeded: 0, failed: 0, remaining: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  // Process all current items (take a snapshot to avoid infinite loop)
  const itemsToProcess = webhookQueue.splice(0, initialQueueSize);

  for (const item of itemsToProcess) {
    const success = await sendWebhook(item.endpoint, item.payload);

    if (success) {
      succeeded++;
      console.log(`Retry succeeded for webhook ${item.endpoint}, user ${item.payload.user_id}`);
    } else {
      failed++;
      item.retryCount++;

      // Re-queue if still within limits
      if (webhookQueue.length < MAX_QUEUED_EVENTS) {
        webhookQueue.push(item);
        console.log(
          `Retry failed for webhook ${item.endpoint}, user ${item.payload.user_id}, ` +
          `retry count: ${item.retryCount}`
        );
      } else {
        console.warn(
          `Dropping webhook ${item.endpoint} for user ${item.payload.user_id} ` +
          `after ${item.retryCount} retries (queue full)`
        );
      }
    }
  }

  return {
    processed: initialQueueSize,
    succeeded,
    failed,
    remaining: webhookQueue.length
  };
}

/**
 * Get current webhook queue status
 * @returns {Object} Queue status { queueSize, maxSize, items }
 */
function getWebhookQueueStatus() {
  return {
    queueSize: webhookQueue.length,
    maxSize: MAX_QUEUED_EVENTS,
    items: webhookQueue.map(item => ({
      endpoint: item.endpoint,
      userId: item.payload.user_id,
      queuedAt: item.queuedAt,
      retryCount: item.retryCount
    }))
  };
}

/**
 * Start the automatic retry interval
 * @returns {void}
 */
function startRetryInterval() {
  if (retryIntervalId) {
    console.warn('Retry interval already running');
    return;
  }

  retryIntervalId = setInterval(async () => {
    if (webhookQueue.length > 0) {
      console.log(`Running scheduled webhook retry, queue size: ${webhookQueue.length}`);
      const results = await retryFailedWebhooks();
      console.log(`Retry results: ${JSON.stringify(results)}`);
    }
  }, RETRY_INTERVAL_MS);

  console.log(`Started webhook retry interval (${RETRY_INTERVAL_MS}ms)`);
}

/**
 * Stop the automatic retry interval
 * @returns {void}
 */
function stopRetryInterval() {
  if (retryIntervalId) {
    clearInterval(retryIntervalId);
    retryIntervalId = null;
    console.log('Stopped webhook retry interval');
  }
}

/**
 * Clear the webhook queue (for testing or emergency)
 * @returns {number} Number of cleared items
 */
function clearWebhookQueue() {
  const count = webhookQueue.length;
  webhookQueue.length = 0;
  return count;
}

module.exports = {
  checkIn,
  checkOut,
  getPresence,
  getAllPresent,
  getPresenceHistory,
  retryFailedWebhooks,
  getWebhookQueueStatus,
  startRetryInterval,
  stopRetryInterval,
  clearWebhookQueue
};
