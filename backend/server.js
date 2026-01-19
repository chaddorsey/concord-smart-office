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

// Import services
const authService = require('./services/authService');
const kioskService = require('./services/kioskService');

// Note: presenceService uses ES modules, we'll import it dynamically or use db directly
// For now, we'll implement presence routes using db functions directly

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

// ============================================================================
// Database Initialization
// ============================================================================

db.initDatabase();
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

// Static files from ./public
app.use(express.static(path.join(__dirname, 'public')));

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
  frameOrientations: { '1': 'horizontal', '2': 'horizontal', '3': 'vertical', '4': 'vertical' },
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

    // Update presence state
    const timestamp = new Date().toISOString();
    const presence = db.setPresenceState(userId, {
      status: 'in',
      checked_in_at: timestamp,
      room_id: room_id || kioskId || null
    });

    // Create presence event
    db.createPresenceEvent({
      user_id: userId,
      type: 'check_in',
      source: source,
      room_id: room_id || kioskId || null,
      timestamp: timestamp
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
app.post('/api/presence/checkout', authService.requireAuth, (req, res) => {
  try {
    const { source = 'manual' } = req.body;
    const userId = req.user.id;
    const timestamp = new Date().toISOString();

    // Update presence state
    const presence = db.setPresenceState(userId, {
      status: 'out',
      checked_in_at: null,
      room_id: null
    });

    // Create presence event
    db.createPresenceEvent({
      user_id: userId,
      type: 'check_out',
      source: source,
      timestamp: timestamp
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

    // Check user in
    const timestamp = new Date().toISOString();
    db.setPresenceState(req.user.id, {
      status: 'in',
      checked_in_at: timestamp,
      room_id: kioskId
    });

    db.createPresenceEvent({
      user_id: req.user.id,
      type: 'check_in',
      source: 'qr',
      room_id: kioskId,
      timestamp: timestamp
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
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  db.closeDatabase();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  db.closeDatabase();
  process.exit(0);
});

module.exports = app;
