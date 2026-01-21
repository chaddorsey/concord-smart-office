/**
 * Concord Smart Office - Main Backend Server
 *
 * Integrates all services:
 * - Authentication (Google OAuth)
 * - Kiosk QR token management
 * - Presence check-in/check-out
 * - Frame display queue management
 * - Pixabay video browser
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

// Import database layer
const db = require('./db');
const EventEmitter = require('events');

// Import services
const authService = require('./services/authService');
const kioskService = require('./services/kioskService');
const presenceService = require('./services/presenceService');

// ============================================================================
// Server-Sent Events (SSE) for Real-Time Notifications
// ============================================================================

// Event emitter for broadcasting events to connected clients
const eventBus = new EventEmitter();
eventBus.setMaxListeners(100); // Support many concurrent kiosk connections

// Connected SSE clients
const sseClients = new Set();

// Environment configuration
const PORT = process.env.PORT || 3001;
const HA_URL = process.env.HA_URL || 'http://homeassistant.local:8123';
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || '';
const PWA_URL = process.env.PWA_URL || 'http://localhost:5173';

// Check if Google OAuth is configured
const GOOGLE_OAUTH_CONFIGURED = !!(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_ALLOWED_DOMAIN
);

// Initialize Express app
const app = express();

// Disable ETags globally to prevent 304 responses on real-time API data
app.disable('etag');

// ============================================================================
// Database Initialization
// ============================================================================

db.initDatabase();

// Initialize custom patterns table (for pattern creator feature)
const customPatternServiceInit = require('./services/customPatternService');
customPatternServiceInit.initCustomPatternsTable();

console.log('Database initialized');

// ============================================================================
// Middleware Configuration
// ============================================================================

// JSON body parser
app.use(express.json());

// Cookie parser
app.use(cookieParser());

// CORS configuration - allow PWA dev server on any port
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost on any port for development
    if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
      return callback(null, true);
    }
    // Allow any ngrok domain for development tunneling
    if (origin.match(/^https:\/\/[a-z0-9]+\.ngrok-free\.app$/)) {
      return callback(null, true);
    }
    // Allow local network IPs (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
    if (origin.match(/^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/)) {
      return callback(null, true);
    }
    // Allow concordhq.local
    if (origin.match(/^https?:\/\/concordhq\.local(:\d+)?$/)) {
      return callback(null, true);
    }
    // Allow configured PWA URL
    if (origin === PWA_URL) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));

// Disable caching on all API endpoints for real-time data freshness
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Static files from ./public (kiosk pages, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Force no-cache for index.html and service worker (iOS cache busting)
app.get(['/', '/index.html', '/sw.js', '/workbox-*.js'], (req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Static files from PWA dist folder (main app)
app.use(express.static(path.join(__dirname, '../pwa/dist'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filepath) => {
    // No cache for HTML and service worker files
    if (filepath.endsWith('.html') || filepath.endsWith('sw.js') || filepath.includes('workbox')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Session verification middleware - attach user to request if authenticated
app.use(authService.verifySession);

// Configure Passport for Google OAuth (if credentials are configured)
if (GOOGLE_OAUTH_CONFIGURED) {
  try {
    authService.configurePassport(app);
    console.log('Google OAuth configured');
  } catch (error) {
    console.warn('Failed to configure Google OAuth:', error.message);
  }
} else {
  console.log('Google OAuth not configured - running in demo mode');
}

// Create demo-compatible auth middleware (falls back to demo user when cookies don't work)
const requireAuthOrDemo = authService.createRequireAuthOrDemo(GOOGLE_OAUTH_CONFIGURED);

// ============================================================================
// In-Memory Queue Storage (for frame display - mock mode without HA)
// ============================================================================

const localQueueStore = {
  frameQueues: { '1': [], '2': [], '3': [], '4': [] },
  holdingTank: [],
  settings: {
    queueLimit: 10,
    imageDisplayTime: 30,
    videoLoopCount: 3
  },
  frameOrientations: { '1': 'horizontal', '2': 'vertical', '3': 'horizontal', '4': 'vertical' },
  framePositions: { '1': 0, '2': 0, '3': 0, '4': 0 }
};

// Trash rate limiting: track user trash actions
// userId -> { count: number, timestamps: number[] }
const trashRateLimits = new Map();

// ============================================================================
// Queue Helper Functions
// ============================================================================

// Calculate net votes for a queue item
function getNetVotes(item) {
  if (!item.votes || item.votes.length === 0) return 0;
  return item.votes.reduce((sum, v) => sum + (v.vote === 'up' ? 1 : -1), 0);
}

// Check and clean up trash rate limit for a user
function getTrashRateLimit(userId) {
  const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
  let userData = trashRateLimits.get(userId) || { count: 0, timestamps: [] };

  // Filter out timestamps older than 30 minutes
  userData.timestamps = userData.timestamps.filter(t => t > thirtyMinutesAgo);
  userData.count = userData.timestamps.length;

  trashRateLimits.set(userId, userData);
  return userData;
}

// Record a trash action
function recordTrashAction(userId) {
  const userData = getTrashRateLimit(userId);
  userData.timestamps.push(Date.now());
  userData.count = userData.timestamps.length;
  trashRateLimits.set(userId, userData);
  return userData;
}

// Process queue item removal based on votes
function shouldRemoveItem(item, isCurrentlyPlaying) {
  const netVotes = getNetVotes(item);

  // Net -2 or worse: mark for removal (after playing if currently displayed)
  if (netVotes <= -2) {
    return !isCurrentlyPlaying; // Remove immediately if not playing
  }

  return false;
}

// Determine rotations remaining based on votes
function calculateRotationsRemaining(item, queueLimit, queueLength) {
  const netVotes = getNetVotes(item);

  // Net +1 or more: extra rotations in full queue
  if (netVotes >= 1) {
    return 2; // Stay for 2 more rotations when queue is full
  }

  // Net -1: only 1 rotation remaining, falls off even if queue not full
  if (netVotes === -1) {
    return 1;
  }

  // Neutral: normal FIFO behavior
  return undefined;
}

// Get client IP from request
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

// ============================================================================
// Auth Routes (/api/auth)
// ============================================================================

// GET /api/auth/google - Initiate OAuth, redirect to Google
app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_OAUTH_CONFIGURED) {
    return res.status(503).json({
      error: 'OAuth not configured',
      message: 'Google OAuth is not configured. Running in demo mode.'
    });
  }

  // Store return URL in state if provided
  const returnUrl = req.query.returnUrl || '/';
  const state = authService.oauthStateStore.create();

  // Store return URL with state
  req.app.locals.oauthReturnUrls = req.app.locals.oauthReturnUrls || new Map();
  req.app.locals.oauthReturnUrls.set(state, returnUrl);

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(process.env.AUTH_CALLBACK_URL || `http://localhost:${PORT}/api/auth/google/callback`)}&` +
    `response_type=code&` +
    `scope=email%20profile&` +
    `state=${state}&` +
    `hd=${process.env.GOOGLE_ALLOWED_DOMAIN}`;

  res.redirect(authUrl);
});

// GET /api/auth/google/callback - OAuth callback, create session, redirect to PWA
app.get('/api/auth/google/callback', async (req, res) => {
  if (!GOOGLE_OAUTH_CONFIGURED) {
    return res.redirect(`${PWA_URL}?error=oauth_not_configured`);
  }

  const { code, state, error } = req.query;

  if (error) {
    console.error('OAuth error:', error);
    return res.redirect(`${PWA_URL}?error=${encodeURIComponent(error)}`);
  }

  // Verify state
  if (!authService.oauthStateStore.verify(state)) {
    return res.redirect(`${PWA_URL}?error=invalid_state`);
  }

  // Get return URL from state
  const returnUrl = req.app.locals.oauthReturnUrls?.get(state) || '/';
  req.app.locals.oauthReturnUrls?.delete(state);

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.AUTH_CALLBACK_URL || `http://localhost:${PORT}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('Token exchange error:', tokens.error);
      return res.redirect(`${PWA_URL}?error=token_exchange_failed`);
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const userInfo = await userInfoResponse.json();

    // Verify domain
    if (userInfo.hd !== process.env.GOOGLE_ALLOWED_DOMAIN) {
      return res.redirect(`${PWA_URL}?error=domain_not_allowed`);
    }

    // Find or create user
    let user = db.getUserByGoogleId(userInfo.id);

    if (!user) {
      user = db.createUser({
        email: userInfo.email,
        name: userInfo.name,
        google_id: userInfo.id,
        avatar_url: userInfo.picture
      });
    } else {
      // Update user info
      user = db.updateUser(user.id, {
        name: userInfo.name,
        avatar_url: userInfo.picture
      });
    }

    // Create session
    await authService.createSession(res, user.id);

    // Redirect to PWA with success
    const redirectUrl = returnUrl.startsWith('/tap/')
      ? `${PWA_URL}${returnUrl}`
      : `${PWA_URL}?login=success`;

    res.redirect(redirectUrl);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${PWA_URL}?error=auth_failed`);
  }
});

// GET /api/auth/session - Get current user session
app.get('/api/auth/session', (req, res) => {
  console.log('[Session] Check - cookies:', Object.keys(req.cookies || {}));
  console.log('[Session] Check - user:', req.user ? `id=${req.user.id}` : 'null');

  if (req.user) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        avatar_url: req.user.avatar_url,
        role: req.user.role
      }
    });
  } else {
    res.json({
      authenticated: false,
      user: null
    });
  }
});

// POST /api/auth/logout - Clear session
app.post('/api/auth/logout', async (req, res) => {
  try {
    await authService.destroySession(req, res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// POST /api/auth/demo - Demo login (only when OAuth not configured)
app.post('/api/auth/demo', async (req, res) => {
  console.log('[Demo] Login request from origin:', req.get('origin'));

  if (GOOGLE_OAUTH_CONFIGURED) {
    return res.status(403).json({
      error: 'Demo login disabled',
      message: 'Demo login is not available when OAuth is configured'
    });
  }

  const { name, email } = req.body;
  const demoName = name || 'Demo User';
  const demoEmail = email || 'demo@example.com';

  try {
    // Find or create demo user
    let user = db.getUserByEmail(demoEmail);
    if (!user) {
      user = db.createUser({
        email: demoEmail,
        name: demoName,
        google_id: `demo_${Date.now()}`,
        avatar_url: null,
        role: 'user'
      });
      console.log('[Demo] Created new user:', user.id);
    } else {
      console.log('[Demo] Found existing user:', user.id);
    }

    // Create session
    await authService.createSession(res, user.id);
    console.log('[Demo] Session created for user:', user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Demo login error:', error);
    res.status(500).json({ error: 'Demo login failed' });
  }
});

// ============================================================================
// User Routes (/api/users)
// ============================================================================

// GET /api/users - List all users (requires auth)
app.get('/api/users', authService.requireAuth, (req, res) => {
  try {
    // Get all users with their presence states
    const users = db.getDatabase().prepare(`
      SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.created_at,
             ps.status as presence_status, ps.checked_in_at
      FROM users u
      LEFT JOIN presence_state ps ON u.id = ps.user_id
      ORDER BY u.name
    `).all();

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/me - Get current user (requires auth)
app.get('/api/users/me', authService.requireAuth, (req, res) => {
  const presence = db.getPresenceState(req.user.id);

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      avatar_url: req.user.avatar_url,
      role: req.user.role
    },
    presence: presence ? {
      status: presence.status,
      checked_in_at: presence.checked_in_at,
      room_id: presence.room_id
    } : null
  });
});

// ============================================================================
// Staff Routes (/api/staff) - For manual check-in MVP (no auth required)
// ============================================================================

// GET /api/staff - Get all staff members for dropdown
app.get('/api/staff', (req, res) => {
  try {
    const staff = db.getDatabase().prepare(`
      SELECT u.id, u.email, u.name, u.avatar_url
      FROM users u
      WHERE u.role = 'staff'
      ORDER BY u.name
    `).all();

    res.json({ staff });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

// POST /api/staff/checkin - Manual check-in (no auth for MVP)
// Accepts email (preferred for OAuth transition) or userId
app.post('/api/staff/checkin', async (req, res) => {
  try {
    const { email, userId, source = 'manual' } = req.body;

    if (!email && !userId) {
      return res.status(400).json({ error: 'email or userId is required' });
    }

    // Get user info - prefer email lookup for OAuth compatibility
    const user = email ? db.getUserByEmail(email) : db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check in using presence service
    const presence = await presenceService.checkIn(user.id, source, null);

    // Broadcast check-in event
    broadcastEvent('checkin', {
      user_id: user.id,
      user_name: user.name || user.email,
      user_email: user.email,
      avatar_url: user.avatar_url,
      room_id: null,
      source: source
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url
      },
      presence: {
        user_id: presence.user_id,
        status: presence.status,
        checked_in_at: presence.checked_in_at
      }
    });
  } catch (error) {
    console.error('Manual check-in error:', error);
    res.status(500).json({ error: 'Check-in failed', message: error.message });
  }
});

// POST /api/staff/checkout - Manual check-out (no auth for MVP)
// Accepts email (preferred for OAuth transition) or userId
app.post('/api/staff/checkout', async (req, res) => {
  try {
    const { email, userId, source = 'manual' } = req.body;

    if (!email && !userId) {
      return res.status(400).json({ error: 'email or userId is required' });
    }

    // Get user info - prefer email lookup for OAuth compatibility
    const user = email ? db.getUserByEmail(email) : db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check out using presence service
    const presence = await presenceService.checkOut(user.id, source);

    // Broadcast check-out event
    broadcastEvent('checkout', {
      user_id: user.id,
      user_name: user.name || user.email,
      user_email: user.email,
      source: source
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      presence: {
        user_id: presence.user_id,
        status: presence.status
      }
    });
  } catch (error) {
    console.error('Manual check-out error:', error);
    res.status(500).json({ error: 'Check-out failed', message: error.message });
  }
});

// ============================================================================
// Presence Routes (/api/presence)
// ============================================================================

// GET /api/presence - Get all presence states
app.get('/api/presence', (req, res) => {
  try {
    const present = db.getAllPresent();
    res.json({
      users: present.map(p => ({
        user_id: p.user_id,
        user_name: p.user_name,
        user_email: p.user_email,
        avatar_url: p.avatar_url,
        status: p.status,
        checked_in_at: p.checked_in_at,
        room_id: p.room_id
      }))
    });
  } catch (error) {
    console.error('Error fetching presence:', error);
    res.status(500).json({ error: 'Failed to fetch presence data' });
  }
});

// GET /api/presence/:userId - Get specific user's presence
app.get('/api/presence/:userId', (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const presence = db.getPresenceState(userId);

    if (!presence) {
      return res.json({ presence: null });
    }

    res.json({
      presence: {
        user_id: presence.user_id,
        user_name: presence.user_name,
        status: presence.status,
        checked_in_at: presence.checked_in_at,
        room_id: presence.room_id
      }
    });
  } catch (error) {
    console.error('Error fetching user presence:', error);
    res.status(500).json({ error: 'Failed to fetch presence data' });
  }
});

// POST /api/presence/checkin - Check in (requires auth, validates kiosk token)
app.post('/api/presence/checkin', authService.requireAuth, async (req, res) => {
  try {
    const { token, kioskId, source = 'qr', room_id } = req.body;
    const userId = req.user.id;
    const clientIp = getClientIp(req);

    // If token provided, validate it
    if (token) {
      const validation = await kioskService.validateToken(token, clientIp);

      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid token',
          message: validation.error
        });
      }
    }

    // Use presenceService to check in (handles DB + HA webhook)
    const effectiveRoomId = room_id || kioskId || null;
    const presence = await presenceService.checkIn(userId, source, effectiveRoomId);

    // Broadcast check-in event for real-time updates (kiosk welcome, dashboard refresh)
    broadcastEvent('checkin', {
      user_id: userId,
      user_name: req.user.name || req.user.email,
      user_email: req.user.email,
      avatar_url: req.user.avatarUrl,
      room_id: effectiveRoomId,
      source: source
    });

    res.json({
      success: true,
      presence: {
        user_id: presence.user_id,
        status: presence.status,
        checked_in_at: presence.checked_in_at,
        room_id: presence.room_id
      }
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Check-in failed', message: error.message });
  }
});

// POST /api/presence/checkout - Check out (requires auth)
app.post('/api/presence/checkout', authService.requireAuth, async (req, res) => {
  try {
    const { source = 'manual' } = req.body;
    const userId = req.user.id;

    // Use presenceService to check out (handles DB + HA webhook)
    const presence = await presenceService.checkOut(userId, source);

    // Broadcast check-out event for real-time updates (dashboard refresh)
    broadcastEvent('checkout', {
      user_id: userId,
      user_name: req.user.name || req.user.email,
      user_email: req.user.email,
      source: source
    });

    res.json({
      success: true,
      presence: {
        user_id: presence.user_id,
        status: presence.status
      }
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Check-out failed', message: error.message });
  }
});

// ============================================================================
// Kiosk Routes (/api/kiosk)
// ============================================================================

// GET /api/kiosk/token/:kioskId - Get current active token for display
app.get('/api/kiosk/token/:kioskId', async (req, res) => {
  try {
    const { kioskId } = req.params;

    // Try to get existing active token
    let tokenData = await kioskService.getActiveToken(kioskId);

    // If no active token, generate a new one
    if (!tokenData) {
      tokenData = await kioskService.generateToken(kioskId);
    }

    res.json({
      kioskId,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      qrData: tokenData.qrData
    });
  } catch (error) {
    console.error('Error getting kiosk token:', error);
    res.status(500).json({ error: 'Failed to get token', message: error.message });
  }
});

// POST /api/kiosk/rotate/:kioskId - Force rotate token
app.post('/api/kiosk/rotate/:kioskId', async (req, res) => {
  try {
    const { kioskId } = req.params;
    const tokenData = await kioskService.rotateToken(kioskId);

    res.json({
      kioskId,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      qrData: tokenData.qrData
    });
  } catch (error) {
    console.error('Error rotating kiosk token:', error);
    res.status(500).json({ error: 'Failed to rotate token', message: error.message });
  }
});

// POST /api/kiosk/validate - Validate a scanned token
app.post('/api/kiosk/validate', async (req, res) => {
  try {
    const { token } = req.body;
    const clientIp = getClientIp(req);

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const result = await kioskService.validateToken(token, clientIp);

    if (result.valid) {
      res.json({
        valid: true,
        kioskId: result.kioskId
      });
    } else {
      res.status(400).json({
        valid: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error validating token:', error);
    res.status(500).json({ error: 'Validation failed', message: error.message });
  }
});

// ============================================================================
// Check-in Flow Route (/tap/:kioskId)
// ============================================================================

// GET /tap/:kioskId?token=XXX - Handle QR code scan
app.get('/tap/:kioskId', async (req, res) => {
  const { kioskId } = req.params;
  const { token } = req.query;
  const clientIp = getClientIp(req);

  // If not authenticated, redirect to OAuth with return URL
  if (!req.user) {
    const returnUrl = `/tap/${kioskId}?token=${token}`;

    if (GOOGLE_OAUTH_CONFIGURED) {
      // Redirect to OAuth
      const state = authService.oauthStateStore.create();
      req.app.locals.oauthReturnUrls = req.app.locals.oauthReturnUrls || new Map();
      req.app.locals.oauthReturnUrls.set(state, returnUrl);

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(process.env.AUTH_CALLBACK_URL || `http://localhost:${PORT}/api/auth/google/callback`)}&` +
        `response_type=code&` +
        `scope=email%20profile&` +
        `state=${state}&` +
        `hd=${process.env.GOOGLE_ALLOWED_DOMAIN}`;

      return res.redirect(authUrl);
    } else {
      // Demo mode - redirect to PWA login page
      return res.redirect(`${PWA_URL}/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  }

  // User is authenticated - validate token and check in
  try {
    // Validate the QR token
    const validation = await kioskService.validateToken(token, clientIp);

    if (!validation.valid) {
      return res.redirect(`${PWA_URL}/dashboard?error=${encodeURIComponent(validation.error)}`);
    }

    // Check user in using presenceService (handles DB + HA webhook)
    await presenceService.checkIn(req.user.id, 'qr', kioskId);

    // Broadcast check-in event for real-time updates (kiosk welcome, dashboard refresh)
    broadcastEvent('checkin', {
      user_id: req.user.id,
      user_name: req.user.name || req.user.email,
      user_email: req.user.email,
      avatar_url: req.user.avatarUrl,
      room_id: kioskId,
      source: 'qr'
    });

    // Redirect to PWA dashboard with success
    res.redirect(`${PWA_URL}/dashboard?checkin=success&kiosk=${kioskId}`);
  } catch (error) {
    console.error('Check-in flow error:', error);
    res.redirect(`${PWA_URL}/dashboard?error=checkin_failed`);
  }
});

// ============================================================================
// Kiosk Display Page Route
// ============================================================================

// GET /kiosk/:kioskId - Serve kiosk.html for QR display
app.get('/kiosk/:kioskId', (req, res) => {
  const kioskId = req.params.kioskId;

  // Validate kiosk ID format (alphanumeric with optional hyphens/underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(kioskId)) {
    return res.status(400).send('Invalid kiosk ID');
  }

  // Try to serve kiosk.html, fall back to inline HTML if not found
  const kioskHtmlPath = path.join(__dirname, 'public', 'kiosk.html');

  res.sendFile(kioskHtmlPath, (err) => {
    if (err) {
      // Serve inline kiosk page if file doesn't exist
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Kiosk ${kioskId} - Concord Smart Office</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            h1 { font-size: 2rem; margin-bottom: 1rem; }
            .qr-container {
              background: white;
              padding: 2rem;
              border-radius: 1rem;
              margin: 2rem 0;
              display: inline-block;
            }
            #qr-code {
              width: 300px;
              height: 300px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .timer {
              font-size: 1.5rem;
              color: #4ade80;
            }
            .instructions {
              margin-top: 2rem;
              font-size: 1.2rem;
              opacity: 0.8;
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        </head>
        <body>
          <div class="container">
            <h1>Scan to Check In</h1>
            <p>Kiosk: ${kioskId}</p>
            <div class="qr-container">
              <div id="qr-code">Loading...</div>
            </div>
            <p class="timer">Refreshes in <span id="countdown">60</span>s</p>
            <p class="instructions">Open your phone camera and scan the QR code</p>
          </div>
          <script>
            const kioskId = '${kioskId}';
            let countdown = 60;

            async function refreshQR() {
              try {
                const response = await fetch('/api/kiosk/token/' + kioskId);
                const data = await response.json();

                const qrContainer = document.getElementById('qr-code');
                qrContainer.innerHTML = '';

                const fullUrl = window.location.origin + data.qrData;
                await QRCode.toCanvas(qrContainer, fullUrl, {
                  width: 300,
                  margin: 0,
                  color: { dark: '#000000', light: '#ffffff' }
                });

                // Calculate countdown from expiry
                const expiresAt = new Date(data.expiresAt);
                countdown = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
              } catch (error) {
                console.error('Failed to refresh QR:', error);
                document.getElementById('qr-code').textContent = 'Error loading QR code';
              }
            }

            function updateCountdown() {
              document.getElementById('countdown').textContent = countdown;
              countdown--;

              if (countdown < 0) {
                refreshQR();
              }
            }

            // Initial load
            refreshQR();
            setInterval(updateCountdown, 1000);
          </script>
        </body>
        </html>
      `);
    }
  });
});

// ============================================================================
// Frame Display Routes
// ============================================================================

// Frame display routes - serve the frame viewer with frame ID
app.get('/frame/:id', (req, res) => {
  const frameId = parseInt(req.params.id, 10);
  if (frameId < 1 || frameId > 4) {
    return res.status(404).send('Frame not found. Valid frames: 1-4');
  }
  // Prevent caching to ensure latest code is always served
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'frame.html'), (err) => {
    if (err) {
      res.status(404).send('Frame display page not found. Please create public/frame.html');
    }
  });
});

// ============================================================================
// Queue API Routes (for frame display)
// ============================================================================

// Get all queue data
app.get('/api/queue', (req, res) => {
  res.json(localQueueStore);
});

// Get queue for a specific frame
app.get('/api/queue/frame/:id', (req, res) => {
  const frameId = req.params.id;
  res.json({
    queue: localQueueStore.frameQueues[frameId] || [],
    position: localQueueStore.framePositions[frameId] || 0,
    orientation: localQueueStore.frameOrientations[frameId] || 'horizontal',
    settings: localQueueStore.settings
  });
});

// Add item to queue
app.post('/api/queue/add', (req, res) => {
  const item = req.body;
  if (!item || !item.id || !item.orientation) {
    return res.status(400).json({ error: 'Invalid item' });
  }

  const queueItem = {
    ...item,
    addedAt: Date.now(),
    hasPlayed: false
  };

  // Find frames with matching orientation
  const matchingFrames = Object.entries(localQueueStore.frameOrientations)
    .filter(([, orientation]) => orientation === item.orientation)
    .map(([id]) => id);

  if (matchingFrames.length === 0) {
    // No matching frames - add to holding tank
    localQueueStore.holdingTank.push(queueItem);
    return res.json({ assigned: false, reason: `No ${item.orientation} frames available` });
  }

  // Find frame with shortest queue
  const targetFrameId = matchingFrames.reduce((shortest, frameId) => {
    const currentQueue = localQueueStore.frameQueues[frameId] || [];
    const shortestQueue = localQueueStore.frameQueues[shortest] || [];
    return currentQueue.length < shortestQueue.length ? frameId : shortest;
  });

  // Add to frame queue
  if (!localQueueStore.frameQueues[targetFrameId]) {
    localQueueStore.frameQueues[targetFrameId] = [];
  }
  localQueueStore.frameQueues[targetFrameId].push(queueItem);

  res.json({ assigned: true, frameId: targetFrameId });
});

// Update frame queue (for sync from frame display)
app.put('/api/queue/frame/:id', (req, res) => {
  const frameId = req.params.id;
  const { queue, position } = req.body;

  if (queue !== undefined) {
    localQueueStore.frameQueues[frameId] = queue;
  }
  if (position !== undefined) {
    localQueueStore.framePositions[frameId] = position;
  }

  res.json({ success: true });
});

// Update settings
app.put('/api/queue/settings', (req, res) => {
  const settings = req.body;
  localQueueStore.settings = { ...localQueueStore.settings, ...settings };
  res.json({ success: true, settings: localQueueStore.settings });
});

// Set frame orientation
app.put('/api/queue/frame/:id/orientation', (req, res) => {
  const frameId = req.params.id;
  const { orientation } = req.body;
  localQueueStore.frameOrientations[frameId] = orientation;
  res.json({ success: true });
});

// Get holding tank
app.get('/api/queue/holding-tank', (req, res) => {
  res.json({ items: localQueueStore.holdingTank });
});

// Remove from holding tank
app.delete('/api/queue/holding-tank/:id', (req, res) => {
  const itemId = req.params.id;
  localQueueStore.holdingTank = localQueueStore.holdingTank.filter(item => item.id !== itemId);
  res.json({ success: true });
});

// Vote on a queue item
app.post('/api/queue/vote', (req, res) => {
  const { frameId, itemId, voterId, vote } = req.body;

  if (!frameId || !itemId || !voterId || !['up', 'down'].includes(vote)) {
    return res.status(400).json({ error: 'Invalid vote request' });
  }

  const queue = localQueueStore.frameQueues[frameId];
  if (!queue) {
    return res.status(404).json({ error: 'Frame not found' });
  }

  const item = queue.find(i => i.id === itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found in queue' });
  }

  // Initialize votes array if needed
  if (!item.votes) item.votes = [];

  // Remove existing vote from this user
  item.votes = item.votes.filter(v => v.voterId !== voterId);

  // Add new vote
  item.votes.push({
    voterId,
    vote,
    timestamp: Date.now()
  });

  // Calculate net votes
  item.netVotes = getNetVotes(item);

  // Calculate rotations remaining based on votes
  item.rotationsRemaining = calculateRotationsRemaining(
    item,
    localQueueStore.settings.queueLimit,
    queue.length
  );

  // Check if item should be removed due to net -2 or worse
  const currentPosition = localQueueStore.framePositions[frameId] || 0;
  const isCurrentlyPlaying = queue.indexOf(item) === (currentPosition % queue.length);

  if (shouldRemoveItem(item, isCurrentlyPlaying)) {
    // Mark for removal after play or remove immediately
    item.markedForRemoval = true;
    if (!isCurrentlyPlaying) {
      localQueueStore.frameQueues[frameId] = queue.filter(i => i.id !== itemId);
    }
  }

  res.json({
    success: true,
    netVotes: item.netVotes,
    rotationsRemaining: item.rotationsRemaining,
    markedForRemoval: item.markedForRemoval || false
  });
});

// Get user's vote on a queue item
app.get('/api/queue/vote/:frameId/:itemId/:voterId', (req, res) => {
  const { frameId, itemId, voterId } = req.params;

  const queue = localQueueStore.frameQueues[frameId];
  if (!queue) {
    return res.json({ vote: null });
  }

  const item = queue.find(i => i.id === itemId);
  if (!item || !item.votes) {
    return res.json({ vote: null });
  }

  const userVote = item.votes.find(v => v.voterId === voterId);
  res.json({ vote: userVote?.vote || null });
});

// Remove a vote from a queue item
app.delete('/api/queue/vote', (req, res) => {
  const { frameId, itemId, voterId } = req.body;

  if (!frameId || !itemId || !voterId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const queue = localQueueStore.frameQueues[frameId];
  if (!queue) {
    return res.status(404).json({ error: 'Frame not found' });
  }

  const item = queue.find(i => i.id === itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  if (!item.votes) {
    return res.json({ success: true, netVotes: 0 });
  }

  // Remove the user's vote
  item.votes = item.votes.filter(v => v.voterId !== voterId);
  item.netVotes = getNetVotes(item);

  res.json({
    success: true,
    netVotes: item.netVotes
  });
});

// Trash (immediately remove) a queue item with rate limiting
app.post('/api/queue/trash', (req, res) => {
  const { frameId, itemId, userId } = req.body;

  if (!frameId || !itemId || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Check rate limit
  const rateLimit = getTrashRateLimit(userId);

  if (rateLimit.count >= 3) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You have used all 3 trash actions in the last 30 minutes. Use thumbs down to vote items out instead!',
      remainingTime: Math.ceil((rateLimit.timestamps[0] + (30 * 60 * 1000) - Date.now()) / 60000)
    });
  }

  const queue = localQueueStore.frameQueues[frameId];
  if (!queue) {
    return res.status(404).json({ error: 'Frame not found' });
  }

  const itemIndex = queue.findIndex(i => i.id === itemId);
  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Item not found in queue' });
  }

  // Record the trash action
  const updatedLimit = recordTrashAction(userId);

  // Remove the item
  localQueueStore.frameQueues[frameId] = queue.filter(i => i.id !== itemId);

  // Adjust position if needed
  const currentPosition = localQueueStore.framePositions[frameId] || 0;
  if (itemIndex < currentPosition) {
    localQueueStore.framePositions[frameId] = Math.max(0, currentPosition - 1);
  } else if (itemIndex === currentPosition && queue.length > 1) {
    // If we removed the current item, position stays but will now point to next
    if (currentPosition >= queue.length - 1) {
      localQueueStore.framePositions[frameId] = 0;
    }
  }

  // Prepare warning message
  let warning = null;
  if (updatedLimit.count === 2) {
    warning = 'You have 1 trash action remaining in the next 30 minutes. Consider using thumbs down to vote items off the queue instead!';
  }

  res.json({
    success: true,
    trashesRemaining: 3 - updatedLimit.count,
    warning
  });
});

// Get user's trash rate limit status
app.get('/api/queue/trash-limit/:userId', (req, res) => {
  const { userId } = req.params;
  const rateLimit = getTrashRateLimit(userId);

  res.json({
    used: rateLimit.count,
    remaining: Math.max(0, 3 - rateLimit.count),
    resetsIn: rateLimit.timestamps.length > 0
      ? Math.ceil((rateLimit.timestamps[0] + (30 * 60 * 1000) - Date.now()) / 60000)
      : null
  });
});

// ============================================================================
// Pixabay API Routes
// ============================================================================

// Pixabay video search API
app.get('/api/pixabay/videos', async (req, res) => {
  const query = req.query.q || 'loop';
  const page = parseInt(req.query.page, 10) || 1;
  const perPage = Math.max(3, Math.min(200, parseInt(req.query.per_page, 10) || 20)); // Pixabay requires 3-200
  const category = req.query.category || '';

  if (!PIXABAY_API_KEY) {
    return res.status(503).json({
      error: 'Pixabay API key not configured',
      message: 'Set PIXABAY_API_KEY environment variable. Get a free key at https://pixabay.com/api/docs/'
    });
  }

  try {
    const params = new URLSearchParams({
      key: PIXABAY_API_KEY,
      q: query,
      video_type: 'film',
      page: page.toString(),
      per_page: perPage.toString(),
      safesearch: 'true'
    });

    if (category) {
      params.set('category', category);
    }

    const response = await fetch(`https://pixabay.com/api/videos/?${params}`);
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error });
    }

    // Transform to our format
    const videos = (data.hits || []).map(hit => {
      // Get video dimensions from medium quality (or fallback to small)
      const videoInfo = hit.videos?.medium || hit.videos?.small || {};
      const width = videoInfo.width || 1920;
      const height = videoInfo.height || 1080;
      const orientation = width >= height ? 'horizontal' : 'vertical';

      // Create a cleaner title from the first 2-3 tags
      const tags = (hit.tags || '').split(', ').slice(0, 3).join(', ');
      const title = tags || 'Untitled';

      return {
        id: `pixabay_${hit.id}`,
        source: 'pixabay',
        sourceId: hit.id,
        title,
        type: 'video',
        thumbnail: hit.videos?.tiny?.thumbnail || hit.videos?.small?.thumbnail || '',
        previewUrl: hit.videos?.tiny?.url || hit.videos?.small?.url || '',
        url: hit.videos?.medium?.url || hit.videos?.small?.url || '',
        hdUrl: hit.videos?.large?.url || hit.videos?.medium?.url || '',
        duration: hit.duration,
        user: hit.user,
        tags: hit.tags,
        views: hit.views,
        downloads: hit.downloads,
        width,
        height,
        orientation
      };
    });

    res.json({
      total: data.totalHits,
      page,
      perPage,
      videos
    });
  } catch (err) {
    console.error('Pixabay API error:', err);
    res.status(500).json({ error: 'Failed to fetch videos', message: err.message });
  }
});

// Get Pixabay video categories
app.get('/api/pixabay/categories', (req, res) => {
  res.json({
    categories: [
      'backgrounds',
      'fashion',
      'nature',
      'science',
      'education',
      'feelings',
      'health',
      'people',
      'religion',
      'places',
      'animals',
      'industry',
      'computer',
      'food',
      'sports',
      'transportation',
      'travel',
      'buildings',
      'business',
      'music'
    ]
  });
});

// ============================================================================
// Music Control Routes
// ============================================================================

const musicService = require('./services/musicService');
const schedulerService = require('./services/schedulerService');
const sonosService = require('./services/sonosService');

// Get all available tastes
app.get('/api/music/tastes', (req, res) => {
  try {
    const tastes = musicService.getTastes();
    res.json(tastes);
  } catch (error) {
    console.error('[Music] Failed to get tastes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user's taste and volume preferences
app.get('/api/me/tastes', authService.requireAuth, (req, res) => {
  try {
    const preferences = musicService.getUserPreferences(req.user.id);
    res.json(preferences);
  } catch (error) {
    console.error('[Music] Failed to get user preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set current user's taste preferences
app.post('/api/me/tastes', authService.requireAuth, (req, res) => {
  try {
    const { tastes } = req.body;

    if (!Array.isArray(tastes)) {
      return res.status(400).json({ error: 'tastes must be an array' });
    }

    const updatedTastes = musicService.setUserTastes(req.user.id, tastes);
    res.json({ tastes: updatedTastes });
  } catch (error) {
    console.error('[Music] Failed to set user tastes:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get current user's volume preference
app.get('/api/me/volume', authService.requireAuth, (req, res) => {
  try {
    const volume = db.getUserVolume(req.user.id);
    res.json({ volume });
  } catch (error) {
    console.error('[Music] Failed to get volume:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set current user's volume preference
app.post('/api/me/volume', authService.requireAuth, async (req, res) => {
  try {
    const { volume } = req.body;

    if (!['super_quiet', 'soft', 'medium'].includes(volume)) {
      return res.status(400).json({
        error: 'volume must be one of: super_quiet, soft, medium'
      });
    }

    musicService.setUserVolume(req.user.id, volume);

    // Immediately update Sonos volume with new averaged value
    try {
      const newVolumeValue = musicService.computeVolumeValue();
      await sonosService.setVolume(newVolumeValue);
      console.log(`[Music] Immediate volume update: ${newVolumeValue.toFixed(3)}`);
    } catch (volErr) {
      console.error('[Music] Failed to update Sonos volume:', volErr.message);
      // Don't fail the request - preference was saved successfully
    }

    res.json({ volume, current_volume: musicService.computeVolumeLevel() });
  } catch (error) {
    console.error('[Music] Failed to set volume:', error);
    res.status(400).json({ error: error.message });
  }
});

// Preview track metadata from Spotify URL (no auth required)
const spotifyMetadata = require('./services/spotifyMetadata');

app.get('/api/music/preview', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    const metadata = await spotifyMetadata.fetchTrackMetadata(url);

    if (!metadata) {
      return res.status(404).json({ error: 'Could not fetch track metadata' });
    }

    res.json(metadata);
  } catch (error) {
    console.error('[Music] Failed to preview track:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit a track to the queue (auto-fetches metadata from Spotify)
app.post('/api/music/submit', authService.requireAuth, async (req, res) => {
  try {
    const { track_url, title, artist } = req.body;

    if (!track_url) {
      return res.status(400).json({ error: 'track_url is required' });
    }

    const submission = await musicService.submitTrack(req.user.id, track_url, title, artist);
    res.status(201).json(submission);
  } catch (error) {
    console.error('[Music] Failed to submit track:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get the submission queue
app.get('/api/music/queue', (req, res) => {
  try {
    const queue = musicService.getQueue();
    res.json(queue);
  } catch (error) {
    console.error('[Music] Failed to get queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vote on a submission
app.post('/api/music/vote', authService.requireAuth, (req, res) => {
  try {
    const { submission_id, value } = req.body;

    if (submission_id === undefined) {
      return res.status(400).json({ error: 'submission_id is required' });
    }

    if (![-1, 0, 1].includes(value)) {
      return res.status(400).json({ error: 'value must be -1, 0, or 1' });
    }

    const submission = musicService.vote(req.user.id, submission_id, value);
    res.json(submission);
  } catch (error) {
    console.error('[Music] Failed to vote:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete own submission
app.delete('/api/music/submission/:id', authService.requireAuth, (req, res) => {
  try {
    const submissionId = parseInt(req.params.id, 10);
    musicService.removeSubmission(req.user.id, submissionId);
    res.json({ success: true });
  } catch (error) {
    console.error('[Music] Failed to delete submission:', error);
    res.status(400).json({ error: error.message });
  }
});

// Trash any submission (for rate-limited trash feature)
app.post('/api/music/submission/:id/trash', authService.requireAuth, (req, res) => {
  try {
    const submissionId = parseInt(req.params.id, 10);
    const success = db.trashSubmission(submissionId);
    if (!success) {
      return res.status(404).json({ error: 'Submission not found or already played' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Music] Failed to trash submission:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get now playing
app.get('/api/music/now-playing', (req, res) => {
  try {
    const nowPlaying = musicService.getNowPlaying();
    res.json(nowPlaying || { playing: false });
  } catch (error) {
    console.error('[Music] Failed to get now playing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get upcoming tracks
app.get('/api/music/upcoming', (req, res) => {
  try {
    const count = parseInt(req.query.k || '10', 10);
    const upcoming = musicService.getUpcoming(count);
    res.json(upcoming);
  } catch (error) {
    console.error('[Music] Failed to get upcoming:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get play history
app.get('/api/music/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const history = musicService.getHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('[Music] Failed to get history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get music stats
app.get('/api/music/stats', (req, res) => {
  try {
    const stats = musicService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[Music] Failed to get stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Music Scheduler Control Routes
// ============================================================================

// Get scheduler status
app.get('/api/music/scheduler/status', (req, res) => {
  try {
    const status = schedulerService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('[Scheduler] Failed to get status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug: Get raw Sonos playback state
app.get('/api/music/sonos-state', async (req, res) => {
  try {
    const sonosService = require('./services/sonosService');
    const state = await sonosService.getPlaybackState();
    res.json(state);
  } catch (error) {
    console.error('[Sonos] Failed to get state:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pause the scheduler
app.post('/api/music/scheduler/pause', authService.requireAuth, (req, res) => {
  try {
    schedulerService.pause();
    res.json({ success: true, message: 'Scheduler paused' });
  } catch (error) {
    console.error('[Scheduler] Failed to pause:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resume the scheduler
app.post('/api/music/scheduler/resume', authService.requireAuth, (req, res) => {
  try {
    schedulerService.resume();
    res.json({ success: true, message: 'Scheduler resumed' });
  } catch (error) {
    console.error('[Scheduler] Failed to resume:', error);
    res.status(500).json({ error: error.message });
  }
});

// Skip current track
app.post('/api/music/scheduler/skip', authService.requireAuth, async (req, res) => {
  try {
    await schedulerService.skipTrack();
    res.json({ success: true, message: 'Track skipped' });
  } catch (error) {
    console.error('[Scheduler] Failed to skip:', error);
    res.status(500).json({ error: error.message });
  }
});

// Force play a specific track (admin/testing)
app.post('/api/music/scheduler/force-play', authService.requireAuth, async (req, res) => {
  try {
    const { track_url } = req.body;

    if (!track_url) {
      return res.status(400).json({ error: 'track_url is required' });
    }

    const result = await schedulerService.forcePlay(track_url);
    res.json(result);
  } catch (error) {
    console.error('[Scheduler] Failed to force play:', error);
    res.status(500).json({ error: error.message });
  }
});

// Backfill missing metadata for taste tracks
app.post('/api/music/backfill-metadata', async (req, res) => {
  const spotifyMetadata = require('./services/spotifyMetadata');

  try {
    // Get all taste tracks with missing artist info
    const allTastes = db.getAllTastes();
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (const taste of allTastes) {
      const tracks = db.getTasteTracks(taste.id);

      for (const track of tracks) {
        if (!track.artist || track.artist === 'Unknown Artist') {
          console.log(`[Backfill] Fetching metadata for: ${track.track_url}`);

          try {
            const metadata = await spotifyMetadata.fetchTrackMetadata(track.track_url);

            if (metadata && metadata.artist && metadata.artist !== 'Unknown Artist') {
              // Update the track in database
              db.run(`
                UPDATE taste_tracks
                SET artist = ?, title = COALESCE(?, title), album_art = ?
                WHERE id = ?
              `, [metadata.artist, metadata.title, metadata.thumbnail, track.id]);
              updated++;
              console.log(`[Backfill] Updated: "${metadata.title}" by ${metadata.artist}`);
            } else {
              failed++;
              errors.push({ track_url: track.track_url, reason: 'Could not fetch artist' });
            }

            // Rate limit to avoid hitting Spotify too fast
            await new Promise(r => setTimeout(r, 200));
          } catch (error) {
            failed++;
            errors.push({ track_url: track.track_url, reason: error.message });
          }
        }
      }
    }

    res.json({
      success: true,
      updated,
      failed,
      errors: errors.slice(0, 10) // Only return first 10 errors
    });
  } catch (error) {
    console.error('[Backfill] Failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Oasis Sand Table API Routes
// ============================================================================

const oasisService = require('./services/oasisService');
const oasisSchedulerService = require('./services/oasisSchedulerService');

// Initialize patterns - tries HA first, falls back to mock patterns for development
oasisService.initializePatterns().catch(err => {
  console.error('[Oasis] Pattern initialization failed:', err.message);
});

// Get available patterns
app.get('/api/oasis/patterns', (req, res) => {
  try {
    const patterns = oasisService.getPatterns();
    res.json(patterns);
  } catch (error) {
    console.error('[Oasis] Failed to get patterns:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pattern queue
app.get('/api/oasis/queue', (req, res) => {
  try {
    const queue = oasisService.getPatternQueue();
    res.json(queue);
  } catch (error) {
    console.error('[Oasis] Failed to get queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit pattern to queue
app.post('/api/oasis/submit', requireAuthOrDemo, (req, res) => {
  try {
    const { pattern_id, pattern_name, thumbnail_url } = req.body;

    if (!pattern_id || !pattern_name) {
      return res.status(400).json({ error: 'pattern_id and pattern_name are required' });
    }

    const submission = oasisService.submitPattern(
      req.user.id,
      pattern_id,
      pattern_name,
      thumbnail_url
    );
    res.status(201).json(submission);
  } catch (error) {
    console.error('[Oasis] Failed to submit pattern:', error);
    res.status(400).json({ error: error.message });
  }
});

// Vote on pattern submission
app.post('/api/oasis/vote', authService.requireAuth, (req, res) => {
  try {
    const { submission_id, value } = req.body;

    if (submission_id === undefined || value === undefined) {
      return res.status(400).json({ error: 'submission_id and value are required' });
    }

    const submission = oasisService.votePattern(req.user.id, submission_id, value);
    res.json(submission);
  } catch (error) {
    console.error('[Oasis] Failed to vote:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete own pattern submission
app.delete('/api/oasis/submission/:id', authService.requireAuth, (req, res) => {
  try {
    const submissionId = parseInt(req.params.id, 10);
    oasisService.removePatternSubmission(req.user.id, submissionId);
    res.json({ success: true });
  } catch (error) {
    console.error('[Oasis] Failed to delete submission:', error);
    res.status(400).json({ error: error.message });
  }
});

// Trash any pattern submission (rate limited in frontend)
app.post('/api/oasis/submission/:id/trash', authService.requireAuth, (req, res) => {
  try {
    const submissionId = parseInt(req.params.id, 10);
    const success = oasisService.trashPattern(submissionId);
    if (!success) {
      return res.status(404).json({ error: 'Submission not found or already played' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Oasis] Failed to trash submission:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get LED effects
app.get('/api/oasis/led/effects', (req, res) => {
  try {
    const effects = oasisService.getLedEffects();
    res.json(effects);
  } catch (error) {
    console.error('[Oasis] Failed to get LED effects:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get LED queue
app.get('/api/oasis/led/queue', (req, res) => {
  try {
    const queue = oasisService.getLedQueue();
    res.json(queue);
  } catch (error) {
    console.error('[Oasis] Failed to get LED queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit LED pattern
app.post('/api/oasis/led/submit', authService.requireAuth, (req, res) => {
  try {
    const { effect_name, color_hex, brightness } = req.body;

    if (!effect_name) {
      return res.status(400).json({ error: 'effect_name is required' });
    }

    const submission = oasisService.submitLed(
      req.user.id,
      effect_name,
      color_hex,
      brightness
    );
    res.status(201).json(submission);
  } catch (error) {
    console.error('[Oasis] Failed to submit LED:', error);
    res.status(400).json({ error: error.message });
  }
});

// Vote on LED submission
app.post('/api/oasis/led/vote', authService.requireAuth, (req, res) => {
  try {
    const { submission_id, value } = req.body;

    if (submission_id === undefined || value === undefined) {
      return res.status(400).json({ error: 'submission_id and value are required' });
    }

    const submission = oasisService.voteLed(req.user.id, submission_id, value);
    res.json(submission);
  } catch (error) {
    console.error('[Oasis] Failed to vote on LED:', error);
    res.status(400).json({ error: error.message });
  }
});

// Trash LED submission
app.post('/api/oasis/led/:id/trash', authService.requireAuth, (req, res) => {
  try {
    const submissionId = parseInt(req.params.id, 10);
    const success = oasisService.trashLed(submissionId);
    if (!success) {
      return res.status(404).json({ error: 'LED submission not found or already played' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Oasis] Failed to trash LED:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get Oasis status (now playing, queues, LED timer)
app.get('/api/oasis/status', (req, res) => {
  try {
    const status = oasisService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('[Oasis] Failed to get status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pattern favorites
app.get('/api/oasis/favorites', (req, res) => {
  try {
    const favorites = oasisService.getPatternFavorites();
    res.json(favorites);
  } catch (error) {
    console.error('[Oasis] Failed to get favorites:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add pattern to favorites
app.post('/api/oasis/favorites', requireAuthOrDemo, (req, res) => {
  try {
    const { pattern_id, pattern_name, thumbnail_url } = req.body;

    if (!pattern_id || !pattern_name) {
      return res.status(400).json({ error: 'pattern_id and pattern_name are required' });
    }

    oasisService.addPatternFavorite(req.user.id, pattern_id, pattern_name, thumbnail_url);
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('[Oasis] Failed to add favorite:', error);
    res.status(400).json({ error: error.message });
  }
});

// Remove pattern from favorites
app.delete('/api/oasis/favorites/:patternId', requireAuthOrDemo, (req, res) => {
  try {
    oasisService.removePatternFavorite(req.params.patternId);
    res.json({ success: true });
  } catch (error) {
    console.error('[Oasis] Failed to remove favorite:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get LED favorites
app.get('/api/oasis/led/favorites', (req, res) => {
  try {
    const favorites = oasisService.getLedFavorites();
    res.json(favorites);
  } catch (error) {
    console.error('[Oasis] Failed to get LED favorites:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update LED change interval
app.put('/api/oasis/settings/led-interval', authService.requireAuth, (req, res) => {
  try {
    const { minutes } = req.body;

    if (!minutes || minutes < 1 || minutes > 60) {
      return res.status(400).json({ error: 'minutes must be between 1 and 60' });
    }

    oasisService.setLedChangeInterval(minutes);
    res.json({ success: true, ledChangeIntervalMinutes: minutes });
  } catch (error) {
    console.error('[Oasis] Failed to update LED interval:', error);
    res.status(400).json({ error: error.message });
  }
});

// ----------------------------------------------------------------------------
// Oasis Home Assistant Integration Routes
// ----------------------------------------------------------------------------

// Get real-time Oasis status from Home Assistant
app.get('/api/oasis/ha/status', async (req, res) => {
  try {
    const status = await oasisService.fetchOasisStatusFromHA();
    res.json(status);
  } catch (error) {
    console.error('[Oasis] Failed to fetch HA status:', error);
    res.status(500).json({ error: error.message, connected: false });
  }
});

// Fetch patterns from Home Assistant (browse_media) and cache them
app.get('/api/oasis/ha/patterns', async (req, res) => {
  try {
    const patterns = await oasisService.fetchPatternsFromHA();
    res.json({ patterns, count: patterns.length, source: 'home_assistant' });
  } catch (error) {
    console.error('[Oasis] Failed to fetch patterns from HA:', error);
    res.status(500).json({ error: error.message, patterns: [], source: 'error' });
  }
});

// Force refresh patterns from HA (re-fetches and updates cache)
app.post('/api/oasis/ha/patterns/refresh', authService.requireAuth, async (req, res) => {
  try {
    console.log('[Oasis] Force refreshing patterns from HA...');
    const patterns = await oasisService.fetchPatternsFromHA();
    res.json({
      success: true,
      count: patterns.length,
      message: `Refreshed ${patterns.length} patterns from Home Assistant`
    });
  } catch (error) {
    console.error('[Oasis] Failed to refresh patterns from HA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch playlists from Home Assistant
app.get('/api/oasis/ha/playlists', async (req, res) => {
  try {
    const playlists = await oasisService.fetchPlaylistsFromHA();
    res.json({ playlists });
  } catch (error) {
    console.error('[Oasis] Failed to fetch playlists from HA:', error);
    res.status(500).json({ error: error.message, playlists: [] });
  }
});

// Fetch native queue from Oasis
app.get('/api/oasis/ha/queue', async (req, res) => {
  try {
    const nativeQueue = await oasisService.fetchNativeQueueFromHA();
    res.json(nativeQueue);
  } catch (error) {
    console.error('[Oasis] Failed to fetch native queue from HA:', error);
    res.status(500).json({ error: error.message, current: null, patterns: [] });
  }
});

// Get LED effects from Home Assistant
app.get('/api/oasis/ha/effects', async (req, res) => {
  try {
    const effects = await oasisService.updateLedEffectsFromHA();
    res.json({ effects });
  } catch (error) {
    console.error('[Oasis] Failed to fetch LED effects from HA:', error);
    res.json({ effects: oasisService.LED_EFFECTS });
  }
});

// Play a pattern on the Oasis (direct HA control)
app.post('/api/oasis/ha/play', authService.requireAuth, async (req, res) => {
  try {
    const { pattern_id, pattern_name } = req.body;
    if (!pattern_id) {
      return res.status(400).json({ error: 'pattern_id is required' });
    }
    const result = await oasisService.playPatternOnOasis(pattern_id, pattern_name);
    res.json(result);
  } catch (error) {
    console.error('[Oasis] Failed to play pattern:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// Set LED effect on the Oasis (direct HA control)
app.post('/api/oasis/ha/led', authService.requireAuth, async (req, res) => {
  try {
    const { effect, rgb_color, brightness } = req.body;
    if (!effect) {
      return res.status(400).json({ error: 'effect is required' });
    }
    const result = await oasisService.setLedEffectOnOasis(effect, rgb_color, brightness);
    res.json(result);
  } catch (error) {
    console.error('[Oasis] Failed to set LED effect:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// Set playlist on the Oasis
app.post('/api/oasis/ha/playlist', authService.requireAuth, async (req, res) => {
  try {
    const { playlist } = req.body;
    if (!playlist) {
      return res.status(400).json({ error: 'playlist is required' });
    }
    const result = await oasisService.setPlaylistOnOasis(playlist);
    res.json(result);
  } catch (error) {
    console.error('[Oasis] Failed to set playlist:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// ============================================================================
// Custom Pattern Creator API Routes
// ============================================================================

const customPatternService = require('./services/customPatternService');

// Get public custom patterns
app.get('/api/oasis/custom-patterns', (req, res) => {
  try {
    const { limit, offset } = req.query;
    const patterns = customPatternService.getPublicCustomPatterns({
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    res.json({ patterns });
  } catch (error) {
    console.error('[CustomPatterns] Failed to get patterns:', error);
    res.status(500).json({ error: error.message, patterns: [] });
  }
});

// Get current user's custom patterns
app.get('/api/oasis/custom-patterns/mine', authService.requireAuth, (req, res) => {
  try {
    const patterns = customPatternService.getUserCustomPatterns(req.user.id);
    res.json({ patterns });
  } catch (error) {
    console.error('[CustomPatterns] Failed to get user patterns:', error);
    res.status(500).json({ error: error.message, patterns: [] });
  }
});

// Get a specific custom pattern
app.get('/api/oasis/custom-patterns/:id', (req, res) => {
  try {
    const pattern = customPatternService.getCustomPatternById(req.params.id);
    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }
    res.json(pattern);
  } catch (error) {
    console.error('[CustomPatterns] Failed to get pattern:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new custom pattern
app.post('/api/oasis/custom-patterns', requireAuthOrDemo, async (req, res) => {
  try {
    const { name, thetaRhoData, previewSvg, config } = req.body;

    if (!name || !thetaRhoData) {
      return res.status(400).json({ error: 'name and thetaRhoData are required' });
    }

    const pattern = await customPatternService.saveCustomPattern({
      name,
      thetaRhoData,
      previewSvg,
      config,
      createdByUserId: req.user?.id || 1 // Demo user fallback
    });

    res.status(201).json(pattern);
  } catch (error) {
    console.error('[CustomPatterns] Failed to create pattern:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete a custom pattern (owner only)
app.delete('/api/oasis/custom-patterns/:id', authService.requireAuth, async (req, res) => {
  try {
    const deleted = await customPatternService.deleteCustomPattern(req.params.id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Pattern not found or not yours' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[CustomPatterns] Failed to delete pattern:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit a custom pattern to the queue
app.post('/api/oasis/custom-patterns/:id/submit', requireAuthOrDemo, (req, res) => {
  try {
    const submission = customPatternService.submitCustomPatternToQueue(
      req.params.id,
      req.user?.id || 1
    );
    res.status(201).json(submission);
  } catch (error) {
    console.error('[CustomPatterns] Failed to submit pattern:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// MBTA Train Schedule API Routes
// ============================================================================

const mbtaService = require('./services/mbtaService');

// Get upcoming train predictions for Concord station
app.get('/api/trains', async (req, res) => {
  try {
    const predictions = await mbtaService.getPredictions();
    const next = predictions[0] || null;
    res.json({
      predictions,
      next,
      nextMinutes: next ? mbtaService.formatMinutesUntil(next.minutesUntil) : null,
      stationId: mbtaService.CONCORD_STOP_ID
    });
  } catch (error) {
    console.error('[MBTA] Failed to get predictions:', error);
    res.status(500).json({ error: error.message, predictions: [] });
  }
});

// ============================================================================
// Announcements API Routes
// ============================================================================

const announcementService = require('./services/announcementService');
const avatarService = require('./services/avatarService');
const calendarService = require('./services/calendarService');
const mapService = require('./services/mapService');

// Get active announcements
app.get('/api/announcements', (req, res) => {
  try {
    const announcements = announcementService.getActiveAnnouncements();
    const alert = announcementService.getCurrentAlert();
    res.json({ announcements, alert });
  } catch (error) {
    console.error('[Announcements] Failed to get announcements:', error);
    res.status(500).json({ error: error.message, announcements: [], alert: null });
  }
});

// Create announcement (admin)
app.post('/api/announcements', authService.requireAuth, (req, res) => {
  try {
    const { title, message, type, priority, expiresAt } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }
    const announcement = announcementService.createAnnouncement({
      title,
      message,
      type: type || 'info',
      priority: priority || 0,
      expiresAt,
      createdByUserId: req.user?.id
    });
    res.status(201).json(announcement);
  } catch (error) {
    console.error('[Announcements] Failed to create announcement:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update announcement (admin)
app.put('/api/announcements/:id', authService.requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, type, priority, expiresAt } = req.body;
    const announcement = announcementService.updateAnnouncement(parseInt(id), {
      title, message, type, priority, expiresAt
    });
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    res.json(announcement);
  } catch (error) {
    console.error('[Announcements] Failed to update announcement:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete announcement (admin)
app.delete('/api/announcements/:id', authService.requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const success = announcementService.deleteAnnouncement(parseInt(id));
    if (!success) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Announcements] Failed to delete announcement:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dismiss all alerts
app.post('/api/announcements/dismiss-alerts', authService.requireAuth, (req, res) => {
  try {
    const count = announcementService.dismissAllAlerts();
    res.json({ success: true, dismissed: count });
  } catch (error) {
    console.error('[Announcements] Failed to dismiss alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Avatar API Routes
// ============================================================================

// Get avatar URL for a user by email
app.get('/api/avatars/:email', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const avatarUrl = avatarService.getAvatarUrl(email);
    res.json({ email, avatarUrl });
  } catch (error) {
    console.error('[Avatar] Failed to get avatar:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all avatar mappings
app.get('/api/avatars', (req, res) => {
  try {
    const mappings = avatarService.getAllMappings();
    res.json({ mappings });
  } catch (error) {
    console.error('[Avatar] Failed to get mappings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set avatar mapping (admin)
app.post('/api/avatars', authService.requireAuth, (req, res) => {
  try {
    const { email, avatarUrl } = req.body;
    if (!email || !avatarUrl) {
      return res.status(400).json({ error: 'email and avatarUrl are required' });
    }
    avatarService.setAvatarMapping(email, avatarUrl);
    res.json({ success: true, email, avatarUrl });
  } catch (error) {
    console.error('[Avatar] Failed to set mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cache avatar from external URL
app.post('/api/avatars/cache', authService.requireAuth, async (req, res) => {
  try {
    const { email, sourceUrl, name } = req.body;
    if (!email || !sourceUrl) {
      return res.status(400).json({ error: 'email and sourceUrl are required' });
    }
    const avatarUrl = await avatarService.cacheAvatar(email, sourceUrl, name);
    res.json({ success: true, email, avatarUrl });
  } catch (error) {
    console.error('[Avatar] Failed to cache avatar:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate initials avatar
app.post('/api/avatars/generate', authService.requireAuth, (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'email and name are required' });
    }
    const avatarUrl = avatarService.generateInitialsAvatar(email, name);
    res.json({ success: true, email, avatarUrl });
  } catch (error) {
    console.error('[Avatar] Failed to generate avatar:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk import avatars
app.post('/api/avatars/bulk-import', authService.requireAuth, async (req, res) => {
  try {
    const { users } = req.body;
    if (!Array.isArray(users)) {
      return res.status(400).json({ error: 'users must be an array' });
    }
    const results = await avatarService.bulkImportAvatars(users);
    res.json(results);
  } catch (error) {
    console.error('[Avatar] Failed to bulk import:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete avatar mapping
app.delete('/api/avatars/:email', authService.requireAuth, (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const deleted = avatarService.deleteMapping(email);
    res.json({ success: deleted });
  } catch (error) {
    console.error('[Avatar] Failed to delete mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Calendar API Routes
// ============================================================================

// Get upcoming events from all room calendars
app.get('/api/calendar/events', async (req, res) => {
  try {
    const events = await calendarService.getUpcomingEvents();
    res.json({
      events,
      configured: calendarService.isConfigured(),
      rooms: calendarService.getConfiguredRooms()
    });
  } catch (error) {
    console.error('[Calendar] Failed to get events:', error);
    res.status(500).json({ error: error.message, events: [] });
  }
});

// Get events for a specific room
app.get('/api/calendar/room/:roomName', async (req, res) => {
  try {
    const roomName = decodeURIComponent(req.params.roomName);
    const events = await calendarService.getRoomEvents(roomName);
    res.json({ events, room: roomName });
  } catch (error) {
    console.error('[Calendar] Failed to get room events:', error);
    res.status(500).json({ error: error.message, events: [] });
  }
});

// Get next event for each room
app.get('/api/calendar/next-by-room', async (req, res) => {
  try {
    const nextByRoom = await calendarService.getNextEventByRoom();
    res.json(nextByRoom);
  } catch (error) {
    console.error('[Calendar] Failed to get next events:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if a room is currently busy
app.get('/api/calendar/room/:roomName/busy', async (req, res) => {
  try {
    const roomName = decodeURIComponent(req.params.roomName);
    const busy = await calendarService.isRoomBusy(roomName);
    res.json({ room: roomName, busy });
  } catch (error) {
    console.error('[Calendar] Failed to check room status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get configured rooms
app.get('/api/calendar/rooms', (req, res) => {
  try {
    res.json({
      rooms: calendarService.getConfiguredRooms(),
      configured: calendarService.isConfigured()
    });
  } catch (error) {
    console.error('[Calendar] Failed to get rooms:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Map API Routes (Who's Where)
// ============================================================================

// Get all room definitions
app.get('/api/map/rooms', (req, res) => {
  try {
    const rooms = mapService.getAllRooms();
    res.json({ rooms });
  } catch (error) {
    console.error('[Map] Failed to get rooms:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get people positions for the map overlay
app.get('/api/map/people', (req, res) => {
  try {
    const present = db.getAllPresent();
    const positions = mapService.calculatePeoplePositions(present);
    res.json(positions);
  } catch (error) {
    console.error('[Map] Failed to get people positions:', error);
    res.status(500).json({ error: error.message, located: [], unlocated: [] });
  }
});

// Get room occupancy counts
app.get('/api/map/occupancy', (req, res) => {
  try {
    const present = db.getAllPresent();
    const occupancy = mapService.getRoomOccupancy(present);
    res.json({ occupancy, total: present.length });
  } catch (error) {
    console.error('[Map] Failed to get occupancy:', error);
    res.status(500).json({ error: error.message, occupancy: {} });
  }
});

// ============================================================================
// BLE Beacon Routes (/api/beacons, /api/ble)
// ============================================================================

// GET /api/beacons - List all beacons (admin)
app.get('/api/beacons', authService.requireAuth, (req, res) => {
  try {
    const beacons = db.getAllBeacons();
    res.json({ beacons });
  } catch (error) {
    console.error('Failed to get beacons:', error);
    res.status(500).json({ error: 'Failed to get beacons' });
  }
});

// GET /api/beacons/available - List unclaimed beacons
app.get('/api/beacons/available', authService.requireAuth, (req, res) => {
  try {
    const beacons = db.getUnclaimedBeacons();
    res.json({ beacons });
  } catch (error) {
    console.error('Failed to get unclaimed beacons:', error);
    res.status(500).json({ error: 'Failed to get unclaimed beacons' });
  }
});

// GET /api/beacons/mine - Get current user's beacon
app.get('/api/beacons/mine', authService.requireAuth, (req, res) => {
  try {
    const beacon = db.getBeaconByUser(req.user.id);
    res.json({ beacon: beacon || null });
  } catch (error) {
    console.error('Failed to get user beacon:', error);
    res.status(500).json({ error: 'Failed to get user beacon' });
  }
});

// POST /api/beacons/claim - Claim a beacon
// Supports beaconId, mac_address, or beacon_uuid/major/minor
app.post('/api/beacons/claim', authService.requireAuth, (req, res) => {
  try {
    const { beaconId, mac_address, beacon_uuid, major, minor } = req.body;

    let beacon;
    if (beaconId) {
      beacon = db.getBeaconById(beaconId);
    } else if (mac_address) {
      beacon = db.getBeaconByMac(mac_address);
    } else if (beacon_uuid && major !== undefined && minor !== undefined) {
      beacon = db.getBeaconByIdentifier(beacon_uuid, major, minor);
    } else {
      return res.status(400).json({ error: 'Missing beaconId, mac_address, or beacon_uuid/major/minor' });
    }

    if (!beacon) {
      return res.status(404).json({ error: 'Beacon not found' });
    }

    beacon = db.claimBeacon(beacon.id, req.user.id);
    res.json({ success: true, beacon });
  } catch (error) {
    console.error('Failed to claim beacon:', error);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/beacons/unclaim - Release claimed beacon
app.post('/api/beacons/unclaim', authService.requireAuth, (req, res) => {
  try {
    const beacon = db.getBeaconByUser(req.user.id);
    if (!beacon) {
      return res.status(404).json({ error: 'No beacon claimed' });
    }

    const updated = db.unclaimBeacon(beacon.id, req.user.id);
    res.json({ success: true, beacon: updated });
  } catch (error) {
    console.error('Failed to unclaim beacon:', error);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/beacons/register - Admin: register new beacon
// Supports MAC address (preferred) or iBeacon UUID/major/minor
app.post('/api/beacons/register', authService.requireAuth, (req, res) => {
  try {
    const { mac_address, beacon_uuid, major, minor, friendly_name } = req.body;

    if (!mac_address && !beacon_uuid) {
      return res.status(400).json({ error: 'Either mac_address or beacon_uuid is required' });
    }

    if (beacon_uuid && (major === undefined || minor === undefined)) {
      return res.status(400).json({ error: 'beacon_uuid requires major and minor values' });
    }

    const beacon = db.registerBeacon({
      mac_address,
      beacon_uuid,
      major: major !== undefined ? parseInt(major) : null,
      minor: minor !== undefined ? parseInt(minor) : null,
      friendly_name
    });

    res.json({ success: true, beacon });
  } catch (error) {
    console.error('Failed to register beacon:', error);
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/beacons/:id - Admin: delete a beacon
app.delete('/api/beacons/:id', authService.requireAuth, (req, res) => {
  try {
    const beaconId = parseInt(req.params.id);
    const deleted = db.deleteBeacon(beaconId);

    if (!deleted) {
      return res.status(404).json({ error: 'Beacon not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete beacon:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ble/room-update - Bermuda detected room change (from HA automation)
// Supports mac_address (preferred) or beaconIdentifier (uuid_major_minor format)
app.post('/api/ble/room-update', (req, res) => {
  try {
    const { mac_address, beaconIdentifier, roomId, distance, proxyId, rssi } = req.body;

    let beacon = null;

    // Try MAC address first (preferred)
    if (mac_address) {
      beacon = db.getBeaconByMac(mac_address);
    }

    // Fall back to iBeacon identifier
    if (!beacon && beaconIdentifier) {
      // Parse beacon identifier (format: uuid_major_minor)
      const parts = beaconIdentifier.split('_');
      if (parts.length >= 3) {
        const beacon_uuid = parts.slice(0, -2).join('_'); // UUID may contain underscores
        const major = parseInt(parts[parts.length - 2]);
        const minor = parseInt(parts[parts.length - 1]);
        beacon = db.getBeaconByIdentifier(beacon_uuid, major, minor);
      }
    }

    if (!beacon) {
      console.log(`[BLE] Unknown beacon: mac=${mac_address}, id=${beaconIdentifier}`);
      return res.status(404).json({ error: 'Beacon not found' });
    }

    // Update beacon location
    db.updateBeaconLocation(beacon.id, {
      room_id: roomId,
      proxy_id: proxyId,
      rssi: rssi || null,
      distance: distance || null
    });

    // If beacon is claimed, update user's room_id in presence_state
    if (beacon.claimed_by_user_id) {
      const presence = db.getPresenceState(beacon.claimed_by_user_id);
      if (presence && presence.status === 'in') {
        db.setPresenceState(beacon.claimed_by_user_id, {
          ...presence,
          room_id: roomId
        });

        console.log(`[BLE] Updated room for user ${beacon.claimed_by_user_id}: ${roomId}`);

        // Broadcast room update via SSE
        broadcastEvent('room_update', {
          user_id: beacon.claimed_by_user_id,
          room_id: roomId,
          beacon_id: beacon.id
        });
      }
    }

    res.json({ success: true, beacon_id: beacon.id, room_id: roomId });
  } catch (error) {
    console.error('Failed to process BLE room update:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ble/heartbeat - Periodic beacon sighting (keep-alive)
app.post('/api/ble/heartbeat', (req, res) => {
  try {
    const { beaconIdentifier, proxyId, rssi, distance } = req.body;

    // Parse beacon identifier
    const parts = beaconIdentifier.split('_');
    if (parts.length < 3) {
      return res.status(400).json({ error: 'Invalid beacon identifier format' });
    }

    const beacon_uuid = parts.slice(0, -2).join('_');
    const major = parseInt(parts[parts.length - 2]);
    const minor = parseInt(parts[parts.length - 1]);

    const beacon = db.getBeaconByIdentifier(beacon_uuid, major, minor);
    if (!beacon) {
      return res.status(404).json({ error: 'Beacon not found' });
    }

    // Just update last_seen_at and optionally record sighting
    db.updateBeaconLocation(beacon.id, {
      room_id: beacon.last_room_id,
      proxy_id: proxyId || beacon.last_proxy_id,
      rssi,
      distance
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to process BLE heartbeat:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Health Check and Config Routes
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'concord-smart-office',
    timestamp: new Date().toISOString(),
    oauth: GOOGLE_OAUTH_CONFIGURED ? 'configured' : 'demo_mode',
    pixabay: PIXABAY_API_KEY ? 'configured' : 'not_configured'
  });
});

// ============================================================================
// Server-Sent Events (SSE) Endpoint
// ============================================================================

/**
 * Broadcast an event to all connected SSE clients
 * @param {string} type - Event type (e.g., 'checkin', 'checkout')
 * @param {Object} data - Event data
 */
