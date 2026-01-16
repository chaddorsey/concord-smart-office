import { haWebSocket } from './haWebSocket'
import type { HAState } from './types'

// Photo frame entity patterns - configure based on your HA setup
// Each frame can be a media_player, camera, or input_select entity
const FRAME_ENTITIES = [
  { id: 'frame_1', entityId: 'media_player.photo_frame_1', name: 'Frame 1 - Lobby' },
  { id: 'frame_2', entityId: 'media_player.photo_frame_2', name: 'Frame 2 - Kitchen' },
  { id: 'frame_3', entityId: 'media_player.photo_frame_3', name: 'Frame 3 - Meeting Room' },
  { id: 'frame_4', entityId: 'media_player.photo_frame_4', name: 'Frame 4 - Lounge' },
]

export interface PhotoFrame {
  id: string
  entityId: string
  name: string
  currentImage: string | null
  isOnline: boolean
}

export interface PlaylistImage {
  id: string
  url: string
  title: string
  addedBy: string
  addedAt: string
  upvotes: number
  downvotes: number
  score: number
}

export interface PhotoFrameState {
  frames: PhotoFrame[]
  playlist: PlaylistImage[]
  currentPlaylistIndex: number
}

export class PhotoFrameService {
  private stateChangeSubscription: number | null = null

  // Parse frame state from HA entity
  private parseFrameState(config: typeof FRAME_ENTITIES[0], state: HAState | undefined): PhotoFrame {
    if (!state) {
      return {
        id: config.id,
        entityId: config.entityId,
        name: config.name,
        currentImage: null,
        isOnline: false
      }
    }

    const attrs = state.attributes as Record<string, unknown>

    return {
      id: config.id,
      entityId: config.entityId,
      name: config.name,
      currentImage: (attrs.entity_picture as string) || (attrs.media_image_url as string) || null,
      isOnline: state.state !== 'unavailable' && state.state !== 'off'
    }
  }

  // Get all frame states
  async getFrameStates(): Promise<PhotoFrame[]> {
    try {
      const states = await haWebSocket.getStates()

      return FRAME_ENTITIES.map(config => {
        const state = states.find(s => s.entity_id === config.entityId)
        return this.parseFrameState(config, state)
      })
    } catch (err) {
      console.error('[PhotoFrame] Failed to get frame states:', err)
      return FRAME_ENTITIES.map(config => this.parseFrameState(config, undefined))
    }
  }

  // Subscribe to frame state changes
  async subscribeToChanges(
    onUpdate: (frames: PhotoFrame[]) => void
  ): Promise<() => void> {
    // Get initial state
    const initial = await this.getFrameStates()
    onUpdate(initial)

    // Subscribe to state changes
    const frameEntityIds = FRAME_ENTITIES.map(f => f.entityId)
    this.stateChangeSubscription = await haWebSocket.subscribeStateChanges(
      async (entityId) => {
        if (frameEntityIds.includes(entityId)) {
          const updated = await this.getFrameStates()
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

  // Display a specific image on a frame
  async displayImage(frameEntityId: string, imageUrl: string): Promise<void> {
    await haWebSocket.callService('media_player', 'play_media', {
      media_content_id: imageUrl,
      media_content_type: 'image'
    }, {
      entity_id: frameEntityId
    })
  }

  // Display image on all frames
  async displayImageOnAll(imageUrl: string): Promise<void> {
    await haWebSocket.callService('media_player', 'play_media', {
      media_content_id: imageUrl,
      media_content_type: 'image'
    }, {
      entity_id: FRAME_ENTITIES.map(f => f.entityId)
    })
  }

  // Turn frame on
  async turnOn(frameEntityId: string): Promise<void> {
    await haWebSocket.callService('media_player', 'turn_on', undefined, {
      entity_id: frameEntityId
    })
  }

  // Turn frame off
  async turnOff(frameEntityId: string): Promise<void> {
    await haWebSocket.callService('media_player', 'turn_off', undefined, {
      entity_id: frameEntityId
    })
  }

  // Next image in playlist
  async nextImage(frameEntityId: string): Promise<void> {
    await haWebSocket.callService('media_player', 'media_next_track', undefined, {
      entity_id: frameEntityId
    })
  }

  // Previous image in playlist
  async previousImage(frameEntityId: string): Promise<void> {
    await haWebSocket.callService('media_player', 'media_previous_track', undefined, {
      entity_id: frameEntityId
    })
  }

  // Fire event to trigger HA automation for playlist management
  async firePlaylistEvent(action: string, data: Record<string, unknown>): Promise<void> {
    await haWebSocket.callService('script', 'turn_on', {
      entity_id: 'script.photo_frame_playlist_action',
      variables: {
        action,
        ...data,
        timestamp: new Date().toISOString()
      }
    })
  }
}

// Singleton instance
export const photoFrameService = new PhotoFrameService()
