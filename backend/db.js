/**
 * SQLite Database Layer for Concord Smart Office
 * Uses better-sqlite3 for synchronous operations
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'concord.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

/**
 * Initialize database tables
 * Creates all required tables if they don't exist
 */
function initDatabase() {
  const createTables = db.transaction(() => {
    // Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        google_id TEXT UNIQUE,
        avatar_url TEXT,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Presence state table (current state for each user)
    db.exec(`
      CREATE TABLE IF NOT EXISTS presence_state (
        user_id INTEGER PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('in', 'out')),
        checked_in_at TEXT,
        room_id TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Presence events table (historical log)
    db.exec(`
      CREATE TABLE IF NOT EXISTS presence_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        source TEXT,
        room_id TEXT,
        timestamp TEXT DEFAULT (datetime('now')),
        payload TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Kiosk tokens table
    db.exec(`
      CREATE TABLE IF NOT EXISTS kiosk_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        used_at TEXT
      )
    `);

    // Create indexes for better query performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_presence_state_status ON presence_state(status);
      CREATE INDEX IF NOT EXISTS idx_presence_events_user_id ON presence_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_presence_events_timestamp ON presence_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_kiosk_tokens_token_hash ON kiosk_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_kiosk_tokens_kiosk_id ON kiosk_tokens(kiosk_id);
    `);
  });

  try {
    createTables();
    return true;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// ============================================================================
// User CRUD Operations
// ============================================================================

/**
 * Create a new user
 * @param {Object} userData - User data object
 * @param {string} userData.email - User email (required, unique)
 * @param {string} [userData.name] - User display name
 * @param {string} [userData.google_id] - Google OAuth ID
 * @param {string} [userData.avatar_url] - Avatar URL
 * @param {string} [userData.role] - User role (default: 'user')
 * @returns {Object} Created user object with id
 */
function createUser({ email, name = null, google_id = null, avatar_url = null, role = 'user' }) {
  const stmt = db.prepare(`
    INSERT INTO users (email, name, google_id, avatar_url, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    const result = stmt.run(email, name, google_id, avatar_url, role);
    return getUserById(result.lastInsertRowid);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error(`User with email '${email}' or google_id already exists`);
    }
    throw error;
  }
}

/**
 * Get user by ID
 * @param {number} id - User ID
 * @returns {Object|null} User object or null if not found
 */
function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) || null;
}

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {Object|null} User object or null if not found
 */
function getUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email) || null;
}

/**
 * Get user by Google ID
 * @param {string} googleId - Google OAuth ID
 * @returns {Object|null} User object or null if not found
 */
function getUserByGoogleId(googleId) {
  const stmt = db.prepare('SELECT * FROM users WHERE google_id = ?');
  return stmt.get(googleId) || null;
}

/**
 * Update user data
 * @param {number} id - User ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated user object or null if not found
 */
function updateUser(id, updates) {
  const allowedFields = ['email', 'name', 'google_id', 'avatar_url', 'role'];
  const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));

  if (fieldsToUpdate.length === 0) {
    return getUserById(id);
  }

  const setClause = fieldsToUpdate.map(field => `${field} = ?`).join(', ');
  const values = fieldsToUpdate.map(field => updates[field]);

  const stmt = db.prepare(`
    UPDATE users
    SET ${setClause}, updated_at = datetime('now')
    WHERE id = ?
  `);

  try {
    const result = stmt.run(...values, id);
    if (result.changes === 0) {
      return null;
    }
    return getUserById(id);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Email or google_id already exists');
    }
    throw error;
  }
}

// ============================================================================
// Session Operations
// ============================================================================

/**
 * Create a new session
 * Supports two calling conventions:
 * - Legacy: { id, user_id, token, expires_at }
 * - AuthService: { userId, tokenHash, expiresAt }
 * @param {Object} sessionData - Session data
 * @returns {Object} Created session object
 */
