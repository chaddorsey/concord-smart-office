#!/usr/bin/env node
/**
 * Replace invalid tracks with valid instrumental music
 * Deletes tracks with no metadata and adds proper instrumental tracks
 */

const db = require('../db');
const https = require('https');

// Valid instrumental tracks organized by taste
const newTracks = {
  default: [
    '1BncfTJAWxrsxyT9culBrj', // Experience - Ludovico Einaudi
  ],
  chill: [
    '1dsJhk09Q9nqu1vhQvAEzq', // Pathos - Ludovico Einaudi
    '0VLascXUZ2Ze2u5kUD5J1f', // I Giorni - Ludovico Einaudi
    '3weNRklVDqb4Rr5MhKBR3D', // Divenire - Ludovico Einaudi
    '4APoqrhYmINORxY4O2neDg', // Una Mattina - Ludovico Einaudi
    '3jPGemJdr95abo520vyvVk', // Le Onde - Ludovico Einaudi
    '1ahgL3v7nY95L4M7cpsq4N', // Comptine d'un autre été - Yann Tiersen
    '5MVfH4eWAC9LAtTzMbK0jd', // Metamorphosis One - Philip Glass
    '1c64fRjGDreuADaP57DUdn', // On the Nature of Daylight - Max Richter
    '6Q00autZkiplLbOCyhhP1X', // November - Max Richter
    '6nVP0BjjrRGXezuaju2lB1', // The Departure - Michael Nyman
    '1NWpCrK6IsiHKYL0McOYJI', // Opus 23 - Dustin O'Halloran
    '2XdwQmEFayVDI8z6uHw0zo', // Near Light - Ólafur Arnalds
    '3TvIQEWTzOae93ja2xtden', // Saman - Ólafur Arnalds
    '2nNOz8lCveDthAo3ys4J6o', // Says - Nils Frahm
    '0EjKtJcqnbJA11jxjRMLdF', // Re - Nils Frahm
  ],
  upbeat: [
    '6kQnE4IYOcVtqQg1G86bfi', // moondaze - lofi
    '3L6REEaOHHguItfa4RgYfx', // lofi track
    '4pZghY8X73YUxxrd6UahHi', // lofi track
    '7jcEaXD19od05Y4aqgffgW', // lofi track
    '6poWEiJXF0KTXVuoJgqCgI', // lofi track
    '3HivCVJPa249LI1anA9h5V', // lofi track
    '1cU59UL1uLU1eMw2ZjQxOQ', // lofi track
    '7F3QuxLWUqRc09YQdaLqFH', // lofi track
    '3DnFuL77hB7zIe1PTviSCi', // lofi track
    '47coVywh5eDl79jxoAZ7HY', // lofi track
    '3CPfZ20IO32YwJU2rKoiq1', // lofi track
    '2KSB2toeRGq2ArXCyv0vxq', // lofi track
    '210Aq7zUtz5hPKcrugMs7M', // lofi track
    '3outpCyCXNCdvLd77QrOZr', // lofi track
    '11j0qQhHzDxOiItPenCc7e', // lofi track
    '2qPns3m7FxOgrFBPxLT1PG', // lofi track
    '7fWT76LjGYJ492nKGTvSTo', // lofi track
  ],
  focus: [
    '3cfzDDUaIydvRN0txCJQ3f', // Cry Me A River - ambient
    '45atCi3vYyXtz9ijskqGN5', // focus track
    '6LbKeDn3ywGp9IgqONpMjW', // focus track
    '3skl2HiGMaApWAIEy1Ws2W', // focus track
    '0ytvsZOerGzUWfHXVT2Sgy', // focus track
    '6zD8E5D3u5ubPMinFfblei', // focus track
    '36CSkVHmTL57AoVP41edqI', // focus track
    '0SKQHuMAXikET0MokB1xL2', // focus track
    '5sZeTCwIvCvzOuhwC2BXHj', // focus track
    '1JIpSRoEej4e1qXk1tFVYD', // focus track
    '1afoQT3Oiglfy4LpSElysa', // focus track
    '0qL8UimrS3JyOWZWiWrfZZ', // focus track
    '0gXpyI9UZX3mW0a39tWaDT', // focus track
    '3M4k6uhDxJEothhg4gVGAa', // focus track
    '5c5SqH4ccPEVfZLsGDHGmT', // focus track
    '6Xp8V1lxpp4W63TJoEUxel', // focus track
    '4JSF1n2k3ZFbiajYyprJ8L', // focus track
    '1q83RiIfORDTvXZu7CDbhf', // focus track
    '43NbB09YnxxbVVAhDM8OHX', // focus track
    '3D1BI8vGAYoaBYpy6al66L', // focus track
    '352FW8US17KvdxG3bxNuWY', // focus track
    '4129kU81oXaaDjG9mcCUgc', // focus track
  ],
  instrumental: [
    '0P50q9EN9dWgsevY832RR2', // Einaudi
    '1EnWUJvL6apLFYFi0iFuyD', // Einaudi
    '6p6xZtQkYNaKT0sxtzqtc6', // Einaudi
    '52fagtvfKYMKgATLH3Wwmk', // Einaudi
    '3DV69yyFV0bHhkBze5QrmB', // Einaudi
    '0LUJIvq1IIp181kbWi1WnH', // Einaudi
    '24FZP1U7646LkL8F0i2Dvv', // Einaudi
    '51XqIJxkLG3EwtmkRmc8HI', // Einaudi
    '37KhWbZSYvxJ3GmZGjOD1r', // Einaudi
    '05t7k3eVngsob06AEiFSNP', // Einaudi
    '1Lh7HHShT4nchZts6JPyW2', // Einaudi
    '6GQ1kipZsM72PYvLlj4AJo', // Einaudi
    '7M4SOKJXmqtPuITCvgVVxM', // Piano
    '68ZDyrADTDx6wPfuO2cLW4', // Piano
    '1wC7zd8ZiRgiRaIT2THV8c', // Piano
    '2bs3LkR7uKv3NXfeJbfh6e', // Piano
    '0EZyTVtNcrAZHXG0mMRHHT', // Piano
    '0bjICh8K4hNkRxniurTs4V', // Piano
  ]
};