function broadcastEvent(type, data) {
  const event = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    client.write(`event: ${type}\ndata: ${event}\n\n`);
  }
  // Also emit on eventBus for internal listeners
  eventBus.emit(type, data);
}

// GET /api/events - SSE endpoint for real-time updates
app.get('/api/events', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Add client to set
  sseClients.add(res);
  console.log(`[SSE] Client connected. Total clients: ${sseClients.size}`);

  // Send initial connection message
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to event stream', clients: sseClients.size })}\n\n`);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeatInterval = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
  }, 30000);

  // Remove client on disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseClients.delete(res);
    console.log(`[SSE] Client disconnected. Total clients: ${sseClients.size}`);
  });
});

// API configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    haUrl: HA_URL,
    wsUrl: HA_URL.replace('http', 'ws') + '/api/websocket',
    pwaUrl: PWA_URL,
    oauth: {
      configured: GOOGLE_OAUTH_CONFIGURED,
      domain: process.env.GOOGLE_ALLOWED_DOMAIN || null
    },
    features: {
      pixabay: !!PIXABAY_API_KEY,
      frames: true,
      presence: true,
      kiosk: true
    }
  });
});

// ============================================================================
// PWA App Routes (SPA fallback)
// ============================================================================

// Serve PWA for /app and /app/* routes
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../pwa/dist', 'index.html'));
});