function createSession(sessionData) {
  const crypto = require('crypto');

  // Normalize input to handle both calling conventions
  let sessionId, userId, token, expiresAt;

  if (sessionData.userId !== undefined || sessionData.tokenHash !== undefined) {
    // AuthService calling convention: { userId, tokenHash, expiresAt }
    sessionId = crypto.randomBytes(16).toString('hex');
    userId = sessionData.userId;
    token = sessionData.tokenHash;
    expiresAt = sessionData.expiresAt instanceof Date
      ? sessionData.expiresAt.toISOString()
      : sessionData.expiresAt;
  } else {
    // Legacy calling convention: { id, user_id, token, expires_at }
    sessionId = sessionData.id;
    userId = sessionData.user_id;
    token = sessionData.token;
    expiresAt = sessionData.expires_at;
  }

  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `);

  try {
    stmt.run(sessionId, userId, token, expiresAt);
    return {
      id: sessionId,
      user_id: userId,
      userId: userId,
      token,
      tokenHash: token,
      expires_at: expiresAt,
      expiresAt: expiresAt,
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Session ID or token already exists');
    }
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new Error('User does not exist');
    }
    throw error;
  }
}

/**
 * Get session by token (including user data)
 * @param {string} token - Session token
 * @returns {Object|null} Session with user data or null if not found/expired
 */
function getSessionByToken(token) {
  const stmt = db.prepare(`
    SELECT
      s.*,
      u.id as user_id,
      u.email as user_email,
      u.name as user_name,
      u.role as user_role,
      u.avatar_url as user_avatar_url
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `);

  const result = stmt.get(token);
  if (!result) {
    return null;
  }

  return {
    id: result.id,
    token: result.token,
    expires_at: result.expires_at,
    created_at: result.created_at,
    user: {
      id: result.user_id,
      email: result.user_email,
      name: result.user_name,
      role: result.user_role,
      avatar_url: result.user_avatar_url
    }
  };
}

/**
 * Delete a session by ID
 * @param {string} sessionId - Session ID
 * @returns {boolean} True if session was deleted
 */
function deleteSession(sessionId) {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(sessionId);
  return result.changes > 0;
}

/**
 * Delete all expired sessions
 * @returns {number} Number of deleted sessions
 */
function deleteExpiredSessions() {
  const stmt = db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')");
  const result = stmt.run();
  return result.changes;
}

/**
 * Find a session by its hashed token (used by authService)
 * @param {string} tokenHash - The hashed session token
 * @returns {Object|null} Session object with id, userId, expiresAt or null if not found
 */
function findSessionByTokenHash(tokenHash) {
  const stmt = db.prepare(`
    SELECT id, user_id, token, expires_at, created_at
    FROM sessions
    WHERE token = ?
  `);

  const row = stmt.get(tokenHash);
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

/**
 * Create a session with a hashed token (used by authService)
 * This is an alternative signature for createSession that uses tokenHash instead of token
 * @param {Object} sessionData - Session data
 * @param {number} sessionData.userId - User ID
 * @param {string} sessionData.tokenHash - Hashed session token
 * @param {Date|string} sessionData.expiresAt - Expiration datetime
 * @returns {Object} Created session object
 */
function createSessionWithHash({ userId, tokenHash, expiresAt }) {
  const crypto = require('crypto');
  const sessionId = crypto.randomBytes(16).toString('hex');
  const expiresAtStr = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;

  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `);

  try {
    stmt.run(sessionId, userId, tokenHash, expiresAtStr);
    return {
      id: sessionId,
      userId,
      tokenHash,
      expiresAt: expiresAtStr,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Session token already exists');
    }
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new Error('User does not exist');
    }
    throw error;
  }
}

// ============================================================================
// Presence Operations
// ============================================================================

/**
 * Get presence state for a user
 * @param {number} userId - User ID
 * @returns {Object|null} Presence state or null if not found
 */
function getPresenceState(userId) {
  const stmt = db.prepare(`
    SELECT ps.*, u.name as user_name, u.email as user_email, u.avatar_url
    FROM presence_state ps
    JOIN users u ON ps.user_id = u.id
    WHERE ps.user_id = ?
  `);
  return stmt.get(userId) || null;
}

/**
 * Set presence state for a user
 * @param {number} userId - User ID
 * @param {Object} state - Presence state
 * @param {string} state.status - 'in' or 'out'
 * @param {string} [state.checked_in_at] - Check-in timestamp
 * @param {string} [state.room_id] - Room identifier
 * @returns {Object} Updated presence state
 */
function setPresenceState(userId, { status, checked_in_at = null, room_id = null }) {
  const stmt = db.prepare(`
    INSERT INTO presence_state (user_id, status, checked_in_at, room_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      status = excluded.status,
      checked_in_at = excluded.checked_in_at,
      room_id = excluded.room_id
  `);

  const checkedInTime = status === 'in' ? (checked_in_at || new Date().toISOString()) : null;

  try {
    stmt.run(userId, status, checkedInTime, room_id);
    return getPresenceState(userId);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new Error('User does not exist');
    }
    throw error;
  }
}

/**
 * Get all users currently present (status = 'in')
 * @returns {Array} Array of presence states with user info
 */
function getAllPresent() {
  const stmt = db.prepare(`
    SELECT ps.*, u.name as user_name, u.email as user_email, u.avatar_url
    FROM presence_state ps
    JOIN users u ON ps.user_id = u.id
    WHERE ps.status = 'in'
    ORDER BY ps.checked_in_at ASC
  `);
  return stmt.all();
}

