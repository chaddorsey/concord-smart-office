/**
 * Notification Service
 *
 * Handles in-app notifications, push notifications, and quick messages.
 * Supports individual notifications and group broadcasts.
 */

const db = require('../db');

// VAPID keys for Web Push (should be loaded from environment)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@concordhq.local';

// Quick message templates
const QUICK_MESSAGES = [
  {
    id: 'coffee',
    emoji: '☕',
    title: 'Coffee Run',
    message: "Going for coffee – join me?"
  },
  {
    id: 'lunch',
    emoji: '🍽️',
    title: 'Lunch',
    message: "Having lunch in the cafe now..."
  },
  {
    id: 'icecream',
    emoji: '🍦',
    title: 'Ice Cream',
    message: "Anyone wanna go get ice cream??"
  },
  {
    id: 'walk',
    emoji: '🚶',
    title: 'Walk',
    message: "Going for a quick walk, back in 15!"
  },
  {
    id: 'meeting',
    emoji: '📅',
    title: 'Meeting',
    message: "Meeting starting soon!"
  }
];

// Connected SSE clients (for smart push delivery)
const connectedClients = new Map(); // userId -> Set of response objects

/**
 * Register a connected SSE client
 * @param {number} userId - User ID
 * @param {Object} res - Express response object
 */
function registerSseClient(userId, res) {
  if (!connectedClients.has(userId)) {
    connectedClients.set(userId, new Set());
  }
  connectedClients.get(userId).add(res);
}

/**
 * Unregister a disconnected SSE client
 * @param {number} userId - User ID
 * @param {Object} res - Express response object
 */
function unregisterSseClient(userId, res) {
  const clients = connectedClients.get(userId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) {
      connectedClients.delete(userId);
    }
  }
}

/**
 * Check if a user is connected via SSE
 * @param {number} userId - User ID
 * @returns {boolean} True if connected
 */
function isUserConnected(userId) {
  const clients = connectedClients.get(userId);
  return clients && clients.size > 0;
}

/**
 * Get quick message templates
 * @returns {Array} Quick message templates
 */
function getQuickMessages() {
  return QUICK_MESSAGES;
}

/**
 * Get quick message by ID
 * @param {string} messageId - Message ID
 * @returns {Object|null} Quick message template or null
 */
function getQuickMessageById(messageId) {
  return QUICK_MESSAGES.find(m => m.id === messageId) || null;
}

/**
 * Create a notification for a single user
 * @param {Object} data - Notification data
 * @returns {Object} Created notification
 */
function createNotification({ userId, title, message, type = 'info', actionUrl = null, senderUserId = null }) {
  return db.createNotification({
    userId,
    groupType: null,
    title,
    message,
    type,
    actionUrl,
    senderUserId
  });
}

/**
 * Create a group notification (to all checked-in users or all staff)
 * @param {Object} data - Notification data
 * @returns {Array} Created notifications
 */
function createGroupNotification({
  groupType, // 'checked_in' or 'all_staff'
  title,
  message,
  type = 'info',
  actionUrl = null,
  senderUserId = null,
  excludeUserIds = []
}) {
  let targetUsers = [];

  if (groupType === 'checked_in') {
    // Get all currently checked-in users
    const present = db.getAllPresent();
    targetUsers = present.map(p => p.user_id);
  } else if (groupType === 'all_staff') {
    // Get all users (would need a getAllUsers function)
    // For now, use checked-in as default
    const present = db.getAllPresent();
    targetUsers = present.map(p => p.user_id);
  }

  // Filter out excluded users and sender
  const recipients = targetUsers.filter(id =>
    !excludeUserIds.includes(id) && id !== senderUserId
  );

  // Create individual notifications for each recipient
  const notifications = recipients.map(userId =>
    db.createNotification({
      userId,
      groupType,
      title,
      message,
      type,
      actionUrl,
      senderUserId
    })
  );

  return notifications;
}

/**
 * Send a quick message to checked-in users
 * @param {Object} data - Quick message data
 * @returns {Object} Result with notifications created
 */
function sendQuickMessage({
  quickMessageId,
  customMessage = null,
  senderUserId,
  sendToAll = true,
  excludeUserIds = []
}) {
  const template = getQuickMessageById(quickMessageId);
  if (!template && !customMessage) {
    throw new Error('Must provide quickMessageId or customMessage');
  }

  const title = template ? `${template.emoji} ${template.title}` : 'Message';
  const message = customMessage || template.message;

  // Get sender name
  const sender = db.getUserById(senderUserId);
  const senderName = sender?.name?.split(' ')[0] || 'Someone';
  const fullMessage = `${senderName}: ${message}`;

  const notifications = createGroupNotification({
    groupType: sendToAll ? 'checked_in' : 'checked_in',
    title,
    message: fullMessage,
    type: 'message',
    senderUserId,
    excludeUserIds
  });

  // Try to send push notifications to users not connected via SSE
  const pushPromises = notifications.map(async (notif) => {
    if (!isUserConnected(notif.user_id)) {
      await sendPushToUser(notif.user_id, title, fullMessage, { notificationId: notif.id });
    }
  });

  // Don't wait for push notifications
  Promise.all(pushPromises).catch(err => {
    console.error('[Notification] Push delivery error:', err.message);
  });

  return {
    sent: notifications.length,
    notifications
  };
}

