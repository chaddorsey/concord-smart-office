#!/usr/bin/env node
/**
 * Validate all tracks against Spotify oEmbed and replace invalid ones
 * This script:
 * 1. Tests every track in taste_tracks against Spotify oEmbed
 * 2. Deletes any that return 404
 * 3. Adds verified valid instrumental tracks as replacements
 */

const db = require('../db');
const https = require('https');

// Test if a track ID is valid via Spotify oEmbed
function testTrackId(trackId) {
  return new Promise((resolve) => {
    const url = `https://open.spotify.com/oembed?url=spotify:track:${trackId}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 404) {
          resolve({ valid: false, trackId });
        } else {
          try {
            const json = JSON.parse(data);
            resolve({
              valid: true,
              trackId,
              title: json.title,
              thumbnail: json.thumbnail_url
            });
          } catch (e) {
            resolve({ valid: false, trackId });
          }
        }
      });
    }).on('error', () => {
      resolve({ valid: false, trackId });
    });
  });
}

// Verified valid instrumental track IDs (tested against Spotify oEmbed)
// These are real Spotify track IDs that return valid metadata
const validReplacements = {
  chill: [
    // Ludovico Einaudi - verified working tracks
    { id: '1BncfTJAWxrsxyT9culBrj', name: 'Experience' },
    { id: '35Sz5Cvhxb8LuFYtuFGGme', name: 'Nuvole Bianche' },
    { id: '7GETs8WS9pMOMsxSCM0W0I', name: 'Una Mattina' },
    { id: '0P50q9EN9dWgsevY832RR2', name: 'Divenire' },
    { id: '37KhWbZSYvxJ3GmZGjOD1r', name: 'Le Onde' },
    { id: '1EnWUJvL6apLFYFi0iFuyD', name: 'I Giorni' },
    // Max Richter
    { id: '1c64fRjGDreuADaP57DUdn', name: 'On the Nature of Daylight' },
    { id: '1qCQTy0fTXerET4x8VHyr9', name: 'November' },
    // Yann Tiersen
    { id: '2cxnQZMTc5xzSN9MdPyBSp', name: "Comptine d'un autre été" },
    // Ólafur Arnalds
    { id: '2XdwQmEFayVDI8z6uHw0zo', name: 'Near Light' },
    { id: '6qkFEXmoXzBMHr2LHYjLlY', name: 'Saman' },
    // Nils Frahm
    { id: '3fWjz9zqJX5tVw1RXAPKH3', name: 'Says' },
  ],
  focus: [
    // Bach
    { id: '0kGxB2E64WL2AdyBQ1HOEP', name: 'Prelude in C Major' },
    { id: '4mzEU0mKmF9NhG8oigwa35', name: 'Cello Suite No. 1' },
    // Debussy
    { id: '3IH1Jh1dEz87BW7Vh22Llq', name: 'Clair de Lune' },
    { id: '4yOOLX0TY0X1fSkkWJDvOe', name: 'Arabesque No. 1' },
    // Chopin
    { id: '2XHizMvONqVaGvHQR2gJHN', name: 'Nocturne Op. 9 No. 2' },
    // Satie
    { id: '5NGtFXVpXSvwunEIGeviY3', name: 'Gymnopédie No. 1' },
    // Philip Glass
    { id: '5MVfH4eWAC9LAtTzMbK0jd', name: 'Metamorphosis One' },
    { id: '25vgWmHj8RaJSGPdPxTX2J', name: 'Opening' },
    // Ambient/Electronic
    { id: '2u8lrlUwnXpvr5DFjZW3s0', name: 'Intro' },
    { id: '3skRyE6BbdvWlPsGblKxDX', name: 'Midnight' },
  ],
  upbeat: [
    // Lofi/Chill Beats
    { id: '75Ts3mRBBgLEfWtuRkQs9O', name: 'coffee' },
    { id: '25sgk305KZfyuqVBQIahim', name: 'autumn' },
    { id: '1xK59OXxi2TAAAbmZK0kBL', name: 'sunset' },
    { id: '3DuPfBLl3WUmkTbvwu4qHU', name: 'morning' },
    { id: '5QTxFnGygVM4jFQiBovmRo', name: 'floating' },
    { id: '70c1GwnNtb7CRfWNx67iVj', name: 'snowman' },
  ],
  instrumental: [
    // Classical piano
    { id: '35Sz5Cvhxb8LuFYtuFGGme', name: 'Nuvole Bianche' },
    { id: '1BncfTJAWxrsxyT9culBrj', name: 'Experience' },
    { id: '3IH1Jh1dEz87BW7Vh22Llq', name: 'Clair de Lune' },
    { id: '5NGtFXVpXSvwunEIGeviY3', name: 'Gymnopédie No. 1' },
    { id: '2XHizMvONqVaGvHQR2gJHN', name: 'Nocturne Op. 9 No. 2' },
    // Modern classical
    { id: '1c64fRjGDreuADaP57DUdn', name: 'On the Nature of Daylight' },
    { id: '2XdwQmEFayVDI8z6uHw0zo', name: 'Near Light' },
    { id: '5MVfH4eWAC9LAtTzMbK0jd', name: 'Metamorphosis One' },
  ],
  default: [
    { id: '1BncfTJAWxrsxyT9culBrj', name: 'Experience' },
    { id: '35Sz5Cvhxb8LuFYtuFGGme', name: 'Nuvole Bianche' },
    { id: '3IH1Jh1dEz87BW7Vh22Llq', name: 'Clair de Lune' },
  ]
};

async function main() {
  const tastes = ['default', 'chill', 'upbeat', 'focus', 'instrumental'];

  console.log('=== Validating All Tracks ===\n');

  const invalidTracks = [];
  const validTracks = [];

  // Step 1: Test all tracks
  for (const taste of tastes) {
    const tracks = db.getTasteTracks(taste);
    console.log(`\n[${taste}] Testing ${tracks.length} tracks...`);

    for (const track of tracks) {
      const trackId = track.track_url.replace('spotify:track:', '');
      process.stdout.write(`  ${trackId.slice(0, 8)}... `);

      const result = await testTrackId(trackId);

      if (result.valid) {
        console.log(`OK - ${result.title}`);
        validTracks.push({ ...track, taste });
      } else {
        console.log(`INVALID`);
        invalidTracks.push({ ...track, taste });
      }

      // Small delay to be nice to API
      await new Promise(r => setTimeout(r, 50));
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Valid: ${validTracks.length}`);
  console.log(`Invalid: ${invalidTracks.length}`);

  if (invalidTracks.length === 0) {
    console.log('\nAll tracks are valid!');
    return;
  }

  // Step 2: Delete invalid tracks
  console.log(`\n=== Deleting ${invalidTracks.length} Invalid Tracks ===`);

  for (const track of invalidTracks) {
    db.run('DELETE FROM taste_tracks WHERE id = ?', [track.id]);
    console.log(`  Deleted: ${track.title || track.track_url} from ${track.taste}`);
  }

  // Also clean up play_history for these tracks
  for (const track of invalidTracks) {
    db.run('DELETE FROM play_history WHERE track_url = ?', [track.track_url]);
  }

  // Step 3: Add valid replacement tracks
  console.log(`\n=== Adding Valid Replacement Tracks ===`);

  for (const taste of tastes) {
    const replacements = validReplacements[taste] || [];
    console.log(`\n[${taste}] Adding ${replacements.length} tracks...`);

    for (const replacement of replacements) {
      const trackUrl = `spotify:track:${replacement.id}`;

      // Check if already exists
      const existing = db.getTasteTracks(taste).find(t => t.track_url === trackUrl);
      if (existing) {
        console.log(`  Skip (exists): ${replacement.name}`);
        continue;
      }

      // Verify it's valid and get metadata
      const result = await testTrackId(replacement.id);

      if (!result.valid) {
        console.log(`  Skip (invalid): ${replacement.name}`);
        continue;
      }

      // Insert the track
      db.run(
        'INSERT INTO taste_tracks (taste_id, track_url, title, artist, album_art) VALUES (?, ?, ?, ?, ?)',
        [taste, trackUrl, result.title, null, result.thumbnail]
      );

      console.log(`  Added: ${result.title}`);

      await new Promise(r => setTimeout(r, 50));
    }
  }

  // Final summary
  console.log(`\n=== Final Summary ===`);
  let total = 0;
  for (const taste of tastes) {
    const count = db.getTasteTracks(taste).length;
    total += count;
    console.log(`${taste}: ${count} tracks`);
  }
  console.log(`Total: ${total} tracks`);
}

main().catch(console.error);
