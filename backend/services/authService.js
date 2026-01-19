const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../db');

// Session token configuration
const SESSION_TOKEN_BYTES = 32;
const SESSION_COOKIE_NAME = 'session_token';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a cryptographically secure random session token
 * @returns {string} Hex-encoded random token
 */
function generateSessionToken() {
  return crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
}

/**
 * Hash a token using SHA-256 for secure storage
 * @param {string} token - The plain text token to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a random state parameter for OAuth CSRF protection
 * @returns {string} Hex-encoded random state value
 */
function generateOAuthState() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Verify OAuth state parameter matches stored state
 * @param {string} storedState - The state stored in session
 * @param {string} returnedState - The state returned from OAuth provider
 * @returns {boolean} True if states match
 */
function verifyOAuthState(storedState, returnedState) {
  if (!storedState || !returnedState) {
    return false;
  }
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(storedState, 'hex'),
      Buffer.from(returnedState, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Get cookie options for session cookie
 * @returns {object} Cookie configuration options
 */
function getSessionCookieOptions() {
  // For cross-origin requests (e.g., different ngrok domains), we need sameSite: 'none'
  // sameSite: 'none' requires secure: true
  const isSecure = process.env.NODE_ENV === 'production' ||
                   process.env.PWA_URL?.startsWith('https://');
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/'
  };
}

/**
 * Configure Passport with Google OAuth strategy
 * @param {Express} app - Express application instance
 */
function configurePassport(app) {
  // Validate required environment variables
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is required');
  }
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_SECRET environment variable is required');
  }
  if (!process.env.GOOGLE_ALLOWED_DOMAIN) {
    throw new Error('GOOGLE_ALLOWED_DOMAIN environment variable is required');
  }

  // Initialize passport
  app.use(passport.initialize());

  // Configure Google OAuth 2.0 Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.AUTH_CALLBACK_URL || '/api/auth/google/callback',
        scope: ['email', 'profile']
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Extract hosted domain from Google profile
          const hostedDomain = profile._json.hd;
          const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN;

          // Verify domain restriction
          if (!hostedDomain || hostedDomain !== allowedDomain) {
            const error = new Error(
              `Access denied: Only users from ${allowedDomain} domain are allowed. ` +
              `Your domain: ${hostedDomain || 'not a Google Workspace account'}`
            );
            error.code = 'DOMAIN_NOT_ALLOWED';
            return done(error, null);
          }

          // Extract user information from profile
          const userInfo = {
            googleId: profile.id,
            email: profile.emails?.[0]?.value,
            displayName: profile.displayName,
            firstName: profile.name?.givenName,
            lastName: profile.name?.familyName,
            profilePhoto: profile.photos?.[0]?.value,
            domain: hostedDomain
          };

          // Find or create user in database
          let user = await db.findUserByGoogleId(profile.id);

          if (!user) {
            user = await db.createUser(userInfo);
          } else {
            // Update user info on each login
            user = await db.updateUser(user.id, userInfo);
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );

  // Serialize user for session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await db.findUserById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}

/**
 * Middleware to verify session from cookie
 * Attaches user to req.user if session is valid
 */
async function verifySession(req, res, next) {
  try {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (!sessionToken) {
      req.user = null;
      return next();
    }

    // Hash the token and look up the session
    const tokenHash = hashToken(sessionToken);
    const session = await db.findSessionByTokenHash(tokenHash);

    if (!session) {
      // Clear invalid cookie
      res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions());
      req.user = null;
      return next();
    }

    // Check if session has expired
    if (new Date(session.expiresAt) < new Date()) {
      // Delete expired session
      await db.deleteSession(session.id);
      res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions());
      req.user = null;
      return next();
    }

    // Get user from session
    const user = await db.findUserById(session.userId);

    if (!user) {
      await db.deleteSession(session.id);
      res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions());
      req.user = null;
      return next();
    }

    // Attach user to request
    req.user = user;
    req.session = session;

    next();
  } catch (error) {
    console.error('Session verification error:', error);
    req.user = null;
    next();
  }
}

