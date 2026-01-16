import { haWebSocket } from './haWebSocket'
import type { HAState } from './types'

// SpotifyPlus entity ID - configure in HA
const SPOTIFY_ENTITY_ID = 'media_player.spotifyplus'

// Voting is managed client-side in SpotifyContext
// For persistent voting across sessions, could use: input_text.spotify_votes

export interface SpotifyTrack {
  title: string
  artist: string
  album: string
  albumArt: string | null
  duration: number
  position: number
  uri: string
}

export interface SpotifyPlaybackState {
  isPlaying: boolean
  track: SpotifyTrack | null
  volume: number
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
  source: string
  deviceName: string
}

export interface QueueTrack {
  id: string
  title: string
  artist: string
  albumArt: string | null
  uri: string
  votes: number
  votedBy: string[]
}

export interface SkipVote {
  votedBy: string[]
  trackUri: string
  timestamp: number
}

export class SpotifyService {
  private stateChangeSubscription: number | null = null

  // Parse HA media_player state to our SpotifyPlaybackState
  private parsePlaybackState(state: HAState): SpotifyPlaybackState {
    const attrs = state.attributes as Record<string, unknown>

    return {
      isPlaying: state.state === 'playing',
      track: attrs.media_title ? {
        title: (attrs.media_title as string) || 'Unknown',
        artist: (attrs.media_artist as string) || 'Unknown Artist',
        album: (attrs.media_album_name as string) || '',
        albumArt: (attrs.entity_picture as string) || null,
        duration: (attrs.media_duration as number) || 0,
        position: (attrs.media_position as number) || 0,
        uri: (attrs.media_content_id as string) || ''
      } : null,
      volume: ((attrs.volume_level as number) || 0) * 100,
      shuffle: (attrs.shuffle as boolean) || false,
      repeat: (attrs.repeat as 'off' | 'all' | 'one') || 'off',
      source: (attrs.source as string) || '',
      deviceName: (attrs.friendly_name as string) || 'Spotify'
    }
  }

  // Get current playback state
  async getPlaybackState(): Promise<SpotifyPlaybackState | null> {
    try {
      const state = await haWebSocket.getState(SPOTIFY_ENTITY_ID)
      if (!state) return null
      return this.parsePlaybackState(state)
    } catch (err) {
      console.error('[Spotify] Failed to get playback state:', err)
      return null
    }
  }

  // Subscribe to playback state changes
  async subscribeToPlaybackChanges(
    onUpdate: (state: SpotifyPlaybackState | null) => void
  ): Promise<() => void> {
    // Get initial state
    const initial = await this.getPlaybackState()
    onUpdate(initial)

    // Subscribe to state changes
    this.stateChangeSubscription = await haWebSocket.subscribeStateChanges(
      async (entityId, newState) => {
        if (entityId === SPOTIFY_ENTITY_ID) {
          onUpdate(this.parsePlaybackState(newState))
        }
      }
    )

    return () => {
      if (this.stateChangeSubscription !== null) {
        haWebSocket.unsubscribeEvents(this.stateChangeSubscription)
        this.stateChangeSubscription = null
      }
    }
  }

  // Playback controls
  async play(): Promise<void> {
    await haWebSocket.callService('media_player', 'media_play', undefined, {
      entity_id: SPOTIFY_ENTITY_ID
    })
  }

  async pause(): Promise<void> {
    await haWebSocket.callService('media_player', 'media_pause', undefined, {
      entity_id: SPOTIFY_ENTITY_ID
    })
  }

  async nextTrack(): Promise<void> {
    await haWebSocket.callService('media_player', 'media_next_track', undefined, {
      entity_id: SPOTIFY_ENTITY_ID
    })
  }

  async previousTrack(): Promise<void> {
    await haWebSocket.callService('media_player', 'media_previous_track', undefined, {
      entity_id: SPOTIFY_ENTITY_ID
    })
  }

  async setVolume(volumePercent: number): Promise<void> {
    await haWebSocket.callService('media_player', 'volume_set', {
      volume_level: volumePercent / 100
    }, {
      entity_id: SPOTIFY_ENTITY_ID
    })
  }

  async setShuffle(shuffle: boolean): Promise<void> {
    await haWebSocket.callService('media_player', 'shuffle_set', {
      shuffle
    }, {
      entity_id: SPOTIFY_ENTITY_ID
    })
  }

  async setRepeat(repeat: 'off' | 'all' | 'one'): Promise<void> {
    await haWebSocket.callService('media_player', 'repeat_set', {
      repeat
    }, {
      entity_id: SPOTIFY_ENTITY_ID
    })
  }

  // SpotifyPlus specific services
  async playPlaylist(playlistUri: string): Promise<void> {
    await haWebSocket.callService('spotifyplus', 'player_media_play_context', {
      entity_id: SPOTIFY_ENTITY_ID,
      context_uri: playlistUri
    })
  }

  async addToQueue(trackUri: string): Promise<void> {
    await haWebSocket.callService('spotifyplus', 'player_media_play_track_favorites', {
      entity_id: SPOTIFY_ENTITY_ID,
      uris: trackUri
    })
  }

  async search(query: string, _type: 'track' | 'album' | 'artist' | 'playlist' = 'track'): Promise<unknown> {
    // SpotifyPlus search service (type parameter reserved for future use)
    return haWebSocket.sendCommand({
      type: 'call_service',
      domain: 'spotifyplus',
      service: 'search_tracks',
      service_data: {
        entity_id: SPOTIFY_ENTITY_ID,
        criteria: query,
        limit: 10
      },
      return_response: true
    })
  }

  // Get user's playlists via SpotifyPlus
  async getPlaylists(): Promise<unknown> {
    return haWebSocket.sendCommand({
      type: 'call_service',
      domain: 'spotifyplus',
      service: 'get_playlist_favorites',
      service_data: {
        entity_id: SPOTIFY_ENTITY_ID,
        limit: 20
      },
      return_response: true
    })
  }
}

// Singleton instance
export const spotifyService = new SpotifyService()