// Fetch metadata from Spotify oEmbed
function fetchMetadata(trackId) {
  return new Promise((resolve, reject) => {
    const url = `https://open.spotify.com/oembed?url=spotify:track:${trackId}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Convert thumbnail URL to higher quality
          const albumArt = json.thumbnail_url?.replace('ab67616d00001e02', 'ab67616d0000b273');
          resolve({
            title: json.title,
            albumArt: albumArt
          });
        } catch (e) {
          reject(new Error(`Failed to parse: ${trackId}`));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== Replacing Invalid Tracks ===\n');

  // Step 1: Delete invalid tracks (those without metadata)
  console.log('Step 1: Removing invalid tracks...');
  const tastes = ['default', 'chill', 'upbeat', 'focus', 'instrumental'];
  let deleted = 0;

  for (const taste of tastes) {
    const tracks = db.getTasteTracks(taste);
    for (const track of tracks) {
      if (!track.title || !track.album_art) {
        db.run('DELETE FROM taste_tracks WHERE id = ?', [track.id]);
        deleted++;
      }
    }
  }
  console.log(`Deleted ${deleted} invalid tracks\n`);

  // Step 2: Add new valid tracks
  console.log('Step 2: Adding new instrumental tracks...');
  let added = 0;
  let failed = 0;

  for (const [tasteId, trackIds] of Object.entries(newTracks)) {
    console.log(`\n[${tasteId}] Adding ${trackIds.length} tracks...`);

    for (const trackId of trackIds) {
      const trackUrl = `spotify:track:${trackId}`;

      // Check if track already exists
      const existing = db.getTasteTracks(tasteId).find(t => t.track_url === trackUrl);
      if (existing) {
        console.log(`  Skip (exists): ${trackId}`);
        continue;
      }

      try {
        // Fetch metadata
        const meta = await fetchMetadata(trackId);

        // Insert track
        db.run(
          'INSERT INTO taste_tracks (taste_id, track_url, title, artist, album_art) VALUES (?, ?, ?, ?, ?)',
          [tasteId, trackUrl, meta.title, null, meta.albumArt]
        );

        console.log(`  Added: ${meta.title}`);
        added++;

        // Small delay to be nice to the API
        await new Promise(r => setTimeout(r, 100));
      } catch (error) {
        console.log(`  Failed: ${trackId} - ${error.message}`);
        failed++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Deleted: ${deleted}`);
  console.log(`Added: ${added}`);
  console.log(`Failed: ${failed}`);

  // Final count
  let total = 0, withMeta = 0;
  for (const taste of tastes) {
    const tracks = db.getTasteTracks(taste);
    total += tracks.length;
    withMeta += tracks.filter(t => t.title && t.album_art).length;
  }
  console.log(`\nFinal: ${withMeta}/${total} tracks with metadata (${Math.round(withMeta/total*100)}%)`);
}

main().catch(console.error);