/**
 * Middleware to require authentication
 * Returns 401 if user is not authenticated
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource'
    });
  }
  next();
}

/**
 * Factory function to create a middleware that requires auth OR allows demo mode fallback
 * In demo mode (OAuth not configured), if no session cookie is present,
 * automatically use the demo user (for cross-origin cookie issues)
 * @param {boolean} isOAuthConfigured - Whether Google OAuth is configured
 * @returns {Function} Express middleware
 */
function createRequireAuthOrDemo(isOAuthConfigured) {
  return async function requireAuthOrDemo(req, res, next) {
    // If user is already authenticated via session, proceed
    if (req.user) {
      return next();
    }

    // If OAuth is configured, strict auth is required
    if (isOAuthConfigured) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource'
      });
    }

    // Demo mode: try to find/use the default demo user
    try {
      // Look for existing demo user
      let demoUser = db.getUserByEmail('demo@example.com');

      if (!demoUser) {
        // Create demo user if doesn't exist
        demoUser = db.createUser({
          email: 'demo@example.com',
          name: 'Demo User',
          google_id: `demo_fallback`,
          avatar_url: null,
          role: 'user'
        });
        console.log('[Demo Fallback] Created demo user:', demoUser.id);
      }

      // Attach demo user to request
      req.user = demoUser;
      req.isDemoFallback = true;
      console.log('[Demo Fallback] Using demo user for request:', req.path);
      return next();
    } catch (error) {
      console.error('[Demo Fallback] Error getting demo user:', error);
      return res.status(500).json({
        error: 'Internal error',
        message: 'Failed to initialize demo mode'
      });
    }
  };
}

/**
 * Create a new session for a user
 * @param {object} res - Express response object (for setting cookie)
 * @param {string} userId - The user's ID
 * @returns {Promise<object>} The created session
 */
async function createSession(res, userId) {
  // Generate session token
  const token = generateSessionToken();
  const tokenHash = hashToken(token);

  // Calculate expiration
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

  // Store session in database
  const session = await db.createSession({
    userId,
    tokenHash,
    expiresAt
  });

  // Set session cookie
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  return session;
}

/**
 * Destroy the current session
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function destroySession(req, res) {
  if (req.session?.id) {
    await db.deleteSession(req.session.id);
  }
  res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions());
}

/**
 * OAuth state management helpers
 */
const oauthStateStore = {
  /**
   * Store OAuth state temporarily (in-memory for simplicity,
   * consider Redis for production with multiple instances)
   */
  _states: new Map(),

  /**
   * Generate and store a new OAuth state
   * @param {number} ttlMs - Time to live in milliseconds (default: 10 minutes)
   * @returns {string} The generated state value
   */
  create(ttlMs = 10 * 60 * 1000) {
    const state = generateOAuthState();
    const expiresAt = Date.now() + ttlMs;

    this._states.set(state, expiresAt);

    // Clean up expired states periodically
    this._cleanup();

    return state;
  },

  /**
   * Verify and consume a state value
   * @param {string} state - The state to verify
   * @returns {boolean} True if state is valid
   */
  verify(state) {
    const expiresAt = this._states.get(state);

    if (!expiresAt) {
      return false;
    }

    // Delete state after use (one-time use)
    this._states.delete(state);

    // Check expiration
    return Date.now() < expiresAt;
  },

  /**
   * Clean up expired states
   */
  _cleanup() {
    const now = Date.now();
    for (const [state, expiresAt] of this._states.entries()) {
      if (expiresAt < now) {
        this._states.delete(state);
      }
    }
  }
};

module.exports = {
  // Passport configuration
  configurePassport,

  // Token utilities
  generateSessionToken,
  hashToken,

  // Middleware
  verifySession,
  requireAuth,
  createRequireAuthOrDemo,

  // Session management
  createSession,
  destroySession,

  // OAuth state helpers
  generateOAuthState,
  verifyOAuthState,
  oauthStateStore,

  // Constants (exported for testing)
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS
};
