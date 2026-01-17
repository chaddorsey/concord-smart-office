import { haWebSocket } from './haWebSocket'
import type { HAState } from './types'

// Photo frame entity patterns - matches photo_frames.yaml package
const FRAME_CONFIGS = [
  { id: '1', statusEntity: 'sensor.frame_1_status', playlistEntity: 'input_select.frame_1_playlist', skipVotesEntity: 'input_number.frame_1_skip_votes', name: 'Frame 1 - Lobby' },
  { id: '2', statusEntity: 'sensor.frame_2_status', playlistEntity: 'input_select.frame_2_playlist', skipVotesEntity: 'input_number.frame_2_skip_votes', name: 'Frame 2 - Kitchen' },
  { id: '3', statusEntity: 'sensor.frame_3_status', playlistEntity: 'input_select.frame_3_playlist', skipVotesEntity: 'input_number.frame_3_skip_votes', name: 'Frame 3 - Meeting Room' },
  { id: '4', statusEntity: 'sensor.frame_4_status', playlistEntity: 'input_select.frame_4_playlist', skipVotesEntity: 'input_number.frame_4_skip_votes', name: 'Frame 4 - Lounge' },
]

const MEDIA_LIBRARY_ENTITY = 'input_text.media_library'
const ROTATION_INTERVAL_ENTITY = 'input_number.frame_rotation_interval'

export interface MediaItem {
  id: string
  url: string
  type: 'image' | 'video'
  title: string
  playlist: string
  votes: number
}

export interface PhotoFrame {
  id: string
  name: string
  playlist: string
  currentIndex: number
  skipVotes: number
  isOnline: boolean
}

export interface PhotoFrameState {
  frames: PhotoFrame[]
  mediaLibrary: MediaItem[]
  playlists: string[]
  rotationInterval: number
}

export class PhotoFrameService {
  private stateChangeSubscription: number | null = null

  // Parse frame state from HA entities
  private parseFrameState(config: typeof FRAME_CONFIGS[0], states: HAState[]): PhotoFrame {
    const statusState = states.find(s => s.entity_id === config.statusEntity)
    const attrs = statusState?.attributes as Record<string, unknown> || {}

    return {
      id: config.id,
      name: config.name,
      playlist: (attrs.playlist as string) || statusState?.state || 'Office Highlights',
      currentIndex: parseInt(attrs.index as string, 10) || 0,
      skipVotes: parseInt(attrs.skip_votes as string, 10) || 0,
      isOnline: statusState?.state !== 'unavailable' && statusState?.state !== 'unknown'
    }
  }

  // Parse media library from HA entity
  private parseMediaLibrary(states: HAState[]): MediaItem[] {
    const libraryState = states.find(s => s.entity_id === MEDIA_LIBRARY_ENTITY)
    if (!libraryState?.state) return []

    try {
      const items = JSON.parse(libraryState.state)
      return Array.isArray(items) ? items : []
    } catch (e) {
      console.error('[PhotoFrame] Failed to parse media library:', e)
      return []
    }
  }

  // Get all playlists from media library
  private getPlaylistsFromLibrary(items: MediaItem[]): string[] {
    const playlists = new Set(items.map(item => item.playlist))
    return Array.from(playlists).sort()
  }

  // Get rotation interval
  private getRotationInterval(states: HAState[]): number {
    const intervalState = states.find(s => s.entity_id === ROTATION_INTERVAL_ENTITY)
    return parseInt(intervalState?.state || '30', 10)
  }

  // Get full photo frame state
  async getState(): Promise<PhotoFrameState> {
    try {
      const states = await haWebSocket.getStates()

      const mediaLibrary = this.parseMediaLibrary(states)
      const playlists = this.getPlaylistsFromLibrary(mediaLibrary)

      return {
        frames: FRAME_CONFIGS.map(config => this.parseFrameState(config, states)),
        mediaLibrary,
        playlists,
        rotationInterval: this.getRotationInterval(states)
      }
    } catch (err) {
      console.error('[PhotoFrame] Failed to get state:', err)
      return {
        frames: FRAME_CONFIGS.map(config => ({
          id: config.id,
          name: config.name,
          playlist: 'Office Highlights',
          currentIndex: 0,
          skipVotes: 0,
          isOnline: false
        })),
        mediaLibrary: [],
        playlists: [],
        rotationInterval: 30
      }
    }
  }

  // Subscribe to state changes
  async subscribeToChanges(
    onUpdate: (state: PhotoFrameState) => void
  ): Promise<() => void> {
    // Get initial state
    const initial = await this.getState()
    onUpdate(initial)

    // Subscribe to state changes for relevant entities
    const watchedEntities = [
      ...FRAME_CONFIGS.flatMap(f => [f.statusEntity, f.playlistEntity, f.skipVotesEntity]),
      MEDIA_LIBRARY_ENTITY,
      ROTATION_INTERVAL_ENTITY
    ]

    this.stateChangeSubscription = await haWebSocket.subscribeStateChanges(
      async (entityId) => {
        if (watchedEntities.includes(entityId)) {
          const updated = await this.getState()
          onUpdate(updated)
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

  // Set playlist for a frame
  async setFramePlaylist(frameId: string, playlist: string): Promise<void> {
    await haWebSocket.callService('script', 'frame_set_playlist', {
      frame_id: frameId,
      playlist
    })
  }

  // Vote to skip current media on a frame
  async voteSkip(frameId: string): Promise<void> {
    await haWebSocket.callService('script', 'frame_vote_skip', {
      frame_id: frameId
    })
  }

  // Go to next media on a frame
  async nextMedia(frameId: string): Promise<void> {
    await haWebSocket.callService('script', 'frame_next', {
      frame_id: frameId
    })
  }

  // Go to previous media on a frame
  async previousMedia(frameId: string): Promise<void> {
    await haWebSocket.callService('script', 'frame_previous', {
      frame_id: frameId
    })
  }

  // Update media library (add/remove/update items)
  async updateMediaLibrary(items: MediaItem[]): Promise<void> {
    await haWebSocket.callService('input_text', 'set_value', {
      value: JSON.stringify(items)
    }, {
      entity_id: MEDIA_LIBRARY_ENTITY
    })
  }

  // Add a new media item
  async addMediaItem(item: Omit<MediaItem, 'id' | 'votes'>): Promise<void> {
    const state = await this.getState()
    const newItem: MediaItem = {
      ...item,
      id: Date.now().toString(),
      votes: 0
    }
    await this.updateMediaLibrary([...state.mediaLibrary, newItem])
  }

  // Upvote a media item
  async upvoteMedia(itemId: string): Promise<void> {
    const state = await this.getState()
    const items = state.mediaLibrary.map(item =>
      item.id === itemId ? { ...item, votes: item.votes + 1 } : item
    )
    await this.updateMediaLibrary(items)
  }

  // Downvote a media item
  async downvoteMedia(itemId: string): Promise<void> {
    const state = await this.getState()
    const items = state.mediaLibrary.map(item =>
      item.id === itemId ? { ...item, votes: item.votes - 1 } : item
    )
    await this.updateMediaLibrary(items)
  }

  // Remove a media item
  async removeMediaItem(itemId: string): Promise<void> {
    const state = await this.getState()
    const items = state.mediaLibrary.filter(item => item.id !== itemId)
    await this.updateMediaLibrary(items)
  }
}

// Singleton instance
export const photoFrameService = new PhotoFrameService()
