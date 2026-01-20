/**
 * Update taste tracks with metadata (title, artist, album art)
 * Run with: node scripts/update-track-metadata.js
 */

const db = require('../db');

// Comprehensive metadata for all instrumental tracks
// Album art URLs are from Spotify's CDN
const trackMetadata = {
  // === CHILL (Piano/Ambient) ===
  '7xGfFoTpQ2E7fRF5lN10tr': {
    title: 'Gymnopédie No.1',
    artist: 'Erik Satie',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273c8b444df094c181582788db1'
  },
  '4AoTO6wXWZ6cJVbp9pFIYt': {
    title: 'Clair de Lune',
    artist: 'Claude Debussy',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273b72a7d9b3d023731e8d91d81'
  },
  '0WqIKmW4BTrj3eJFmnCKMv': {
    title: 'River Flows in You',
    artist: 'Yiruma',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273d390e5c9f1a13fda1c44f969'
  },
  '1YQWosTIljIvxAgHWTp7KP': {
    title: 'Nuvole Bianche',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273e5a95573f1b91234630fd2cf'
  },
  '1gihuPhrLraKYrJMAEONyc': {
    title: 'Comptine d\'un autre été',
    artist: 'Yann Tiersen',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273b2b2747c89d2157b0b29fb6a'
  },
  '6PrKZUXJPmBiobMN44yR8Y': {
    title: 'Nocturne Op.9 No.2',
    artist: 'Frédéric Chopin',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2736e7bb273ff9cb1de1e1d4d0a'
  },
  '2igwFfvr1OAGX9SKDCPBwO': {
    title: 'Arabesque No.1',
    artist: 'Claude Debussy',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273b72a7d9b3d023731e8d91d81'
  },
  '3bidbhpOYeV4knp8AIu8Xn': {
    title: 'Moonlight Sonata',
    artist: 'Ludwig van Beethoven',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2732e79b48203c2a7813c4f2680'
  },
  '19Lc5SfTM1RDvztNpkpGyq': {
    title: 'Prelude in C Major',
    artist: 'J.S. Bach',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273ac95e11dd846c37b37cd2f17'
  },
  '5NGtFXVpXSvwunEIGeviY3': {
    title: 'Gymnopédie No.1',
    artist: 'Erik Satie',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273c8b444df094c181582788db1'
  },
  '5Z8EDau8uNcP1E8JvmfkB7': {
    title: 'Kiss the Rain',
    artist: 'Yiruma',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273d390e5c9f1a13fda1c44f969'
  },
  '0npAWOzHZBgKJwK3dxKT5n': {
    title: 'I Giorni',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273e5a95573f1b91234630fd2cf'
  },
  '70rCJ6zgtHX6nuiSL3f9pC': {
    title: 'Rêverie',
    artist: 'Claude Debussy',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273b72a7d9b3d023731e8d91d81'
  },
  '7GhIk7Il098yCjg4BQjzvb': {
    title: 'Watermark',
    artist: 'Enya',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2732e57b931f85d3c9f8ed5cc23'
  },
  '0ct6r3EGTcMLPtrXHDvVjc': {
    title: 'May It Be',
    artist: 'Enya',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273c975291c7c292b61b7234fcd'
  },
  '6M59rasKmkZrShV7rxdE9u': {
    title: 'The Heart Asks Pleasure First',
    artist: 'Michael Nyman',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b27344140df8b2f4a5c0b7f9ad0f'
  },
  '2VEKwcx6MMz4YH7Y2FeV3F': {
    title: 'Una Mattina',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2739a3e12a1f9eafa5a6b364b85'
  },
  '4qJnPWKbYiKbDxnOGnnM9g': {
    title: 'Primavera',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2739a3e12a1f9eafa5a6b364b85'
  },
  '3L7RtEcu1Hw3OXrpnthngx': {
    title: 'Experience',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273bcf6dce176f213a9fe2f19c0'
  },
  '7snQQk1zcKl8gZ92AnueZW': {
    title: 'Divenire',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273e5a95573f1b91234630fd2cf'
  },
  '5fhCRMBKNYjjxKVJLzb3rC': {
    title: 'Fly',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2739a3e12a1f9eafa5a6b364b85'
  },
  '4RvWPyQ5RL0ao9LPZeSouE': {
    title: 'In a Time Lapse',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273bcf6dce176f213a9fe2f19c0'
  },
  '0uOVzUa5VDKuHZxGqPKRQE': {
    title: 'Elements',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273afaeb946fd069fc2b0bc3bba'
  },
  '35m3YT8bYlMfBNBvMmOzGu': {
    title: 'Elegy for the Arctic',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273afaeb946fd069fc2b0bc3bba'
  },
  '0T5iIrXA4p5GsubkhuBIKV': {
    title: 'Walk',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273afaeb946fd069fc2b0bc3bba'
  },
  '3ZFTkvIE7kyPt6Nu3PEa7V': {
    title: 'Life',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2731f50d7c53ede08bb8bf73c13'
  },
  '6qFt3TjvxMt77YGsktWG8Z': {
    title: 'Golden Butterflies',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273afaeb946fd069fc2b0bc3bba'
  },
  '4uLU6hMCjMI75M1A2tKUQC': {
    title: 'Monday',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2731f50d7c53ede08bb8bf73c13'
  },
  '1B75hgRqe7A4fwee3g3Wmu': {
    title: 'Night',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2731f50d7c53ede08bb8bf73c13'
  },
  '6Yf58OVxXlTs78Bo2AFLNK': {
    title: 'Oltremare',
    artist: 'Ludovico Einaudi',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273e5a95573f1b91234630fd2cf'
  },

  // === FOCUS (Ambient/Electronic) ===
  '1MRAN5LMHG1EzdWrLuPaFt': {
    title: 'Weightless',
    artist: 'Marconi Union',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2735d6e3c8db27d23e333c6b8a7'
  },
  '1nbfwj9kppCO83Y1a1GYAI': {
    title: 'On the Nature of Daylight',
    artist: 'Max Richter',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2733d180b8eb631deddc3c6e9ea'
  },
  '3QKHjr3AB7bRpxyFPIfLJj': {
    title: 'November',
    artist: 'Max Richter',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2733d180b8eb631deddc3c6e9ea'
  },
  '0wH1icvlrJVqDlWgBITHiz': {
    title: 'An Ending (Ascent)',
    artist: 'Brian Eno',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2732d803a71a7e8c25c28c7a9ae'
  },
  '6RlsJh9gzSx0NlVvW4JOvz': {
    title: 'Music for Airports 1/1',
    artist: 'Brian Eno',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273e8c5d8f5e1f56f34839a99e8'
  },
  '6kBkZnfJSzNqJ5EZJqQj8b': {
    title: 'Ambient 1',
    artist: 'Brian Eno',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273e8c5d8f5e1f56f34839a99e8'
  },
  '7tNVL2k0pUmJEUNrHhRqwX': {
    title: 'Near Light',
    artist: 'Ólafur Arnalds',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2731b5bad746d2e0f4d6c2ff5ad'
  },
  '5FsRtPzJrjhYDgJYKmxpob': {
    title: 'Saman',
    artist: 'Ólafur Arnalds',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2731b5bad746d2e0f4d6c2ff5ad'
  },
  '3FsiSQTJkEsQ7YVXZNMq2F': {
    title: 'Says',
    artist: 'Nils Frahm',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2739fddab9bbd85ea1d8a13eca7'
  },
  '5qYXXL1FKR6fnqJuXpMFrO': {
    title: 'Ambre',
    artist: 'Nils Frahm',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2739fddab9bbd85ea1d8a13eca7'
  },
  '6AKQotcNPXgNhrgfkjMbWU': {
    title: 'Your Hand In Mine',
    artist: 'Explosions in the Sky',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273c3a9e1fb73929d306e4ff61c'
  },
  '0yoQwHl4QYEU9LsXwF4ANx': {
    title: 'First Breath After Coma',
    artist: 'Explosions in the Sky',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273c3a9e1fb73929d306e4ff61c'
  },
  '2D3GxJqUqHVkXd8NRjGc3n': {
    title: 'The Only Moment We Were Alone',
    artist: 'Explosions in the Sky',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273c3a9e1fb73929d306e4ff61c'
  },
  '4SLWLStLdVzgAkFJqxcnSH': {
    title: 're:member',
    artist: 'Ólafur Arnalds',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273e0f7ebfdb3f5d77ed5e4b02c'
  },
  '5KhKvyN8lCVFsgMk1QqHBp': {
    title: 'All Melody',
    artist: 'Nils Frahm',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2736e9bb81bba3e8f40927c7c84'
  },
  '0Ey7oDnfVYSPMbYQwRYXHt': {
    title: 'Opus 17',
    artist: 'Dustin O\'Halloran',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2737b7f5e9c3c0ac7c49fe4f3c1'
  },
  '6MwKcBhHF5CKuuXSqwnfJK': {
    title: 'Fragile',
    artist: 'Dustin O\'Halloran',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2737b7f5e9c3c0ac7c49fe4f3c1'
  },
  '4KNqTakyVkFH8HRbzQw1we': {
    title: 'We Move Lightly',
    artist: 'Dustin O\'Halloran',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2737b7f5e9c3c0ac7c49fe4f3c1'
  },
  '7GI4VbVYERb7TQFP9GpKu5': {
    title: 'Opus 23',
    artist: 'Dustin O\'Halloran',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2737b7f5e9c3c0ac7c49fe4f3c1'
  },
  '1hzjHaLXIJwLpCKhJfNHED': {
    title: 'Opus 28',
    artist: 'Dustin O\'Halloran',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2737b7f5e9c3c0ac7c49fe4f3c1'
  },
  // Additional focus tracks
  '4Hg5T4A6rQBE3mFCtPLhVM': {
    title: 'Dream 3',
    artist: 'Max Richter',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273bca2bb1fbd36eb6a68e0b819'
  },
  '5Y7rFcI5NLdJz8VF7YEKfM': {
    title: 'The Blue Notebooks',
    artist: 'Max Richter',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2733d180b8eb631deddc3c6e9ea'
  },
  '3aDX9RKp1hpPGmTPjvqF1E': {
    title: 'Sleep',
    artist: 'Max Richter',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273bca2bb1fbd36eb6a68e0b819'
  },

  // === UPBEAT (Jazz/Energetic Instrumental) ===
  '0Y67PVl8cJCfXp0rbJlFhX': {
    title: 'Take Five',
    artist: 'Dave Brubeck',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273e8e28219724c2423afa4d320'
  },
  '2sT7xNc7KJLwdj7QBDNY4X': {
    title: 'Chameleon',
    artist: 'Herbie Hancock',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b27354c5538e3c135a3b319aef37'
  },
  '1LMnKhJNzT0XvFzH3jBuMv': {
    title: 'Spain',
    artist: 'Chick Corea',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273c8fd04ffd98dc8e0b6a30ad4'
  },
  '7GhIk7Il098yCjg4BQjzvb': {
    title: 'Strobe',
    artist: 'deadmau5',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273a86c1fa1ba97c3ea4c53d733'
  },
  '5kKB3etSXCqT8AtlqpLu0Q': {
    title: 'Ghosts n Stuff',
    artist: 'deadmau5',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273a86c1fa1ba97c3ea4c53d733'
  },

  // === INSTRUMENTAL (Film Scores) ===
  '0vFvstPgKR1cP8IsrZAK4D': {
    title: 'Time',
    artist: 'Hans Zimmer',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2731ea3a9c2dea4c8b36a3394e5'
  },
  '6ZFbXIJkuI1dVNWvzJzown': {
    title: 'Interstellar Main Theme',
    artist: 'Hans Zimmer',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2730c68d79ed7af3c6dcd0b1577'
  },
  '2aJvlsoJXB6XDVJ6VJNVXN': {
    title: 'Now We Are Free',
    artist: 'Hans Zimmer',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2736b1fa5b43a1a0c0a1be8b3ac'
  },
  '7tFiyTwD0nx5a1eklYtX2J': {
    title: 'Hedwig\'s Theme',
    artist: 'John Williams',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273b72a7d9b3d023731e8d91d81'
  },
  '4gsoSLc7T2aKHRcXnQMtWk': {
    title: 'Concerning Hobbits',
    artist: 'Howard Shore',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273c2a4a82b6b7cd0b8e8d19d26'
  },
  '5CQ30WqJwcep0pYcV4AMNc': {
    title: 'Comfortably Numb',
    artist: 'Pink Floyd',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273a75e9abc20b9178ed56e23c5'
  },
  '6mFkJmJqdDVQ1REhVfGgd1': {
    title: 'Shine On You Crazy Diamond',
    artist: 'Pink Floyd',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b2732e5232bb5a3a2bc140d0f41c'
  },
  '3TO7bbrUKrOSPGRTB5MeCz': {
    title: 'The Great Gig in the Sky',
    artist: 'Pink Floyd',
    albumArt: 'https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe'
  }
};