/**
 * Create a presence event (historical log entry)
 * @param {Object} eventData - Event data
 * @param {number} eventData.user_id - User ID
 * @param {string} eventData.type - Event type (e.g., 'check_in', 'check_out')
 * @param {string} [eventData.source] - Event source (e.g., 'qr', 'nfc', 'manual')
 * @param {string} [eventData.room_id] - Room identifier
 * @param {string} [eventData.timestamp] - Event timestamp
 * @param {Object} [eventData.payload] - Additional event data (will be JSON stringified)
 * @returns {Object} Created event with ID
 */
function createPresenceEvent({ user_id, type, source = null, room_id = null, timestamp = null, payload = null }) {
  const stmt = db.prepare(`
    INSERT INTO presence_events (user_id, type, source, room_id, timestamp, payload)
    VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), ?)
  `);

  const payloadStr = payload ? JSON.stringify(payload) : null;

  try {
    const result = stmt.run(user_id, type, source, room_id, timestamp, payloadStr);
    return {
      id: result.lastInsertRowid,
      user_id,
      type,
      source,
      room_id,
      timestamp: timestamp || new Date().toISOString(),
      payload
    };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new Error('User does not exist');
    }
    throw error;
  }
}

/**
 * Get presence events with filtering options
 * @param {Object} [options] - Query options
 * @param {number} [options.user_id] - Filter by user ID
 * @param {string} [options.type] - Filter by event type
 * @param {string} [options.from] - Start date (ISO string)
 * @param {string} [options.to] - End date (ISO string)
 * @param {number} [options.limit] - Maximum number of results
 * @param {number} [options.offset] - Number of results to skip
 * @returns {Array} Array of presence events
 */
