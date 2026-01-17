const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// CORS middleware to allow requests from PWA dev server
app.use((req, res, next) => {
  const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const PORT = process.env.PORT || 3001;
const HA_URL = process.env.HA_URL || 'http://homeassistant.local:8123';
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || '';

// In-memory queue storage (for mock mode without HA)
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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

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
  res.sendFile(path.join(__dirname, 'public', 'frame.html'));
});

// API endpoint to get HA configuration
app.get('/api/config', (req, res) => {
  res.json({
    haUrl: HA_URL,
    wsUrl: HA_URL.replace('http', 'ws') + '/api/websocket'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'frame-display' });
});

// ============ Local Queue API (for mock mode without HA) ============

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

// Pixabay video search API
app.get('/api/pixabay/videos', async (req, res) => {
  const query = req.query.q || 'loop';
  const page = parseInt(req.query.page, 10) || 1;
  const perPage = parseInt(req.query.per_page, 10) || 20;
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

// Root redirect to frame 1 for testing
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Concord Frame Display</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #111; color: #fff; }
        h1 { color: #fff; }
        .section { margin: 30px 0; }
        .section h2 { font-size: 1rem; color: #888; margin-bottom: 10px; }
        a { display: block; padding: 15px; margin: 10px 0; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; text-align: center; }
        a:hover { background: #4f46e5; }
        a.secondary { background: #374151; }
        a.secondary:hover { background: #4b5563; }
        .status { padding: 10px; background: #1a1a2e; border-radius: 8px; margin-top: 20px; font-size: 14px; }
        .status code { background: #000; padding: 2px 6px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>🖼️ Concord Frame Display</h1>

      <div class="section">
        <h2>Browse & Add Media</h2>
        <a href="/browse.html">🎬 Browse Pixabay Videos</a>
      </div>

      <div class="section">
        <h2>Frame Displays (Local Mode)</h2>
        <a class="secondary" href="/frame/1?local=1&debug=1">Frame 1 (Horizontal) - ${localQueueStore.frameQueues['1'].length} items</a>
        <a class="secondary" href="/frame/2?local=1&debug=1">Frame 2 (Horizontal) - ${localQueueStore.frameQueues['2'].length} items</a>
        <a class="secondary" href="/frame/3?local=1&debug=1">Frame 3 (Vertical) - ${localQueueStore.frameQueues['3'].length} items</a>
        <a class="secondary" href="/frame/4?local=1&debug=1">Frame 4 (Vertical) - ${localQueueStore.frameQueues['4'].length} items</a>
      </div>

      <div class="status">
        <strong>Status:</strong> ${PIXABAY_API_KEY ? '✅ Pixabay API configured' : '⚠️ Pixabay API key not set'}<br>
        ${!PIXABAY_API_KEY ? '<br>Set <code>PIXABAY_API_KEY</code> env var. Get a free key at <a href="https://pixabay.com/api/docs/" style="display:inline;padding:0;background:none;color:#6366f1;">pixabay.com/api/docs</a>' : ''}
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frame Display Service running on port ${PORT}`);
  console.log(`Home Assistant URL: ${HA_URL}`);
  console.log(`Frame URLs: /frame/1, /frame/2, /frame/3, /frame/4`);
});