app.get('/app/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../pwa/dist', 'index.html'));
});

// Also serve PWA for common routes used by the SPA
const pwaRoutes = ['/login', '/dashboard', '/scan', '/music', '/sand', '/photos', '/frames', '/browse-videos'];
pwaRoutes.forEach(route => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, '../pwa/dist', 'index.html'));
  });
});

// ============================================================================
// Root Route
// ============================================================================

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Concord Smart Office</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #111; color: #fff; }
        h1 { color: #fff; }
        .section { margin: 30px 0; padding: 20px; background: #1a1a2e; border-radius: 8px; }
        .section h2 { font-size: 1rem; color: #888; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
        a { display: block; padding: 12px 15px; margin: 8px 0; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; }
        a:hover { background: #4f46e5; }
        a.secondary { background: #374151; }
        a.secondary:hover { background: #4b5563; }
        .status { padding: 15px; background: #0d1117; border-radius: 8px; margin-top: 20px; font-size: 14px; }
        .status-item { margin: 8px 0; }
        .status-ok { color: #4ade80; }
        .status-warn { color: #fbbf24; }
        code { background: #000; padding: 2px 6px; border-radius: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      </style>
    </head>
    <body>
      <h1>Concord Smart Office</h1>

      <div class="section">
        <h2>Kiosk Displays</h2>
        <div class="grid">
          <a href="/kiosk/entry1">Kiosk: Entry 1</a>
          <a href="/kiosk/entry2">Kiosk: Entry 2</a>
        </div>
      </div>

      <div class="section">
        <h2>Frame Displays</h2>
        <div class="grid">
          <a class="secondary" href="/frame/1?local=1">Frame 1 (Horizontal) - ${localQueueStore.frameQueues['1'].length} items</a>
          <a class="secondary" href="/frame/2?local=1">Frame 2 (Horizontal) - ${localQueueStore.frameQueues['2'].length} items</a>
          <a class="secondary" href="/frame/3?local=1">Frame 3 (Vertical) - ${localQueueStore.frameQueues['3'].length} items</a>
          <a class="secondary" href="/frame/4?local=1">Frame 4 (Vertical) - ${localQueueStore.frameQueues['4'].length} items</a>
        </div>
      </div>

      <div class="section">
        <h2>API Endpoints</h2>
        <a class="secondary" href="/api/config">GET /api/config - Server Configuration</a>
        <a class="secondary" href="/api/presence">GET /api/presence - Current Presence</a>
        <a class="secondary" href="/api/queue">GET /api/queue - Frame Queues</a>
        <a class="secondary" href="/health">GET /health - Health Check</a>
      </div>

      <div class="status">
        <div class="status-item">
          <strong>Google OAuth:</strong>
          <span class="${GOOGLE_OAUTH_CONFIGURED ? 'status-ok' : 'status-warn'}">
            ${GOOGLE_OAUTH_CONFIGURED ? 'Configured' : 'Not configured (demo mode)'}
          </span>
        </div>
        <div class="status-item">
          <strong>Pixabay API:</strong>
          <span class="${PIXABAY_API_KEY ? 'status-ok' : 'status-warn'}">
            ${PIXABAY_API_KEY ? 'Configured' : 'Not configured'}
          </span>
        </div>
        <div class="status-item">
          <strong>Home Assistant:</strong> <code>${HA_URL}</code>
        </div>
        <div class="status-item">
          <strong>PWA URL:</strong> <code>${PWA_URL}</code>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ============================================================================
// Error Handling Middleware
// ============================================================================

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `The requested resource ${req.path} was not found`,
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(isDev && { stack: err.stack })
  });
});

// ============================================================================
// PWA Catch-all Route (for client-side routing)
// ============================================================================

// Serve index.html for any non-API routes (SPA client-side routing)
app.get('*', (req, res) => {
  // Don't serve index.html for API routes or static files that exist
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  res.sendFile(path.join(__dirname, '../pwa/dist/index.html'));
});

// ============================================================================
// Server Startup
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('Concord Smart Office Backend Server');
  console.log('='.repeat(60));
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API config: http://localhost:${PORT}/api/config`);
  console.log('');
  console.log('Configuration:');
  console.log(`  - Home Assistant URL: ${HA_URL}`);
  console.log(`  - PWA URL: ${PWA_URL}`);
  console.log(`  - Google OAuth: ${GOOGLE_OAUTH_CONFIGURED ? 'Configured' : 'Not configured (demo mode)'}`);
  console.log(`  - Pixabay API: ${PIXABAY_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  Auth:     /api/auth/google, /api/auth/session, /api/auth/logout');
  console.log('  Users:    /api/users, /api/users/me');
  console.log('  Presence: /api/presence, /api/presence/checkin, /api/presence/checkout');
  console.log('  Kiosk:    /api/kiosk/token/:id, /api/kiosk/rotate/:id, /api/kiosk/validate');
  console.log('  Frames:   /frame/:id, /api/queue/*');
  console.log('  Pixabay:  /api/pixabay/videos, /api/pixabay/categories');
  console.log('  Music:    /api/music/*, /api/me/tastes, /api/me/volume');
  console.log('  Scheduler: /api/music/scheduler/status, pause, resume, skip');
  console.log('  Oasis:    /api/oasis/*, /api/oasis/led/*');
  console.log('='.repeat(60));

  // Start the music scheduler (async, will run in background)
  if (process.env.HA_TOKEN) {
    console.log('[Scheduler] Starting music scheduler...');
    schedulerService.start().catch(err => {
      console.error('[Scheduler] Failed to start:', err.message);
    });

    // Start the Oasis pattern scheduler
    console.log('[OasisScheduler] Starting pattern scheduler...');
    oasisSchedulerService.start().catch(err => {
      console.error('[OasisScheduler] Failed to start:', err.message);
    });
  } else {
    console.log('[Scheduler] Skipping scheduler start - HA_TOKEN not configured');
  }

  // Start presence webhook retry interval
  presenceService.startRetryInterval();
  console.log('[Presence] Started webhook retry interval');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  schedulerService.stop();
  presenceService.stopRetryInterval();
  db.closeDatabase();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  schedulerService.stop();
  presenceService.stopRetryInterval();
  db.closeDatabase();
  process.exit(0);
});

module.exports = app;