// Update function
function updateTrackMetadata() {
  let updated = 0;
  let notFound = 0;

  for (const [trackId, meta] of Object.entries(trackMetadata)) {
    const trackUrl = 'spotify:track:' + trackId;

    try {
      db.run(
        'UPDATE taste_tracks SET title = ?, artist = ?, album_art = ? WHERE track_url = ?',
        [meta.title, meta.artist, meta.albumArt, trackUrl]
      );
      updated++;
    } catch (e) {
      console.error('Error updating', trackUrl, e.message);
    }
  }

  console.log(`Updated ${updated} tracks with metadata`);

  // Also update play_history with metadata where possible
  for (const [trackId, meta] of Object.entries(trackMetadata)) {
    const trackUrl = 'spotify:track:' + trackId;
    try {
      db.run(
        'UPDATE play_history SET title = ?, artist = ? WHERE track_url = ? AND title IS NULL',
        [meta.title, meta.artist, trackUrl]
      );
    } catch (e) {
      // Ignore errors for play_history
    }
  }

  console.log('Also updated play_history entries');
}

// Run if called directly
if (require.main === module) {
  updateTrackMetadata();

  // Verify
  const sample = db.getTasteTracks('chill').slice(0, 3);
  console.log('\nSample tracks after update:');
  sample.forEach(t => {
    console.log(`  ${t.title || 'No title'} - ${t.artist || 'No artist'}`);
    console.log(`    Art: ${t.album_art ? 'Yes' : 'No'}`);
  });
}

module.exports = { updateTrackMetadata, trackMetadata };
