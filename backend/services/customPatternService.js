/**
 * Custom Pattern Service
 *
 * Handles storage, validation, and management of user-created
 * custom patterns for the Oasis Mini sand table.
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const db = require('../db');

/**
 * Generate a UUID v4 using Node's built-in crypto
 */
function generateUUID() {
  return crypto.randomUUID();
}

// Directory for custom pattern files
const CUSTOM_PATTERNS_DIR = path.join(__dirname, '../public/patterns/custom');

// Ensure directory exists
async function ensureDirectory() {
  try {
    await fs.mkdir(CUSTOM_PATTERNS_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Validate theta-rho file format
 * @param {string} data - Raw .thr file content
 * @returns {{ valid: boolean, error?: string, pointCount?: number, flavor?: string }}
 */
function validateThetaRhoFormat(data) {
  if (!data || typeof data !== 'string') {
    return { valid: false, error: 'Pattern data is required' };
  }

  const lines = data
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (lines.length < 2) {
    return { valid: false, error: 'Pattern must have at least 2 points' };
  }

  // Parse and validate all points
  const points = [];

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 2) {
      return {
        valid: false,
        error: `Invalid point format at line ${i + 1}: "${lines[i]}"`,
      };
    }

    const theta = parseFloat(parts[0]);
    const rho = parseFloat(parts[1]);

    if (isNaN(theta) || isNaN(rho)) {
      return {
        valid: false,
        error: `Invalid numeric values at line ${i + 1}: "${lines[i]}"`,
      };
    }

    if (rho < 0 || rho > 1) {
      return {
        valid: false,
        error: `Rho value must be 0-1, got ${rho} at line ${i + 1}`,
      };
    }

    points.push({ theta, rho });
  }

  // Check start/end rho values (must be near 0 or 1)
  const firstRho = points[0].rho;
  const lastRho = points[points.length - 1].rho;

  const isValidEndpoint = (rho) => rho < 0.05 || rho > 0.95;

  if (!isValidEndpoint(firstRho)) {
    return {
      valid: false,
      error: `Pattern must start with rho near 0 or 1, got ${firstRho.toFixed(3)}`,
    };
  }

  if (!isValidEndpoint(lastRho)) {
    return {
      valid: false,
      error: `Pattern must end with rho near 0 or 1, got ${lastRho.toFixed(3)}`,
    };
  }

  // Determine track flavor
  const startAtCenter = firstRho < 0.5;
  const endAtCenter = lastRho < 0.5;
  let flavor;
  if (startAtCenter && endAtCenter) flavor = '00';
  else if (startAtCenter && !endAtCenter) flavor = '01';
  else if (!startAtCenter && endAtCenter) flavor = '10';
  else flavor = '11';

  return {
    valid: true,
    pointCount: points.length,
    flavor,
  };
}

/**
 * Save a custom pattern
 * @param {Object} patternData - Pattern data
 * @param {string} patternData.name - Pattern name
 * @param {string} patternData.thetaRhoData - Raw .thr file content
 * @param {string} patternData.previewSvg - SVG preview for thumbnail
 * @param {number} patternData.createdByUserId - User ID
 * @param {Object} [patternData.config] - Optional pattern config for reference
 * @returns {Promise<Object>} Created pattern record
 */
async function saveCustomPattern({
  name,
  thetaRhoData,
  previewSvg,
  createdByUserId,
  config = null,
}) {
  await ensureDirectory();

  // Validate pattern data
  const validation = validateThetaRhoFormat(thetaRhoData);
  if (!validation.valid) {
    throw new Error(`Invalid pattern: ${validation.error}`);
  }

  // Validate name
  if (!name || name.trim().length === 0) {
    throw new Error('Pattern name is required');
  }

  const safeName = name.trim().slice(0, 100); // Limit name length
  const patternId = generateUUID();

  // Save .thr file
  const thrPath = path.join(CUSTOM_PATTERNS_DIR, `${patternId}.thr`);
  await fs.writeFile(thrPath, thetaRhoData, 'utf8');

  // Save SVG preview if provided
  let svgPath = null;
  if (previewSvg) {
    svgPath = path.join(CUSTOM_PATTERNS_DIR, `${patternId}.svg`);
    await fs.writeFile(svgPath, previewSvg, 'utf8');
  }

  // Save config JSON if provided
  if (config) {
    const configPath = path.join(CUSTOM_PATTERNS_DIR, `${patternId}.json`);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  // Register in database
  const dbPattern = createCustomPatternRecord({
    id: patternId,
    name: safeName,
    thrPath: `patterns/custom/${patternId}.thr`,
    svgPath: svgPath ? `patterns/custom/${patternId}.svg` : null,
    pointCount: validation.pointCount,
    flavor: validation.flavor,
    createdByUserId,
    configJson: config ? JSON.stringify(config) : null,
  });

  return {
    id: patternId,
    name: safeName,
    thrUrl: `/patterns/custom/${patternId}.thr`,
    thumbnailUrl: svgPath ? `/patterns/custom/${patternId}.svg` : null,
    pointCount: validation.pointCount,
    flavor: validation.flavor,
    createdByUserId,
    createdAt: dbPattern.created_at,
  };
}

/**
 * Get a custom pattern by ID
 * @param {string} patternId - Pattern ID
 * @returns {Object|null} Pattern record or null
 */
function getCustomPatternById(patternId) {
  const stmt = db.getDatabase().prepare(`
    SELECT cp.*, u.name as created_by_name, u.email as created_by_email
    FROM custom_patterns cp
    LEFT JOIN users u ON cp.created_by_user_id = u.id
    WHERE cp.id = ?
  `);

  const pattern = stmt.get(patternId);
  if (!pattern) return null;

  return {
    id: pattern.id,
    name: pattern.name,
    thrUrl: `/${pattern.thr_path}`,
    thumbnailUrl: pattern.svg_path ? `/${pattern.svg_path}` : null,
    pointCount: pattern.point_count,
    flavor: pattern.flavor,
    playCount: pattern.play_count,
    isPublic: !!pattern.is_public,
    createdByUserId: pattern.created_by_user_id,
    createdByName: pattern.created_by_name,
    createdByEmail: pattern.created_by_email,
    createdAt: pattern.created_at,
    config: pattern.config_json ? JSON.parse(pattern.config_json) : null,
  };
}

/**
 * Get all public custom patterns
 * @param {Object} [options] - Query options
 * @param {number} [options.limit=50] - Max patterns to return
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {Array} Array of pattern records
 */
function getPublicCustomPatterns({ limit = 50, offset = 0 } = {}) {
  const stmt = db.getDatabase().prepare(`
    SELECT cp.*, u.name as created_by_name
    FROM custom_patterns cp
    LEFT JOIN users u ON cp.created_by_user_id = u.id
    WHERE cp.is_public = 1
    ORDER BY cp.created_at DESC
    LIMIT ? OFFSET ?
  `);

  const patterns = stmt.all(limit, offset);

  return patterns.map((p) => ({
    id: p.id,
    name: p.name,
    thrUrl: `/${p.thr_path}`,
    thumbnailUrl: p.svg_path ? `/${p.svg_path}` : null,
    pointCount: p.point_count,
    playCount: p.play_count,
    createdByName: p.created_by_name,
    createdAt: p.created_at,
  }));
}

/**
 * Get custom patterns created by a user
 * @param {number} userId - User ID
 * @returns {Array} Array of pattern records
 */
function getUserCustomPatterns(userId) {
  const stmt = db.getDatabase().prepare(`
    SELECT * FROM custom_patterns
    WHERE created_by_user_id = ?
    ORDER BY created_at DESC
  `);

  const patterns = stmt.all(userId);

  return patterns.map((p) => ({
    id: p.id,
    name: p.name,
    thrUrl: `/${p.thr_path}`,
    thumbnailUrl: p.svg_path ? `/${p.svg_path}` : null,
    pointCount: p.point_count,
    playCount: p.play_count,
    isPublic: !!p.is_public,
    createdAt: p.created_at,
  }));
}

/**
 * Delete a custom pattern (owner only)
 * @param {string} patternId - Pattern ID
 * @param {number} userId - User ID (must be owner)
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteCustomPattern(patternId, userId) {
  // Get pattern to check ownership and get file paths
  const pattern = db.getDatabase().prepare(`
    SELECT * FROM custom_patterns
    WHERE id = ? AND created_by_user_id = ?
  `).get(patternId, userId);

  if (!pattern) {
    return false;
  }

  // Delete database record
  const result = db.getDatabase().prepare(`
    DELETE FROM custom_patterns
    WHERE id = ? AND created_by_user_id = ?
  `).run(patternId, userId);

  if (result.changes === 0) {
    return false;
  }

  // Delete files (ignore errors)
  try {
    await fs.unlink(path.join(__dirname, '../public', pattern.thr_path));
  } catch (e) {
    console.warn(`Failed to delete .thr file: ${e.message}`);
  }

  if (pattern.svg_path) {
    try {
      await fs.unlink(path.join(__dirname, '../public', pattern.svg_path));
    } catch (e) {
      console.warn(`Failed to delete .svg file: ${e.message}`);
    }
  }

  // Delete config JSON if exists
  try {
    await fs.unlink(path.join(CUSTOM_PATTERNS_DIR, `${patternId}.json`));
  } catch (e) {
    // Config file may not exist
  }

  return true;
}

/**
 * Update pattern visibility
 * @param {string} patternId - Pattern ID
 * @param {number} userId - User ID (must be owner)
 * @param {boolean} isPublic - New visibility
 * @returns {boolean} True if updated
 */
function updatePatternVisibility(patternId, userId, isPublic) {
  const result = db.getDatabase().prepare(`
    UPDATE custom_patterns
    SET is_public = ?
    WHERE id = ? AND created_by_user_id = ?
  `).run(isPublic ? 1 : 0, patternId, userId);

  return result.changes > 0;
}

/**
 * Increment play count for a pattern
 * @param {string} patternId - Pattern ID
 */
function incrementPlayCount(patternId) {
  db.getDatabase().prepare(`
    UPDATE custom_patterns
    SET play_count = play_count + 1
    WHERE id = ?
  `).run(patternId);
}

/**
 * Read .thr file content for a pattern
 * @param {string} patternId - Pattern ID
 * @returns {Promise<string|null>} File content or null
 */
async function getPatternThrContent(patternId) {
  const pattern = db.getDatabase().prepare(`
    SELECT thr_path FROM custom_patterns WHERE id = ?
  `).get(patternId);

  if (!pattern) {
    return null;
  }

  try {
    const content = await fs.readFile(
      path.join(__dirname, '../public', pattern.thr_path),
      'utf8'
    );
    return content;
  } catch (error) {
    console.error(`Failed to read .thr file: ${error.message}`);
    return null;
  }
}

// ============================================================================
// Database Operations (private)
// ============================================================================

/**
 * Initialize custom patterns table in database
 * This should be called during db.initDatabase()
 */
function initCustomPatternsTable() {
  const database = db.getDatabase();

  database.exec(`
    CREATE TABLE IF NOT EXISTS custom_patterns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      thr_path TEXT NOT NULL,
      svg_path TEXT,
      point_count INTEGER,
      flavor TEXT,
      config_json TEXT,
      created_by_user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      play_count INTEGER DEFAULT 0,
      is_public INTEGER DEFAULT 1,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_custom_patterns_user
    ON custom_patterns(created_by_user_id)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_custom_patterns_public
    ON custom_patterns(is_public)
  `);
}

/**
 * Create custom pattern database record
 */
function createCustomPatternRecord({
  id,
  name,
  thrPath,
  svgPath,
  pointCount,
  flavor,
  createdByUserId,
  configJson,
}) {
  const database = db.getDatabase();

  // Ensure table exists
  initCustomPatternsTable();

  const stmt = database.prepare(`
    INSERT INTO custom_patterns (
      id, name, thr_path, svg_path, point_count, flavor,
      config_json, created_by_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    name,
    thrPath,
    svgPath,
    pointCount,
    flavor,
    configJson,
    createdByUserId
  );

  return database.prepare('SELECT * FROM custom_patterns WHERE id = ?').get(id);
}

/**
 * Submit a custom pattern to the Oasis queue
 * @param {string} patternId - Custom pattern ID
 * @param {number} userId - User ID
 * @returns {Object} Queue submission
 */
function submitCustomPatternToQueue(patternId, userId) {
  const pattern = getCustomPatternById(patternId);
  if (!pattern) {
    throw new Error('Pattern not found');
  }

  // Create submission using existing Oasis submission system
  // The pattern_id will be the custom pattern URL
  const submission = db.createOasisSubmission({
    patternId: `custom:${patternId}`,
    patternName: `${pattern.name} (custom)`,
    thumbnailUrl: pattern.thumbnailUrl,
    submittedByUserId: userId,
  });

  return submission;
}

module.exports = {
  // Core operations
  saveCustomPattern,
  getCustomPatternById,
  getPublicCustomPatterns,
  getUserCustomPatterns,
  deleteCustomPattern,
  updatePatternVisibility,
  incrementPlayCount,
  getPatternThrContent,

  // Queue integration
  submitCustomPatternToQueue,

  // Validation
  validateThetaRhoFormat,

  // Database initialization
  initCustomPatternsTable,

  // Constants
  CUSTOM_PATTERNS_DIR,
};
