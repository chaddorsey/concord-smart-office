/**
 * Spotify Metadata Service
 * Fetches track info using Spotify's oEmbed API (no auth required)
 */

/**
 * Extract track ID from various Spotify URL formats
 * @param {string} url - Spotify URL or URI
 * @returns {string|null} Track ID or null if invalid
 */
function extractTrackId(url) {
  if (!url) return null;

  // spotify:track:ID format
  const uriMatch = url.match(/^spotify:track:([a-zA-Z0-9]+)$/);
  if (uriMatch) return uriMatch[1];

  // https://open.spotify.com/track/ID format
  const urlMatch = url.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];

  return null;
}

/**
 * Convert any Spotify track reference to a standard URL
 * @param {string} trackRef - Spotify URL or URI
 * @returns {string|null} Standard Spotify URL
 */
function toSpotifyUrl(trackRef) {
  const trackId = extractTrackId(trackRef);
  if (!trackId) return null;
  return `https://open.spotify.com/track/${trackId}`;
}

/**
 * Fetch track metadata from Spotify's oEmbed API + page scraping for artist
 * @param {string} trackUrl - Spotify track URL or URI
 * @returns {Promise<{title: string, artist: string, thumbnail: string}|null>}
 */
async function fetchTrackMetadata(trackUrl) {
  const spotifyUrl = toSpotifyUrl(trackUrl);
  if (!spotifyUrl) {
    console.error('[SpotifyMetadata] Invalid track URL:', trackUrl);
    return null;
  }

  let title = 'Unknown Track';
  let artist = 'Unknown Artist';
  let thumbnail = null;

  // First try oEmbed for basic info
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'ConcordSmartOffice/1.0' }
    });

    if (response.ok) {
      const data = await response.json();
      title = data.title || title;
      thumbnail = data.thumbnail_url || null;
    }
  } catch (error) {
    console.warn('[SpotifyMetadata] oEmbed failed:', error.message);
  }

  // Then try to scrape the page for artist info from og:description
  try {
    const pageResponse = await fetch(spotifyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ConcordSmartOffice/1.0)',
        'Accept': 'text/html'
      }
    });

    if (pageResponse.ok) {
      const html = await pageResponse.text();

      // Try to extract from og:description which has "Artist · Album · Song · Year"
      const descMatch = html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]+)"/i) ||
                        html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="og:description"/i);

      if (descMatch) {
        const desc = descMatch[1];
        // Format is: "Artist · Album · Song · Year" (artist is FIRST)
        const parts = desc.split(/\s*·\s*/);
        if (parts.length >= 1) {
          artist = parts[0].trim();
        }
      }

      // Also try twitter:audio:artist_name
      const artistMatch = html.match(/<meta\s+(?:property|name)="twitter:audio:artist_name"\s+content="([^"]+)"/i) ||
                          html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="twitter:audio:artist_name"/i);
      if (artistMatch) {
        artist = artistMatch[1];
      }

      // Try og:title which might have "Song - Artist" format
      const ogTitleMatch = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i) ||
                           html.match(/<meta\s+content="([^"]+)"\s+(?:property|name)="og:title"/i);
      if (ogTitleMatch) {
        const parsed = parseOembedTitle(ogTitleMatch[1]);
        if (parsed.artist !== 'Unknown Artist') {
          artist = parsed.artist;
        }
        // Use the title from og:title if we got the same one
        if (title === 'Unknown Track') {
          title = parsed.title;
        }
      }
    }
  } catch (error) {
    console.warn('[SpotifyMetadata] Page scrape failed:', error.message);
  }

  return {
    title: title,
    artist: artist,
    thumbnail: thumbnail,
    provider: 'spotify',
    spotifyUrl: spotifyUrl
  };
}

/**
 * Parse the oEmbed title to extract song name and artist
 * Spotify oEmbed titles are formatted as "Song Name" or include artist info
 * @param {string} oembedTitle - Raw title from oEmbed response
 * @returns {{title: string, artist: string}}
 */
function parseOembedTitle(oembedTitle) {
  if (!oembedTitle) {
    return { title: 'Unknown Track', artist: 'Unknown Artist' };
  }

  // Try to match "Song - Artist" pattern (some responses use this)
  const dashMatch = oembedTitle.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    return { title: dashMatch[1].trim(), artist: dashMatch[2].trim() };
  }

  // Try to match "Song by Artist" pattern
  const byMatch = oembedTitle.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
  }

  // Just return the title as-is
  return { title: oembedTitle, artist: 'Unknown Artist' };
}

/**
 * Fetch metadata for multiple tracks
 * @param {string[]} trackUrls - Array of Spotify track URLs
 * @returns {Promise<Map<string, object>>} Map of URL to metadata
 */
async function fetchMultipleMetadata(trackUrls) {
  const results = new Map();

  // Fetch in parallel with a concurrency limit
  const batchSize = 5;
  for (let i = 0; i < trackUrls.length; i += batchSize) {
    const batch = trackUrls.slice(i, i + batchSize);
    const promises = batch.map(async (url) => {
      const metadata = await fetchTrackMetadata(url);
      results.set(url, metadata);
    });
    await Promise.all(promises);
  }

  return results;
}

module.exports = {
  extractTrackId,
  toSpotifyUrl,
  fetchTrackMetadata,
  fetchMultipleMetadata,
  parseOembedTitle
};
