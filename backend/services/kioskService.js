/**
 * Kiosk Token Service for Rotating QR Codes
 *
 * Provides secure, one-time-use tokens for kiosk QR code authentication.
 * Tokens are cryptographically secure, time-limited, and rate-limited.
 */

const crypto = require('crypto');
const db = require('../db.js');

// Configuration
const TOKEN_EXPIRY_SECONDS = parseInt(process.env.TOKEN_EXPIRY_SECONDS, 10) || 60;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// In-memory storage for rate limiting and unhashed tokens
const rateLimitMap = new Map(); // IP -> { attempts: number, windowStart: number }
const activeTokensMap = new Map(); // kioskId -> { token: string, hashedToken: string, expiresAt: Date }

/**
 * Hash a token using SHA-256
 * @param {string} token - The raw token to hash
 * @returns {string} - Hex-encoded hash
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically secure token
 * @returns {string} - Base64url encoded token
 */
function generateSecureToken() {
  const buffer = crypto.randomBytes(32);
  // Convert to base64url (URL-safe base64)
  return buffer.toString('base64url');
}

/**
 * Check and update rate limit for an IP address
 * @param {string} clientIp - The client's IP address
 * @returns {{ limited: boolean, remaining: number, resetAt: number }}
 */
function checkRateLimit(clientIp) {
  const now = Date.now();
  let record = rateLimitMap.get(clientIp);

  // Clean up expired window
  if (record && now - record.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.delete(clientIp);
    record = null;
  }

  if (!record) {
    record = { attempts: 0, windowStart: now };
    rateLimitMap.set(clientIp, record);
  }

  const remaining = Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - record.attempts);
  const resetAt = record.windowStart + RATE_LIMIT_WINDOW_MS;

  return {
    limited: record.attempts >= RATE_LIMIT_MAX_ATTEMPTS,
    remaining,
    resetAt
  };
}

/**
 * Increment rate limit counter for an IP
 * @param {string} clientIp - The client's IP address
 */
function incrementRateLimit(clientIp) {
  const now = Date.now();
  let record = rateLimitMap.get(clientIp);

  if (!record || now - record.windowStart >= RATE_LIMIT_WINDOW_MS) {
    record = { attempts: 1, windowStart: now };
  } else {
    record.attempts++;
  }

  rateLimitMap.set(clientIp, record);
}

/**
 * Log a failed validation attempt
 * @param {string} clientIp - The client's IP address
 * @param {string} reason - The reason for failure
 * @param {string} [tokenPreview] - First few chars of token for debugging
 */
function logFailedAttempt(clientIp, reason, tokenPreview = null) {
  const timestamp = new Date().toISOString();
  const preview = tokenPreview ? tokenPreview.substring(0, 8) + '...' : 'N/A';
  console.warn(
    `[KIOSK-AUTH-FAIL] ${timestamp} | IP: ${clientIp} | Reason: ${reason} | Token: ${preview}`
  );
}

/**
 * Generate a new token for a kiosk
 * @param {string} kioskId - The kiosk identifier (e.g., 'entry1', 'entry2')
 * @returns {Promise<{ token: string, expiresAt: Date, qrData: string }>}
 */
async function generateToken(kioskId) {
  if (!kioskId || typeof kioskId !== 'string') {
    throw new Error('Invalid kioskId: must be a non-empty string');
  }

  const token = generateSecureToken();
  const hashedToken = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_SECONDS * 1000);
  const qrData = `/tap/${kioskId}?token=${token}`;

  // Store hashed token in database
  await db.storeToken({
    kioskId,
    hashedToken,
    expiresAt,
    used: false
  });

  // Keep unhashed token in memory briefly for QR display
  activeTokensMap.set(kioskId, {
    token,
    hashedToken,
    expiresAt
  });

  return {
    token,
    expiresAt,
    qrData
  };
}

/**
 * Validate a token and mark it as used
 * @param {string} token - The raw token to validate
 * @param {string} clientIp - The client's IP address for rate limiting
 * @returns {Promise<{ valid: boolean, kioskId?: string, error?: string }>}
 */
