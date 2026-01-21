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

    // ========================================================================
    // Music Control Tables
    // ========================================================================

    // Add volume_preference to users table if not exists
    try {
      db.exec(`ALTER TABLE users ADD COLUMN volume_preference TEXT DEFAULT 'medium'`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Taste definitions (chill, upbeat, focus, etc.)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tastes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // User taste preferences (up to 3 per user)
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_tastes (
        user_id INTEGER NOT NULL,
        taste_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, taste_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (taste_id) REFERENCES tastes(id) ON DELETE CASCADE
      )
    `);

    // Taste bucket tracks (Spotify track URLs per taste)
    db.exec(`
      CREATE TABLE IF NOT EXISTS taste_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taste_id TEXT NOT NULL,
        track_url TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        added_by_user_id INTEGER,
        added_at TEXT DEFAULT (datetime('now')),
        last_played_at TEXT,
        play_count INTEGER DEFAULT 0,
        UNIQUE(taste_id, track_url),
        FOREIGN KEY (taste_id) REFERENCES tastes(id) ON DELETE CASCADE,
        FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // User-submitted tracks (priority queue)
    db.exec(`
      CREATE TABLE IF NOT EXISTS music_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_url TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        thumbnail TEXT,
        submitted_by_user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'playing', 'played', 'failed')),
        fail_reason TEXT,
        played_at TEXT,
        FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Add thumbnail column to existing tables if not exists
    try {
      db.exec(`ALTER TABLE music_submissions ADD COLUMN thumbnail TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Votes on submissions
    db.exec(`
      CREATE TABLE IF NOT EXISTS music_votes (
        submission_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        value INTEGER NOT NULL CHECK(value IN (-1, 0, 1)),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (submission_id, user_id),
        FOREIGN KEY (submission_id) REFERENCES music_submissions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Play history
    db.exec(`
      CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_url TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        source TEXT NOT NULL CHECK(source IN ('submission', 'taste')),
        taste_id TEXT,
        submission_id INTEGER,
        started_at TEXT DEFAULT (datetime('now')),
        ended_at TEXT,
        result TEXT DEFAULT 'playing' CHECK(result IN ('playing', 'completed', 'failed', 'skipped')),
        fail_reason TEXT,
        FOREIGN KEY (taste_id) REFERENCES tastes(id) ON DELETE SET NULL,
        FOREIGN KEY (submission_id) REFERENCES music_submissions(id) ON DELETE SET NULL
      )
    `);

    // Add album_art column to play_history if not exists
    try {
      db.exec(`ALTER TABLE play_history ADD COLUMN album_art TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Presence context snapshot at play time
    db.exec(`
      CREATE TABLE IF NOT EXISTS play_context (
        play_history_id INTEGER PRIMARY KEY,
        cafe_user_ids TEXT,
        office_user_ids TEXT,
        weights_json TEXT,
        volume_level TEXT,
        FOREIGN KEY (play_history_id) REFERENCES play_history(id) ON DELETE CASCADE
      )
    `);

    // Scheduler state (singleton row)
    db.exec(`
      CREATE TABLE IF NOT EXISTS scheduler_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_running INTEGER DEFAULT 0,
        is_paused INTEGER DEFAULT 0,
        current_play_id INTEGER,
        recent_taste_ids TEXT,
        recent_track_urls TEXT,
        last_poll_at TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (current_play_id) REFERENCES play_history(id) ON DELETE SET NULL
      )
    `);

    // Music control indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_tastes_user_id ON user_tastes(user_id);
      CREATE INDEX IF NOT EXISTS idx_taste_tracks_taste_id ON taste_tracks(taste_id);
      CREATE INDEX IF NOT EXISTS idx_music_submissions_status ON music_submissions(status);
      CREATE INDEX IF NOT EXISTS idx_music_submissions_created_at ON music_submissions(created_at);
      CREATE INDEX IF NOT EXISTS idx_music_votes_submission_id ON music_votes(submission_id);
      CREATE INDEX IF NOT EXISTS idx_play_history_started_at ON play_history(started_at);
    `);

    // Insert default tastes if not exist
    const insertTaste = db.prepare(`
      INSERT OR IGNORE INTO tastes (id, name, description) VALUES (?, ?, ?)
    `);
    insertTaste.run('default', 'Default', 'General mix for users without preferences');
    insertTaste.run('chill', 'Chill', 'Relaxed, laid-back vibes');
    insertTaste.run('upbeat', 'Upbeat', 'Energetic and positive');
    insertTaste.run('focus', 'Focus', 'Concentration-friendly, minimal lyrics');
    insertTaste.run('instrumental', 'Instrumental', 'No vocals, pure music');

    // Initialize scheduler state if not exists
    db.exec(`
      INSERT OR IGNORE INTO scheduler_state (id, recent_taste_ids, recent_track_urls)
      VALUES (1, '[]', '[]')
    `);

    // ========================================================================
    // Oasis Sand Table Tables
    // ========================================================================

    // Available patterns (cached from Oasis browse_media)
    db.exec(`
      CREATE TABLE IF NOT EXISTS oasis_patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        thumbnail_url TEXT,
        duration_seconds INTEGER,
        cached_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Pattern submissions (queue)
    db.exec(`
      CREATE TABLE IF NOT EXISTS oasis_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        pattern_name TEXT,
        thumbnail_url TEXT,
        submitted_by_user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'playing', 'played', 'failed')),
        played_at TEXT,
        FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Votes on pattern submissions
    db.exec(`
      CREATE TABLE IF NOT EXISTS oasis_votes (
        submission_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        value INTEGER NOT NULL CHECK(value IN (-1, 0, 1)),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (submission_id, user_id),
        FOREIGN KEY (submission_id) REFERENCES oasis_submissions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Favorite patterns (for empty queue fallback)
    db.exec(`
      CREATE TABLE IF NOT EXISTS oasis_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL UNIQUE,
        pattern_name TEXT,
        thumbnail_url TEXT,
        added_by_user_id INTEGER,
        added_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // LED pattern submissions
    db.exec(`
      CREATE TABLE IF NOT EXISTS oasis_led_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        effect_name TEXT NOT NULL,
        color_hex TEXT,
        brightness INTEGER DEFAULT 128,
        submitted_by_user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'active', 'played')),
        activated_at TEXT,
        FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Votes on LED submissions
    db.exec(`
      CREATE TABLE IF NOT EXISTS oasis_led_votes (
        submission_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        value INTEGER NOT NULL CHECK(value IN (-1, 0, 1)),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (submission_id, user_id),
        FOREIGN KEY (submission_id) REFERENCES oasis_led_submissions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Default LED patterns (for empty queue)
    db.exec(`
      CREATE TABLE IF NOT EXISTS oasis_led_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        effect_name TEXT NOT NULL,
        color_hex TEXT,
        brightness INTEGER DEFAULT 128,
        added_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Oasis scheduler state
    db.exec(`
      CREATE TABLE IF NOT EXISTS oasis_scheduler_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_running INTEGER DEFAULT 0,
        is_paused INTEGER DEFAULT 0,
        current_pattern_submission_id INTEGER,
        current_led_submission_id INTEGER,
        led_change_interval_minutes INTEGER DEFAULT 10,
        last_led_change_at TEXT,
        last_poll_at TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (current_pattern_submission_id) REFERENCES oasis_submissions(id) ON DELETE SET NULL,
        FOREIGN KEY (current_led_submission_id) REFERENCES oasis_led_submissions(id) ON DELETE SET NULL
      )
    `);

    // Oasis indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_oasis_submissions_status ON oasis_submissions(status);
      CREATE INDEX IF NOT EXISTS idx_oasis_submissions_created_at ON oasis_submissions(created_at);
      CREATE INDEX IF NOT EXISTS idx_oasis_votes_submission_id ON oasis_votes(submission_id);
      CREATE INDEX IF NOT EXISTS idx_oasis_led_submissions_status ON oasis_led_submissions(status);
      CREATE INDEX IF NOT EXISTS idx_oasis_led_votes_submission_id ON oasis_led_votes(submission_id);
    `);

    // Initialize oasis scheduler state if not exists
    db.exec(`
      INSERT OR IGNORE INTO oasis_scheduler_state (id, led_change_interval_minutes)
      VALUES (1, 10)
    `);

    // Insert default LED favorites if empty
    const ledFavCount = db.prepare('SELECT COUNT(*) as count FROM oasis_led_favorites').get();
    if (ledFavCount.count === 0) {
      const insertLedFav = db.prepare(`
        INSERT INTO oasis_led_favorites (effect_name, color_hex, brightness) VALUES (?, ?, ?)
      `);
      insertLedFav.run('Rainbow', null, 128);
      insertLedFav.run('Glitter', '#FF6600', 150);
      insertLedFav.run('Confetti', null, 128);
    }
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
// Music Control Operations
// ============================================================================

/**
 * Normalize a Spotify track URL to the standard format
 * Accepts: https://open.spotify.com/track/ID or spotify:track:ID
 * Returns: spotify:track:ID (for Sonos playback)
 */
function normalizeTrackUrl(url) {
  if (!url) return null;

  // Already in spotify:track:ID format
  if (url.startsWith('spotify:track:')) {
    return url;
  }

  // Extract ID from https://open.spotify.com/track/ID?...
  const match = url.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (match) {
    return `spotify:track:${match[1]}`;
  }

  // Return as-is if we can't parse it
  return url;
}

/**
 * Get all available tastes
 * @returns {Array} Array of taste objects
 */
function getAllTastes() {
  const stmt = db.prepare('SELECT * FROM tastes ORDER BY name');
  return stmt.all();
}

/**
 * Get a taste by ID
 * @param {string} tasteId - Taste ID
 * @returns {Object|null} Taste object or null
 */
function getTasteById(tasteId) {
  const stmt = db.prepare('SELECT * FROM tastes WHERE id = ?');
  return stmt.get(tasteId) || null;
}

/**
 * Get user's taste preferences
 * @param {number} userId - User ID
 * @returns {Array} Array of taste IDs
 */
function getUserTastes(userId) {
  const stmt = db.prepare(`
    SELECT taste_id FROM user_tastes
    WHERE user_id = ?
    ORDER BY created_at
  `);
  return stmt.all(userId).map(row => row.taste_id);
}

/**
 * Set user's taste preferences (replaces existing)
 * @param {number} userId - User ID
 * @param {Array<string>} tasteIds - Array of taste IDs (max 3)
 * @returns {Array} Updated taste IDs
 */
function setUserTastes(userId, tasteIds) {
  // Limit to 3 tastes
  const limitedTastes = tasteIds.slice(0, 3);

  const transaction = db.transaction(() => {
    // Delete existing tastes
    db.prepare('DELETE FROM user_tastes WHERE user_id = ?').run(userId);

    // Insert new tastes
    const insert = db.prepare('INSERT INTO user_tastes (user_id, taste_id) VALUES (?, ?)');
    for (const tasteId of limitedTastes) {
      insert.run(userId, tasteId);
    }
  });

  transaction();
  return getUserTastes(userId);
}

/**
 * Get user's volume preference
 * @param {number} userId - User ID
 * @returns {string} Volume preference ('super_quiet', 'soft', 'medium')
 */
function getUserVolume(userId) {
  const stmt = db.prepare('SELECT volume_preference FROM users WHERE id = ?');
  const row = stmt.get(userId);
  return row?.volume_preference || 'medium';
}

/**
 * Set user's volume preference
 * @param {number} userId - User ID
 * @param {string} volume - Volume level ('super_quiet', 'soft', 'medium')
 * @returns {string} Updated volume preference
 */
function setUserVolume(userId, volume) {
  const validVolumes = ['super_quiet', 'soft', 'medium'];
  if (!validVolumes.includes(volume)) {
    throw new Error(`Invalid volume. Must be one of: ${validVolumes.join(', ')}`);
  }

  const stmt = db.prepare('UPDATE users SET volume_preference = ? WHERE id = ?');
  stmt.run(volume, userId);
  return volume;
}

/**
 * Get tracks for a taste bucket
 * @param {string} tasteId - Taste ID
 * @returns {Array} Array of track objects
 */
function getTasteTracks(tasteId) {
  const stmt = db.prepare(`
    SELECT * FROM taste_tracks
    WHERE taste_id = ?
    ORDER BY added_at DESC
  `);
  return stmt.all(tasteId);
}

/**
 * Add a track to a taste bucket
 * @param {Object} trackData - Track data
 * @returns {Object} Created track record
 */
function addTasteTrack({ tasteId, trackUrl, title = null, artist = null, addedByUserId = null }) {
  const normalizedUrl = normalizeTrackUrl(trackUrl);

  const stmt = db.prepare(`
    INSERT INTO taste_tracks (taste_id, track_url, title, artist, added_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    const result = stmt.run(tasteId, normalizedUrl, title, artist, addedByUserId);
    return {
      id: result.lastInsertRowid,
      taste_id: tasteId,
      track_url: normalizedUrl,
      title,
      artist,
      added_by_user_id: addedByUserId
    };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Track already exists in this taste bucket');
    }
    throw error;
  }
}

/**
 * Remove a track from a taste bucket
 * @param {number} trackId - Track ID
 * @returns {boolean} True if deleted
 */
function removeTasteTrack(trackId) {
  const stmt = db.prepare('DELETE FROM taste_tracks WHERE id = ?');
  const result = stmt.run(trackId);
  return result.changes > 0;
}

/**
 * Update track play stats
 * @param {string} trackUrl - Track URL
 * @param {string} tasteId - Taste ID
 */
function updateTrackPlayStats(trackUrl, tasteId) {
  const stmt = db.prepare(`
    UPDATE taste_tracks
    SET last_played_at = datetime('now'), play_count = play_count + 1
    WHERE track_url = ? AND taste_id = ?
  `);
  stmt.run(trackUrl, tasteId);
}

// ----------------------------------------------------------------------------
// Music Submissions
// ----------------------------------------------------------------------------

/**
 * Submit a track to the queue
 * @param {Object} submissionData - Submission data
 * @returns {Object} Created submission
 */
function createSubmission({ trackUrl, title = null, artist = null, thumbnail = null, submittedByUserId }) {
  const normalizedUrl = normalizeTrackUrl(trackUrl);

  const stmt = db.prepare(`
    INSERT INTO music_submissions (track_url, title, artist, thumbnail, submitted_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(normalizedUrl, title, artist, thumbnail, submittedByUserId);
  return getSubmissionById(result.lastInsertRowid);
}

/**
 * Get a submission by ID
 * @param {number} submissionId - Submission ID
 * @returns {Object|null} Submission with vote data
 */
function getSubmissionById(submissionId) {
  const stmt = db.prepare(`
    SELECT s.*, u.name as submitted_by_name, u.email as submitted_by_email
    FROM music_submissions s
    JOIN users u ON s.submitted_by_user_id = u.id
    WHERE s.id = ?
  `);

  const submission = stmt.get(submissionId);
  if (!submission) return null;

  // Get votes
  const votesStmt = db.prepare(`
    SELECT user_id, value FROM music_votes WHERE submission_id = ?
  `);
  const votes = votesStmt.all(submissionId);

  return {
    ...submission,
    votes: votes.reduce((acc, v) => ({ ...acc, [v.user_id]: v.value }), {}),
    upvotes: votes.filter(v => v.value === 1).length,
    downvotes: votes.filter(v => v.value === -1).length
  };
}

/**
 * Get all queued submissions ordered by priority
 * @returns {Array} Ordered submissions
 */
function getQueuedSubmissions() {
  const stmt = db.prepare(`
    SELECT s.*, u.name as submitted_by_name, u.email as submitted_by_email
    FROM music_submissions s
    JOIN users u ON s.submitted_by_user_id = u.id
    WHERE s.status = 'queued'
    ORDER BY s.created_at ASC
  `);

  const submissions = stmt.all();

  // Get votes for all submissions
  const votesStmt = db.prepare(`
    SELECT submission_id, user_id, value FROM music_votes
    WHERE submission_id IN (${submissions.map(() => '?').join(',') || 'NULL'})
  `);

  const allVotes = submissions.length > 0
    ? votesStmt.all(...submissions.map(s => s.id))
    : [];

  // Group votes by submission
  const votesBySubmission = {};
  for (const vote of allVotes) {
    if (!votesBySubmission[vote.submission_id]) {
      votesBySubmission[vote.submission_id] = [];
    }
    votesBySubmission[vote.submission_id].push(vote);
  }

  // Enrich submissions with vote data and compute ordering
  const enriched = submissions.map((s, baseIndex) => {
    const votes = votesBySubmission[s.id] || [];
    const upvotes = votes.filter(v => v.value === 1).length;
    const downvotes = votes.filter(v => v.value === -1).length;

    // Voting algorithm: shift = max(0, ups-1) - max(0, downs-1)
    const shift = Math.max(0, upvotes - 1) - Math.max(0, downvotes - 1);
    const effectiveIndex = baseIndex - shift;

    return {
      ...s,
      votes: votes.reduce((acc, v) => ({ ...acc, [v.user_id]: v.value }), {}),
      upvotes,
      downvotes,
      effectiveIndex,
      baseIndex
    };
  });

  // Sort by effective index, then by created_at
  enriched.sort((a, b) => {
    if (a.effectiveIndex !== b.effectiveIndex) {
      return a.effectiveIndex - b.effectiveIndex;
    }
    return new Date(a.created_at) - new Date(b.created_at);
  });

  return enriched;
}

/**
 * Vote on a submission
 * @param {number} submissionId - Submission ID
 * @param {number} userId - User ID
 * @param {number} value - Vote value (-1, 0, +1)
 * @returns {Object} Updated submission
 */
function voteOnSubmission(submissionId, userId, value) {
  if (![-1, 0, 1].includes(value)) {
    throw new Error('Vote value must be -1, 0, or 1');
  }

  if (value === 0) {
    // Remove vote
    const stmt = db.prepare('DELETE FROM music_votes WHERE submission_id = ? AND user_id = ?');
    stmt.run(submissionId, userId);
  } else {
    // Upsert vote
    const stmt = db.prepare(`
      INSERT INTO music_votes (submission_id, user_id, value)
      VALUES (?, ?, ?)
      ON CONFLICT(submission_id, user_id) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `);
    stmt.run(submissionId, userId, value);
  }

  return getSubmissionById(submissionId);
}

/**
 * Update submission status
 * @param {number} submissionId - Submission ID
 * @param {string} status - New status
 * @param {string} [failReason] - Failure reason if status is 'failed'
 * @returns {Object} Updated submission
 */
function updateSubmissionStatus(submissionId, status, failReason = null) {
  const playedAt = status === 'played' ? new Date().toISOString() : null;

  const stmt = db.prepare(`
    UPDATE music_submissions
    SET status = ?, fail_reason = ?, played_at = COALESCE(?, played_at)
    WHERE id = ?
  `);
  stmt.run(status, failReason, playedAt, submissionId);

  return getSubmissionById(submissionId);
}

/**
 * Delete a submission (only allowed for submitter)
 * @param {number} submissionId - Submission ID
 * @param {number} userId - User ID (must be submitter)
 * @returns {boolean} True if deleted
 */
function deleteSubmission(submissionId, userId) {
  const stmt = db.prepare(`
    DELETE FROM music_submissions
    WHERE id = ? AND submitted_by_user_id = ? AND status = 'queued'
  `);
  const result = stmt.run(submissionId, userId);
  return result.changes > 0;
}

/**
 * Trash a submission (allowed for any user, for rate-limited trash feature)
 * @param {number} submissionId - Submission ID
 * @returns {boolean} True if deleted
 */
function trashSubmission(submissionId) {
  const stmt = db.prepare(`
    DELETE FROM music_submissions
    WHERE id = ? AND status = 'queued'
  `);
  const result = stmt.run(submissionId);
  return result.changes > 0;
}

// ----------------------------------------------------------------------------
// Play History
// ----------------------------------------------------------------------------

/**
 * Create a play history entry
 * @param {Object} playData - Play data
 * @returns {Object} Created play history entry
 */
function createPlayHistory({ trackUrl, title = null, artist = null, albumArt = null, source, tasteId = null, submissionId = null }) {
  const stmt = db.prepare(`
    INSERT INTO play_history (track_url, title, artist, album_art, source, taste_id, submission_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(trackUrl, title, artist, albumArt, source, tasteId, submissionId);
  return getPlayHistoryById(result.lastInsertRowid);
}

/**
 * Get play history by ID
 * @param {number} playId - Play history ID
 * @returns {Object|null} Play history entry
 */
function getPlayHistoryById(playId) {
  const stmt = db.prepare('SELECT * FROM play_history WHERE id = ?');
  return stmt.get(playId) || null;
}

/**
 * Update play history result
 * @param {number} playId - Play history ID
 * @param {string} result - Result ('completed', 'failed', 'skipped')
 * @param {string} [failReason] - Failure reason
 */
function updatePlayHistoryResult(playId, result, failReason = null) {
  const stmt = db.prepare(`
    UPDATE play_history
    SET result = ?, fail_reason = ?, ended_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(result, failReason, playId);
}

/**
 * Create a play context snapshot
 * @param {Object} contextData - Context data
 */
function createPlayContext({ playHistoryId, cafeUserIds, officeUserIds, weightsJson, volumeLevel }) {
  const stmt = db.prepare(`
    INSERT INTO play_context (play_history_id, cafe_user_ids, office_user_ids, weights_json, volume_level)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    playHistoryId,
    JSON.stringify(cafeUserIds),
    JSON.stringify(officeUserIds),
    JSON.stringify(weightsJson),
    volumeLevel
  );
}

/**
 * Get recent play history
 * @param {number} limit - Number of entries to return
 * @returns {Array} Recent play history entries
 */
function getRecentPlayHistory(limit = 20) {
  const stmt = db.prepare(`
    SELECT ph.*, pc.cafe_user_ids, pc.office_user_ids, pc.weights_json, pc.volume_level
    FROM play_history ph
    LEFT JOIN play_context pc ON ph.id = pc.play_history_id
    ORDER BY ph.started_at DESC
    LIMIT ?
  `);

  return stmt.all(limit).map(row => ({
    ...row,
    cafe_user_ids: row.cafe_user_ids ? JSON.parse(row.cafe_user_ids) : [],
    office_user_ids: row.office_user_ids ? JSON.parse(row.office_user_ids) : [],
    weights: row.weights_json ? JSON.parse(row.weights_json) : {}
  }));
}

// ----------------------------------------------------------------------------
// Scheduler State
// ----------------------------------------------------------------------------

/**
 * Get scheduler state
 * @returns {Object} Scheduler state
 */
function getSchedulerState() {
  const stmt = db.prepare('SELECT * FROM scheduler_state WHERE id = 1');
  const state = stmt.get();

  return {
    ...state,
    is_running: !!state.is_running,
    is_paused: !!state.is_paused,
    recent_taste_ids: JSON.parse(state.recent_taste_ids || '[]'),
    recent_track_urls: JSON.parse(state.recent_track_urls || '[]')
  };
}

/**
 * Update scheduler state
 * @param {Object} updates - Fields to update
 */
function updateSchedulerState(updates) {
  const fields = [];
  const values = [];

  if ('is_running' in updates) {
    fields.push('is_running = ?');
    values.push(updates.is_running ? 1 : 0);
  }
  if ('is_paused' in updates) {
    fields.push('is_paused = ?');
    values.push(updates.is_paused ? 1 : 0);
  }
  if ('current_play_id' in updates) {
    fields.push('current_play_id = ?');
    values.push(updates.current_play_id);
  }
  if ('recent_taste_ids' in updates) {
    fields.push('recent_taste_ids = ?');
    values.push(JSON.stringify(updates.recent_taste_ids));
  }
  if ('recent_track_urls' in updates) {
    fields.push('recent_track_urls = ?');
    values.push(JSON.stringify(updates.recent_track_urls));
  }
  if ('last_poll_at' in updates) {
    fields.push('last_poll_at = ?');
    values.push(updates.last_poll_at);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");

  const stmt = db.prepare(`UPDATE scheduler_state SET ${fields.join(', ')} WHERE id = 1`);
  stmt.run(...values);
}

/**
 * Add a taste to recent tastes (maintains last 5)
 * @param {string} tasteId - Taste ID
 */
function addRecentTaste(tasteId) {
  const state = getSchedulerState();
  const recent = state.recent_taste_ids;
  recent.push(tasteId);
  if (recent.length > 5) recent.shift();
  updateSchedulerState({ recent_taste_ids: recent });
}

/**
 * Add a track to recent tracks (maintains last 20)
 * @param {string} trackUrl - Track URL
 */
function addRecentTrack(trackUrl) {
  const state = getSchedulerState();
  const recent = state.recent_track_urls;
  recent.push(trackUrl);
  if (recent.length > 20) recent.shift();
  updateSchedulerState({ recent_track_urls: recent });
}

// ============================================================================
// Oasis Sand Table - Pattern Queue
// ============================================================================

/**
 * Cache pattern from Oasis browse_media
 */
function cacheOasisPattern(pattern) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO oasis_patterns (id, name, thumbnail_url, duration_seconds, cached_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(pattern.id, pattern.name, pattern.thumbnailUrl || null, pattern.durationSeconds || null);
}

/**
 * Get cached patterns
 */
function getOasisPatterns() {
  return db.prepare('SELECT * FROM oasis_patterns ORDER BY name').all();
}

/**
 * Submit a pattern to the queue
 */
function createOasisSubmission({ patternId, patternName, thumbnailUrl, submittedByUserId }) {
  const stmt = db.prepare(`
    INSERT INTO oasis_submissions (pattern_id, pattern_name, thumbnail_url, submitted_by_user_id)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(patternId, patternName, thumbnailUrl, submittedByUserId);
  return getOasisSubmissionById(result.lastInsertRowid);
}

/**
 * Get submission by ID with votes
 */
function getOasisSubmissionById(submissionId) {
  const submission = db.prepare(`
    SELECT s.*, u.name as submitted_by_name, u.email as submitted_by_email
    FROM oasis_submissions s
    JOIN users u ON s.submitted_by_user_id = u.id
    WHERE s.id = ?
  `).get(submissionId);

  if (!submission) return null;

  // Get votes
  const votes = db.prepare(`
    SELECT user_id, value FROM oasis_votes WHERE submission_id = ?
  `).all(submissionId);

  submission.votes = {};
  submission.upvotes = 0;
  submission.downvotes = 0;

  for (const vote of votes) {
    submission.votes[vote.user_id] = vote.value;
    if (vote.value > 0) submission.upvotes++;
    if (vote.value < 0) submission.downvotes++;
  }

  return submission;
}

/**
 * Get queued pattern submissions ordered by votes
 */
function getOasisQueuedSubmissions() {
  const submissions = db.prepare(`
    SELECT s.*, u.name as submitted_by_name, u.email as submitted_by_email
    FROM oasis_submissions s
    JOIN users u ON s.submitted_by_user_id = u.id
    WHERE s.status = 'queued'
    ORDER BY s.created_at ASC
  `).all();

  // Get all votes for queued submissions
  const submissionIds = submissions.map(s => s.id);
  if (submissionIds.length === 0) return [];

  const votes = db.prepare(`
    SELECT submission_id, user_id, value FROM oasis_votes
    WHERE submission_id IN (${submissionIds.map(() => '?').join(',')})
  `).all(...submissionIds);

  // Aggregate votes per submission
  const voteMap = {};
  for (const vote of votes) {
    if (!voteMap[vote.submission_id]) {
      voteMap[vote.submission_id] = { votes: {}, upvotes: 0, downvotes: 0 };
    }
    voteMap[vote.submission_id].votes[vote.user_id] = vote.value;
    if (vote.value > 0) voteMap[vote.submission_id].upvotes++;
    if (vote.value < 0) voteMap[vote.submission_id].downvotes++;
  }

  // Attach votes to each submission
  for (let i = 0; i < submissions.length; i++) {
    const s = submissions[i];
    const v = voteMap[s.id] || { votes: {}, upvotes: 0, downvotes: 0 };
    s.votes = v.votes;
    s.upvotes = v.upvotes;
    s.downvotes = v.downvotes;
    s.netVotes = v.upvotes - v.downvotes;
    s.baseIndex = i; // Original FIFO position
  }

  // Sort by net votes (descending), then by submission time (FIFO - ascending)
  // Most upvoted items appear first; ties are broken by earliest submission
  submissions.sort((a, b) => {
    if (b.netVotes !== a.netVotes) {
      return b.netVotes - a.netVotes; // Higher net votes first
    }
    return a.baseIndex - b.baseIndex; // Earlier submission first (FIFO)
  });

  // Update effectiveIndex to reflect final position
  for (let i = 0; i < submissions.length; i++) {
    submissions[i].effectiveIndex = i;
  }

  return submissions;
}

/**
 * Vote on pattern submission
 */
function voteOasisSubmission(submissionId, userId, value) {
  if (value === 0) {
    db.prepare('DELETE FROM oasis_votes WHERE submission_id = ? AND user_id = ?')
      .run(submissionId, userId);
  } else {
    db.prepare(`
      INSERT INTO oasis_votes (submission_id, user_id, value)
      VALUES (?, ?, ?)
      ON CONFLICT(submission_id, user_id) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).run(submissionId, userId, value, value);
  }
  return getOasisSubmissionById(submissionId);
}

/**
 * Update submission status
 */
function updateOasisSubmissionStatus(submissionId, status) {
  const updates = { status };
  if (status === 'played') {
    db.prepare(`
      UPDATE oasis_submissions SET status = ?, played_at = datetime('now') WHERE id = ?
    `).run(status, submissionId);
  } else {
    db.prepare(`UPDATE oasis_submissions SET status = ? WHERE id = ?`).run(status, submissionId);
  }
  return getOasisSubmissionById(submissionId);
}

/**
 * Delete pattern submission (owner only)
 */
function deleteOasisSubmission(submissionId, userId) {
  const stmt = db.prepare(`
    DELETE FROM oasis_submissions
    WHERE id = ? AND submitted_by_user_id = ? AND status = 'queued'
  `);
  return stmt.run(submissionId, userId).changes > 0;
}

/**
 * Trash pattern submission (any user, for rate-limited trash)
 */
function trashOasisSubmission(submissionId) {
  const stmt = db.prepare(`
    DELETE FROM oasis_submissions WHERE id = ? AND status = 'queued'
  `);
  return stmt.run(submissionId).changes > 0;
}

// ============================================================================
// Oasis Sand Table - LED Queue
// ============================================================================

/**
 * Submit LED pattern to queue
 */
function createOasisLedSubmission({ effectName, colorHex, brightness, submittedByUserId }) {
  const stmt = db.prepare(`
    INSERT INTO oasis_led_submissions (effect_name, color_hex, brightness, submitted_by_user_id)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(effectName, colorHex || null, brightness || 128, submittedByUserId);
  return getOasisLedSubmissionById(result.lastInsertRowid);
}

/**
 * Get LED submission by ID with votes
 */
function getOasisLedSubmissionById(submissionId) {
  const submission = db.prepare(`
    SELECT s.*, u.name as submitted_by_name, u.email as submitted_by_email
    FROM oasis_led_submissions s
    JOIN users u ON s.submitted_by_user_id = u.id
    WHERE s.id = ?
  `).get(submissionId);

  if (!submission) return null;

  const votes = db.prepare(`
    SELECT user_id, value FROM oasis_led_votes WHERE submission_id = ?
  `).all(submissionId);

  submission.votes = {};
  submission.upvotes = 0;
  submission.downvotes = 0;

  for (const vote of votes) {
    submission.votes[vote.user_id] = vote.value;
    if (vote.value > 0) submission.upvotes++;
    if (vote.value < 0) submission.downvotes++;
  }

  return submission;
}

/**
 * Get queued LED submissions
 */
function getOasisLedQueuedSubmissions() {
  const submissions = db.prepare(`
    SELECT s.*, u.name as submitted_by_name, u.email as submitted_by_email
    FROM oasis_led_submissions s
    JOIN users u ON s.submitted_by_user_id = u.id
    WHERE s.status = 'queued'
    ORDER BY s.created_at ASC
  `).all();

  const submissionIds = submissions.map(s => s.id);
  if (submissionIds.length === 0) return [];

  const votes = db.prepare(`
    SELECT submission_id, user_id, value FROM oasis_led_votes
    WHERE submission_id IN (${submissionIds.map(() => '?').join(',')})
  `).all(...submissionIds);

  const voteMap = {};
  for (const vote of votes) {
    if (!voteMap[vote.submission_id]) {
      voteMap[vote.submission_id] = { votes: {}, upvotes: 0, downvotes: 0 };
    }
    voteMap[vote.submission_id].votes[vote.user_id] = vote.value;
    if (vote.value > 0) voteMap[vote.submission_id].upvotes++;
    if (vote.value < 0) voteMap[vote.submission_id].downvotes++;
  }

  // Attach votes to each submission
  for (let i = 0; i < submissions.length; i++) {
    const s = submissions[i];
    const v = voteMap[s.id] || { votes: {}, upvotes: 0, downvotes: 0 };
    s.votes = v.votes;
    s.upvotes = v.upvotes;
    s.downvotes = v.downvotes;
    s.netVotes = v.upvotes - v.downvotes;
    s.baseIndex = i; // Original FIFO position
  }

  // Sort by net votes (descending), then by submission time (FIFO - ascending)
  submissions.sort((a, b) => {
    if (b.netVotes !== a.netVotes) {
      return b.netVotes - a.netVotes; // Higher net votes first
    }
    return a.baseIndex - b.baseIndex; // Earlier submission first (FIFO)
  });

  // Update effectiveIndex to reflect final position
  for (let i = 0; i < submissions.length; i++) {
    submissions[i].effectiveIndex = i;
  }

  return submissions;
}

/**
 * Vote on LED submission
 */
function voteOasisLedSubmission(submissionId, userId, value) {
  if (value === 0) {
    db.prepare('DELETE FROM oasis_led_votes WHERE submission_id = ? AND user_id = ?')
      .run(submissionId, userId);
  } else {
    db.prepare(`
      INSERT INTO oasis_led_votes (submission_id, user_id, value)
      VALUES (?, ?, ?)
      ON CONFLICT(submission_id, user_id) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).run(submissionId, userId, value, value);
  }
  return getOasisLedSubmissionById(submissionId);
}

/**
 * Update LED submission status
 */
function updateOasisLedSubmissionStatus(submissionId, status) {
  if (status === 'active') {
    db.prepare(`
      UPDATE oasis_led_submissions SET status = ?, activated_at = datetime('now') WHERE id = ?
    `).run(status, submissionId);
  } else {
    db.prepare(`UPDATE oasis_led_submissions SET status = ? WHERE id = ?`).run(status, submissionId);
  }
  return getOasisLedSubmissionById(submissionId);
}

/**
 * Trash LED submission
 */
function trashOasisLedSubmission(submissionId) {
  const stmt = db.prepare(`
    DELETE FROM oasis_led_submissions WHERE id = ? AND status = 'queued'
  `);
  return stmt.run(submissionId).changes > 0;
}

// ============================================================================
// Oasis Sand Table - Favorites
// ============================================================================

/**
 * Add pattern to favorites
 */
function addOasisFavorite({ patternId, patternName, thumbnailUrl, addedByUserId }) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO oasis_favorites (pattern_id, pattern_name, thumbnail_url, added_by_user_id, added_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(patternId, patternName, thumbnailUrl, addedByUserId);
}

/**
 * Remove pattern from favorites
 */
function removeOasisFavorite(patternId) {
  db.prepare('DELETE FROM oasis_favorites WHERE pattern_id = ?').run(patternId);
}

/**
 * Get pattern favorites
 */
function getOasisFavorites() {
  return db.prepare('SELECT * FROM oasis_favorites ORDER BY added_at DESC').all();
}

/**
 * Get random pattern favorite
 */
function getRandomOasisFavorite() {
  return db.prepare('SELECT * FROM oasis_favorites ORDER BY RANDOM() LIMIT 1').get();
}

/**
 * Add LED favorite
 */
function addOasisLedFavorite({ effectName, colorHex, brightness }) {
  const stmt = db.prepare(`
    INSERT INTO oasis_led_favorites (effect_name, color_hex, brightness)
    VALUES (?, ?, ?)
  `);
  stmt.run(effectName, colorHex, brightness || 128);
}

/**
 * Get LED favorites
 */
function getOasisLedFavorites() {
  return db.prepare('SELECT * FROM oasis_led_favorites ORDER BY id').all();
}

/**
 * Get random LED favorite
 */
function getRandomOasisLedFavorite() {
  return db.prepare('SELECT * FROM oasis_led_favorites ORDER BY RANDOM() LIMIT 1').get();
}

// ============================================================================
// Oasis Sand Table - Scheduler State
// ============================================================================

/**
 * Get oasis scheduler state
 */
function getOasisSchedulerState() {
  return db.prepare('SELECT * FROM oasis_scheduler_state WHERE id = 1').get();
}

/**
 * Update oasis scheduler state
 */
function updateOasisSchedulerState(updates) {
  const fields = [];
  const values = [];

  if ('is_running' in updates) {
    fields.push('is_running = ?');
    values.push(updates.is_running ? 1 : 0);
  }
  if ('is_paused' in updates) {
    fields.push('is_paused = ?');
    values.push(updates.is_paused ? 1 : 0);
  }
  if ('current_pattern_submission_id' in updates) {
    fields.push('current_pattern_submission_id = ?');
    values.push(updates.current_pattern_submission_id);
  }
  if ('current_led_submission_id' in updates) {
    fields.push('current_led_submission_id = ?');
    values.push(updates.current_led_submission_id);
  }
  if ('led_change_interval_minutes' in updates) {
    fields.push('led_change_interval_minutes = ?');
    values.push(updates.led_change_interval_minutes);
  }
  if ('last_led_change_at' in updates) {
    fields.push('last_led_change_at = ?');
    values.push(updates.last_led_change_at);
  }
  if ('last_poll_at' in updates) {
    fields.push('last_poll_at = ?');
    values.push(updates.last_poll_at);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  db.prepare(`UPDATE oasis_scheduler_state SET ${fields.join(', ')} WHERE id = 1`).run(...values);
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

/**
 * Run a SQL statement with parameters
 * Convenience wrapper for simple update/insert/delete operations
 * @param {string} sql - SQL statement to run
 * @param {Array} params - Parameters to bind
 * @returns {Object} Result info with changes and lastInsertRowid
 */
function run(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

// Export all functions
module.exports = {
  // Initialization
  initDatabase,
  closeDatabase,
  getDatabase,
  run,

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
  deleteExpiredTokens,

  // Music control operations
  normalizeTrackUrl,
  getAllTastes,
  getTasteById,
  getUserTastes,
  setUserTastes,
  getUserVolume,
  setUserVolume,
  getTasteTracks,
  addTasteTrack,
  removeTasteTrack,
  updateTrackPlayStats,

  // Music submissions
  createSubmission,
  getSubmissionById,
  getQueuedSubmissions,
  voteOnSubmission,
  updateSubmissionStatus,
  deleteSubmission,
  trashSubmission,

  // Play history
  createPlayHistory,
  getPlayHistoryById,
  updatePlayHistoryResult,
  createPlayContext,
  getRecentPlayHistory,

  // Scheduler state
  getSchedulerState,
  updateSchedulerState,
  addRecentTaste,
  addRecentTrack,

  // Oasis pattern queue
  cacheOasisPattern,
  getOasisPatterns,
  createOasisSubmission,
  getOasisSubmissionById,
  getOasisQueuedSubmissions,
  voteOasisSubmission,
  updateOasisSubmissionStatus,
  deleteOasisSubmission,
  trashOasisSubmission,

  // Oasis LED queue
  createOasisLedSubmission,
  getOasisLedSubmissionById,
  getOasisLedQueuedSubmissions,
  voteOasisLedSubmission,
  updateOasisLedSubmissionStatus,
  trashOasisLedSubmission,

  // Oasis favorites
  addOasisFavorite,
  removeOasisFavorite,
  getOasisFavorites,
  getRandomOasisFavorite,
  addOasisLedFavorite,
  getOasisLedFavorites,
  getRandomOasisLedFavorite,

  // Oasis scheduler state
  getOasisSchedulerState,
  updateOasisSchedulerState
};
