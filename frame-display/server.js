const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const HA_URL = process.env.HA_URL || 'http://homeassistant.local:8123';

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

// Root redirect to frame 1 for testing
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Concord Frame Display</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        a { display: block; padding: 15px; margin: 10px 0; background: #007bff; color: white; text-decoration: none; border-radius: 8px; text-align: center; }
        a:hover { background: #0056b3; }
      </style>
    </head>
    <body>
      <h1>Concord Frame Display</h1>
      <p>Select a frame to view:</p>
      <a href="/frame/1">Frame 1</a>
      <a href="/frame/2">Frame 2</a>
      <a href="/frame/3">Frame 3</a>
      <a href="/frame/4">Frame 4</a>
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Configure your photo frames to point to these URLs.
      </p>
    </body>
    </html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frame Display Service running on port ${PORT}`);
  console.log(`Home Assistant URL: ${HA_URL}`);
  console.log(`Frame URLs: /frame/1, /frame/2, /frame/3, /frame/4`);
});