async function validateToken(token, clientIp) {
  // Check rate limiting first
  const rateLimit = checkRateLimit(clientIp);
  if (rateLimit.limited) {
    logFailedAttempt(clientIp, 'Rate limit exceeded', token);
    return {
      valid: false,
      error: 'Rate limit exceeded. Please wait before trying again.'
    };
  }

  // Increment attempt counter before validation
  incrementRateLimit(clientIp);

  // Validate token format
  if (!token || typeof token !== 'string' || token.length < 10) {
    logFailedAttempt(clientIp, 'Invalid token format', token);
    return {
      valid: false,
      error: 'Invalid token format'
    };
  }

  const hashedToken = hashToken(token);

  try {
    // Look up token in database
    const tokenRecord = await db.findToken(hashedToken);

    if (!tokenRecord) {
      logFailedAttempt(clientIp, 'Token not found', token);
      return {
        valid: false,
        error: 'Invalid or expired token'
      };
    }

    // Check if already used (one-time use)
    if (tokenRecord.used) {
      logFailedAttempt(clientIp, 'Token already used', token);
      return {
        valid: false,
        error: 'Token has already been used'
      };
    }

    // Check expiration
    const now = new Date();
    if (new Date(tokenRecord.expiresAt) < now) {
      logFailedAttempt(clientIp, 'Token expired', token);
      return {
        valid: false,
        error: 'Token has expired'
      };
    }

    // Mark token as used (invalidate immediately)
    await db.markTokenUsed(hashedToken);

    // Remove from active tokens map if present
    const activeToken = activeTokensMap.get(tokenRecord.kioskId);
    if (activeToken && activeToken.hashedToken === hashedToken) {
      activeTokensMap.delete(tokenRecord.kioskId);
    }

    return {
      valid: true,
      kioskId: tokenRecord.kioskId
    };
  } catch (error) {
    console.error('[KIOSK-AUTH-ERROR] Database error during validation:', error.message);
    return {
      valid: false,
      error: 'Internal validation error'
    };
  }
}

/**
 * Get the current active token for a kiosk (for display purposes)
 * @param {string} kioskId - The kiosk identifier
 * @returns {Promise<{ token: string, expiresAt: Date, qrData: string } | null>}
 */
async function getActiveToken(kioskId) {
  if (!kioskId || typeof kioskId !== 'string') {
    return null;
  }

  const activeToken = activeTokensMap.get(kioskId);

  if (!activeToken) {
    return null;
  }

  // Check if token is still valid (not expired)
  const now = new Date();
  if (activeToken.expiresAt < now) {
    activeTokensMap.delete(kioskId);
    return null;
  }

  // Verify token hasn't been used in the database
  try {
    const tokenRecord = await db.findToken(activeToken.hashedToken);
    if (!tokenRecord || tokenRecord.used) {
      activeTokensMap.delete(kioskId);
      return null;
    }
  } catch (error) {
    console.error('[KIOSK-TOKEN] Error checking token status:', error.message);
    return null;
  }

  return {
    token: activeToken.token,
    expiresAt: activeToken.expiresAt,
    qrData: `/tap/${kioskId}?token=${activeToken.token}`
  };
}

/**
 * Rotate the token for a kiosk - generate new token and invalidate old one
 * @param {string} kioskId - The kiosk identifier
 * @returns {Promise<{ token: string, expiresAt: Date, qrData: string }>}
 */
async function rotateToken(kioskId) {
  if (!kioskId || typeof kioskId !== 'string') {
    throw new Error('Invalid kioskId: must be a non-empty string');
  }

  // Invalidate existing token for this kiosk
  const existingToken = activeTokensMap.get(kioskId);
  if (existingToken) {
    try {
      await db.invalidateTokensForKiosk(kioskId);
    } catch (error) {
      console.error('[KIOSK-TOKEN] Error invalidating old tokens:', error.message);
      // Continue with generating new token even if invalidation fails
    }
    activeTokensMap.delete(kioskId);
  }

  // Generate and return new token
  return generateToken(kioskId);
}

/**
 * Clean up expired tokens from the database
 * @returns {Promise<{ deletedCount: number }>}
 */
async function cleanupExpiredTokens() {
  const now = new Date();

  // Clean up in-memory active tokens
  for (const [kioskId, tokenData] of activeTokensMap.entries()) {
    if (tokenData.expiresAt < now) {
      activeTokensMap.delete(kioskId);
    }
  }

  // Clean up rate limit entries
  for (const [ip, record] of rateLimitMap.entries()) {
    if (Date.now() - record.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }

  // Clean up expired tokens in database
  try {
    const result = await db.deleteExpiredTokens(now);
    return { deletedCount: result.deletedCount || 0 };
  } catch (error) {
    console.error('[KIOSK-TOKEN] Error cleaning up expired tokens:', error.message);
    return { deletedCount: 0 };
  }
}

/**
 * Get rate limit status for an IP address
 * @param {string} clientIp - The client's IP address
 * @returns {{ limited: boolean, remaining: number, resetAt: number, attemptsUsed: number }}
 */
function getRateLimitStatus(clientIp) {
  const now = Date.now();
  const record = rateLimitMap.get(clientIp);

  if (!record || now - record.windowStart >= RATE_LIMIT_WINDOW_MS) {
    return {
      limited: false,
      remaining: RATE_LIMIT_MAX_ATTEMPTS,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
      attemptsUsed: 0
    };
  }

  return {
    limited: record.attempts >= RATE_LIMIT_MAX_ATTEMPTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - record.attempts),
    resetAt: record.windowStart + RATE_LIMIT_WINDOW_MS,
    attemptsUsed: record.attempts
  };
}

module.exports = {
  generateToken,
  validateToken,
  getActiveToken,
  rotateToken,
  cleanupExpiredTokens,
  getRateLimitStatus
};