function getPresenceEvents(options = {}) {
  const { user_id, type, from, to, limit = 100, offset = 0 } = options;

  let query = `
    SELECT pe.*, u.name as user_name, u.email as user_email
    FROM presence_events pe
    JOIN users u ON pe.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (user_id !== undefined) {
    query += ' AND pe.user_id = ?';
    params.push(user_id);
  }

  if (type) {
    query += ' AND pe.type = ?';
    params.push(type);
  }

  if (from) {
    query += ' AND pe.timestamp >= ?';
    params.push(from);
  }

  if (to) {
    query += ' AND pe.timestamp <= ?';
    params.push(to);
  }

  query += ' ORDER BY pe.timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(query);
  const results = stmt.all(...params);

  // Parse payload JSON
  return results.map(event => ({
    ...event,
    payload: event.payload ? JSON.parse(event.payload) : null
  }));
}

// ============================================================================
// Kiosk Token Operations
// ============================================================================

/**
 * Create a kiosk token
 * @param {Object} tokenData - Token data
 * @param {string} tokenData.kiosk_id - Kiosk identifier
 * @param {string} tokenData.token_hash - Hashed token value
 * @param {string} tokenData.expires_at - Expiration datetime (ISO string)
 * @returns {Object} Created token record
 */
function createKioskToken({ kiosk_id, token_hash, expires_at }) {
  const stmt = db.prepare(`
    INSERT INTO kiosk_tokens (kiosk_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `);

  const result = stmt.run(kiosk_id, token_hash, expires_at);
  return {
    id: result.lastInsertRowid,
    kiosk_id,
    token_hash,
    expires_at,
    created_at: new Date().toISOString(),
    used_at: null
  };
}

/**
 * Validate a kiosk token
 * @param {string} kioskId - Kiosk identifier
 * @param {string} tokenHash - Hashed token to validate
 * @returns {Object|null} Token record if valid, null if invalid/expired/used
 */
function validateKioskToken(kioskId, tokenHash) {
  const stmt = db.prepare(`
    SELECT * FROM kiosk_tokens
    WHERE kiosk_id = ?
      AND token_hash = ?
      AND expires_at > datetime('now')
      AND used_at IS NULL
  `);

  return stmt.get(kioskId, tokenHash) || null;
}

/**
 * Invalidate (mark as used) a kiosk token
 * @param {number} tokenId - Token ID
 * @returns {boolean} True if token was invalidated
 */
function invalidateKioskToken(tokenId) {
  const stmt = db.prepare(`
    UPDATE kiosk_tokens
    SET used_at = datetime('now')
    WHERE id = ? AND used_at IS NULL
  `);

  const result = stmt.run(tokenId);
  return result.changes > 0;
}

/**
 * Clean up expired kiosk tokens
 * @returns {number} Number of deleted tokens
 */
function cleanupExpiredTokens() {
  const stmt = db.prepare(`
    DELETE FROM kiosk_tokens
    WHERE expires_at <= datetime('now')
      OR used_at IS NOT NULL
  `);

  const result = stmt.run();
  return result.changes;
}

/**
 * Store a kiosk token (used by kioskService)
 * @param {Object} tokenData - Token data
 * @param {string} tokenData.kioskId - Kiosk identifier
 * @param {string} tokenData.hashedToken - Hashed token value
 * @param {Date} tokenData.expiresAt - Expiration datetime
 * @param {boolean} tokenData.used - Whether token has been used
 * @returns {Object} Created token record
 */
function storeToken({ kioskId, hashedToken, expiresAt, used }) {
  const expiresAtStr = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;
  const usedAt = used ? new Date().toISOString() : null;

  const stmt = db.prepare(`
    INSERT INTO kiosk_tokens (kiosk_id, token_hash, expires_at, used_at)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(kioskId, hashedToken, expiresAtStr, usedAt);
  return {
    id: result.lastInsertRowid,
    kioskId,
    hashedToken,
    expiresAt: expiresAtStr,
    used
  };
}

/**
 * Find a token by its hash (used by kioskService)
 * @param {string} hashedToken - The hashed token to find
 * @returns {Object|null} Token record with kioskId, expiresAt, used or null if not found
 */
function findToken(hashedToken) {
  const stmt = db.prepare(`
    SELECT kiosk_id, expires_at, used_at
    FROM kiosk_tokens
    WHERE token_hash = ?
  `);

  const row = stmt.get(hashedToken);
  if (!row) {
    return null;
  }

  return {
    kioskId: row.kiosk_id,
    expiresAt: row.expires_at,
    used: row.used_at !== null
  };
}

/**
 * Mark a token as used by its hash (used by kioskService)
 * @param {string} hashedToken - The hashed token to mark as used
 * @returns {boolean} True if token was updated
 */
function markTokenUsed(hashedToken) {
  const stmt = db.prepare(`
    UPDATE kiosk_tokens
    SET used_at = datetime('now')
    WHERE token_hash = ? AND used_at IS NULL
  `);

  const result = stmt.run(hashedToken);
  return result.changes > 0;
}

/**
 * Invalidate all tokens for a specific kiosk (used by kioskService)
 * @param {string} kioskId - The kiosk identifier
 * @returns {number} Number of tokens invalidated
 */
function invalidateTokensForKiosk(kioskId) {
  const stmt = db.prepare(`
    UPDATE kiosk_tokens
    SET used_at = datetime('now')
    WHERE kiosk_id = ? AND used_at IS NULL
  `);

  const result = stmt.run(kioskId);
  return result.changes;
}

/**
 * Delete expired tokens (used by kioskService)
 * @param {Date} now - Current datetime
 * @returns {Object} Object with deletedCount property
 */
function deleteExpiredTokens(now) {
  const nowStr = now instanceof Date ? now.toISOString() : now;

  const stmt = db.prepare(`
    DELETE FROM kiosk_tokens
    WHERE expires_at <= ? OR used_at IS NOT NULL
  `);

  const result = stmt.run(nowStr);
  return { deletedCount: result.changes };
}

// ============================================================================
// Database Utilities
// ============================================================================

/**
 * Close the database connection
 * Use when shutting down the application
 */
function closeDatabase() {
  db.close();
}

/**
 * Get the raw database instance for advanced operations
 * Use with caution - prefer using the exported functions
 * @returns {Database} better-sqlite3 database instance
 */
function getDatabase() {
  return db;
}

// Export all functions
module.exports = {
  // Initialization
  initDatabase,
  closeDatabase,
  getDatabase,

  // User operations
  createUser,
  getUserById,
  getUserByEmail,
  getUserByGoogleId,
  updateUser,

  // User aliases (for authService compatibility)
  findUserByGoogleId: getUserByGoogleId,
  findUserById: getUserById,

  // Session operations
  createSession,
  getSessionByToken,
  deleteSession,
  deleteExpiredSessions,
  findSessionByTokenHash,
  createSessionWithHash,

  // Presence operations
  getPresenceState,
  setPresenceState,
  getAllPresent,
  createPresenceEvent,
  getPresenceEvents,

  // Kiosk token operations
  createKioskToken,
  validateKioskToken,
  invalidateKioskToken,
  cleanupExpiredTokens,

  // Kiosk token operations (for kioskService compatibility)
  storeToken,
  findToken,
  markTokenUsed,
  invalidateTokensForKiosk,
  deleteExpiredTokens
};