/**
 * Get unread notifications for a user
 * @param {number} userId - User ID
 * @returns {Array} Unread notifications
 */
function getUnreadNotifications(userId) {
  return db.getUnreadNotifications(userId);
}

/**
 * Get all notifications for a user
 * @param {number} userId - User ID
 * @param {number} limit - Max to return
 * @returns {Array} Notifications
 */
function getUserNotifications(userId, limit = 50) {
  return db.getUserNotifications(userId, limit);
}

/**
 * Mark a notification as read
 * @param {number} notificationId - Notification ID
 * @returns {boolean} True if marked
 */
function markAsRead(notificationId) {
  return db.markNotificationRead(notificationId);
}

/**
 * Mark all notifications as read for a user
 * @param {number} userId - User ID
 * @returns {number} Number marked
 */
function markAllAsRead(userId) {
  return db.markAllNotificationsRead(userId);
}

/**
 * Get checked-in users for recipient selection UI
 * @param {number} excludeUserId - User ID to exclude (typically the sender)
 * @returns {Array} Checked-in users with id, name, avatar
 */
function getCheckedInRecipients(excludeUserId = null) {
  const present = db.getAllPresent();
  return present
    .filter(p => p.user_id !== excludeUserId)
    .map(p => ({
      id: p.user_id,
      name: p.user_name,
      avatar_url: p.avatar_url,
      checked_in_at: p.checked_in_at
    }));
}

// ============================================================================
// Push Notification Functions
// ============================================================================

/**
 * Get VAPID public key for client subscription
 * @returns {string} VAPID public key
 */
function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

/**
 * Save a push subscription
 * @param {number} userId - User ID
 * @param {Object} subscription - Push subscription object
 * @returns {Object} Saved subscription
 */
function savePushSubscription(userId, subscription) {
  const { endpoint, keys } = subscription;
  return db.savePushSubscription({
    userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth
  });
}

/**
 * Remove a push subscription
 * @param {string} endpoint - Subscription endpoint
 * @returns {boolean} True if removed
 */
function removePushSubscription(endpoint) {
  return db.removePushSubscription(endpoint);
}

/**
 * Send push notification to a specific user
 * @param {number} userId - User ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data
 * @returns {Promise<boolean>} Success
 */
async function sendPushToUser(userId, title, body, data = {}) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[Notification] VAPID keys not configured, skipping push');
    return false;
  }

  const subscriptions = db.getUserPushSubscriptions(userId);
  if (subscriptions.length === 0) {
    return false;
  }

  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data
    });

    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        }, payload)
      )
    );

    // Remove failed subscriptions (expired/unsubscribed)
    results.forEach((result, index) => {
      if (result.status === 'rejected' && result.reason?.statusCode === 410) {
        db.removePushSubscription(subscriptions[index].endpoint);
      }
    });

    return results.some(r => r.status === 'fulfilled');
  } catch (error) {
    console.error('[Notification] Push send error:', error.message);
    return false;
  }
}

/**
 * Send push notification to all subscribed users
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data
 * @returns {Promise<number>} Number of successful deliveries
 */
async function sendPushToAll(title, body, data = {}) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[Notification] VAPID keys not configured, skipping push');
    return 0;
  }

  const subscriptions = db.getAllPushSubscriptions();
  if (subscriptions.length === 0) {
    return 0;
  }

  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data
    });

    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        }, payload)
      )
    );

    // Clean up failed subscriptions
    results.forEach((result, index) => {
      if (result.status === 'rejected' && result.reason?.statusCode === 410) {
        db.removePushSubscription(subscriptions[index].endpoint);
      }
    });

    return results.filter(r => r.status === 'fulfilled').length;
  } catch (error) {
    console.error('[Notification] Broadcast push error:', error.message);
    return 0;
  }
}

module.exports = {
  // Quick messages
  getQuickMessages,
  getQuickMessageById,
  sendQuickMessage,

  // Notifications
  createNotification,
  createGroupNotification,
  getUnreadNotifications,
  getUserNotifications,
  markAsRead,
  markAllAsRead,

  // Recipients
  getCheckedInRecipients,

  // Push subscriptions
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  sendPushToUser,
  sendPushToAll,

  // SSE client tracking
  registerSseClient,
  unregisterSseClient,
  isUserConnected
};
