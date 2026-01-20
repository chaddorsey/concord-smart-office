#!/usr/bin/env node
/**
 * Fetch missing metadata from Spotify oEmbed API
 * This uses the public oEmbed endpoint which doesn't require authentication
 */

const db = require('../db');
const https = require('https');

// Get all tracks missing metadata
function getTracksMissingMetadata() {
  const tastes = ['default', 'chill', 'upbeat', 'focus', 'instrumental'];
  const seen = new Set();
  const missing = [];

  for (const taste of tastes) {
    const tracks = db.getTasteTracks(taste);
    for (const track of tracks) {
      if (seen.has(track.track_url)) continue;
      seen.add(track.track_url);
      if (!track.title || !track.album_art) {
        missing.push(track);
      }
    }
  }

  return missing;
}

// Fetch metadata from Spotify oEmbed
function fetchOEmbed(trackUrl) {
  return new Promise((resolve, reject) => {
    const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse response for ${trackUrl}`));
        }
      });
    }).on('error', reject);
  });
}

// Parse title to extract artist and track name
// oEmbed returns title in format "Track Name, a]n artist(s) on Spotify"
function parseTitle(oembedTitle) {
  // Format: "Track Name, an artist on Spotify" or "Track Name, a song by Artist on Spotify"
  const match = oembedTitle.match(/^(.+?),\s*(?:a song by|an? [\w\s]+ by)?\s*(.+?)\s+on Spotify$/i);
  if (match) {
    return { title: match[1].trim(), artist: match[2].trim() };
  }

  // Try simpler format: "Track - Artist"
  const dashMatch = oembedTitle.match(/^(.+?)\s*[-–]\s*(.+?)(?:\s+on Spotify)?$/);
  if (dashMatch) {
    return { title: dashMatch[1].trim(), artist: dashMatch[2].trim() };
  }

  // Fallback: just use the whole thing as title
  return { title: oembedTitle.replace(/\s+on Spotify$/, ''), artist: null };
}

// Update track in database
function updateTrack(trackUrl, title, artist, albumArt) {
  const stmt = db.db.prepare(`
    UPDATE taste_tracks
    SET title = ?, artist = ?, album_art = ?
    WHERE track_url = ?
  `);
  stmt.run(title, artist, albumArt, trackUrl);
}

// Main function
async function main() {
  const missing = getTracksMissingMetadata();
  console.log(`Found ${missing.length} tracks missing metadata\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i++) {
    const track = missing[i];
    const trackId = track.track_url.replace('spotify:track:', '');

    process.stdout.write(`[${i + 1}/${missing.length}] Fetching ${trackId}... `);

    try {
      const oembed = await fetchOEmbed(track.track_url);
      const { title, artist } = parseTitle(oembed.title);
      const albumArt = oembed.thumbnail_url;

      updateTrack(track.track_url, title, artist, albumArt);
      console.log(`✓ "${title}" by ${artist || 'Unknown'}`);
      updated++;

      // Small delay to be nice to the API
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.log(`✗ ${error.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
}

main().catch(console.error);
