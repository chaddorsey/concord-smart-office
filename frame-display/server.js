const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const HA_URL = process.env.HA_URL || 'http://homeassistant.local:8123';
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || '';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Frame display routes - serve the frame viewer with frame ID
app.get('/frame/:id', (req, res) => {
  const frameId = parseInt(req.params.id, 10);
  if (frameId < 1 || frameId > 4) {
    return res.status(404).send('Frame not found. Valid frames: 1-4');
  }
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
    const videos = (data.hits || []).map(hit => ({
      id: `pixabay_${hit.id}`,
      source: 'pixabay',
      sourceId: hit.id,
      title: hit.tags || 'Untitled',
      type: 'video',
      thumbnail: hit.videos?.tiny?.thumbnail || hit.videos?.small?.thumbnail || '',
      previewUrl: hit.videos?.tiny?.url || hit.videos?.small?.url || '',
      url: hit.videos?.medium?.url || hit.videos?.small?.url || '',
      hdUrl: hit.videos?.large?.url || hit.videos?.medium?.url || '',
      duration: hit.duration,
      user: hit.user,
      tags: hit.tags,
      views: hit.views,
      downloads: hit.downloads
    }));

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
        <h2>Frame Displays</h2>
        <a class="secondary" href="/frame/1">Frame 1</a>
        <a class="secondary" href="/frame/2">Frame 2</a>
        <a class="secondary" href="/frame/3">Frame 3</a>
        <a class="secondary" href="/frame/4">Frame 4</a>
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
