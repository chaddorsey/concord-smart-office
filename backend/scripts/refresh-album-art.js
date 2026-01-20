#!/usr/bin/env node
/**
 * Refresh all album art URLs from Spotify oEmbed API
 */

const db = require('../db');
const https = require('https');

function fetchOEmbed(trackId) {
  return new Promise((resolve, reject) => {
    const url = `https://open.spotify.com/oembed?url=spotify:track:${trackId}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 404) {
            reject(new Error('Track not found'));
            return;
          }
          const json = JSON.parse(data);
          resolve(json.thumbnail_url);
        } catch (e) {
          reject(new Error('Parse error'));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const tastes = ['default', 'chill', 'upbeat', 'focus', 'instrumental'];
  const seen = new Set();
  let updated = 0, failed = 0, skipped = 0;

  for (const taste of tastes) {
    const tracks = db.getTasteTracks(taste);
    console.log(`\n[${taste}] ${tracks.length} tracks`);

    for (const track of tracks) {
      if (seen.has(track.track_url)) {
        skipped++;
        continue;
      }
      seen.add(track.track_url);

      const trackId = track.track_url.replace('spotify:track:', '');
      process.stdout.write(`  ${trackId.slice(0, 8)}... `);

      try {
        const albumArt = await fetchOEmbed(trackId);

        // Update taste_tracks
        db.run(
          'UPDATE taste_tracks SET album_art = ? WHERE track_url = ?',
          [albumArt, track.track_url]
        );

        // Update play_history too
        db.run(
          'UPDATE play_history SET album_art = ? WHERE track_url = ?',
          [albumArt, track.track_url]
        );

        console.log('OK -', track.title || 'untitled');
        updated++;

        await new Promise(r => setTimeout(r, 50));
      } catch (err) {
        console.log('FAIL -', err.message);
        failed++;
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log('Updated:', updated);
  console.log('Failed:', failed);
  console.log('Skipped (dupe):', skipped);
}

main().catch(console.error);
