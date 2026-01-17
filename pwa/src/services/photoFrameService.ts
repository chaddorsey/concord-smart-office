import { haWebSocket } from './haWebSocket'
import type { HAState } from './types'

// Photo frame entity patterns - matches photo_frames.yaml package
const FRAME_CONFIGS = [
  { id: '1', statusEntity: 'sensor.frame_1_status', playlistEntity: 'input_select.frame_1_playlist', skipVotesEntity: 'input_number.frame_1_skip_votes', orientationEntity: 'input_select.frame_1_orientation', queueEntity: 'input_text.frame_1_queue', positionEntity: 'input_number.frame_1_queue_position', name: 'Frame 1 - Lobby' },
  { id: '2', statusEntity: 'sensor.frame_2_status', playlistEntity: 'input_select.frame_2_playlist', skipVotesEntity: 'input_number.frame_2_skip_votes', orientationEntity: 'input_select.frame_2_orientation', queueEntity: 'input_text.frame_2_queue', positionEntity: 'input_number.frame_2_queue_position', name: 'Frame 2 - Kitchen' },
  { id: '3', statusEntity: 'sensor.frame_3_status', playlistEntity: 'input_select.frame_3_playlist', skipVotesEntity: 'input_number.frame_3_skip_votes', orientationEntity: 'input_select.frame_3_orientation', queueEntity: 'input_text.frame_3_queue', positionEntity: 'input_number.frame_3_queue_position', name: 'Frame 3 - Meeting Room' },
  { id: '4', statusEntity: 'sensor.frame_4_status', playlistEntity: 'input_select.frame_4_playlist', skipVotesEntity: 'input_number.frame_4_skip_votes', orientationEntity: 'input_select.frame_4_orientation', queueEntity: 'input_text.frame_4_queue', positionEntity: 'input_number.frame_4_queue_position', name: 'Frame 4 - Lounge' },
]

const MEDIA_LIBRARY_ENTITY = 'input_text.media_library'
const ROTATION_INTERVAL_ENTITY = 'input_number.frame_rotation_interval'

// Queue system entities
const MEDIA_QUEUE_ENTITY = 'input_text.media_queue'
const HOLDING_TANK_ENTITY = 'input_text.holding_tank'
const QUEUE_LIMIT_ENTITY = 'input_number.photo_frame_queue_limit'
const IMAGE_DISPLAY_TIME_ENTITY = 'input_number.photo_frame_image_display_time'
const VIDEO_LOOP_COUNT_ENTITY = 'input_number.photo_frame_video_loop_count'

export type MediaOrientation = 'horizontal' | 'vertical'

export interface MediaItem {
  id: string
  url: string
  type: 'image' | 'video'
  title: string
  playlist: string
  votes: number
  // Optional fields for video dimensions
  width?: number
  height?: number
}

export interface QueueItem {
  id: string
  url: string
  hdUrl?: string
  type: 'image' | 'video'
  title: string
  orientation: MediaOrientation
  addedAt: number
  hasPlayed: boolean
  thumbnail?: string
  duration?: number
}

export interface QueueSettings {
  queueLimit: number
  imageDisplayTime: number
  videoLoopCount: number
}

export interface PhotoFrame {
  id: string
  name: string
  playlist: string
  currentIndex: number
  skipVotes: number
  isOnline: boolean
  orientation: MediaOrientation
  queuePosition: number
  queueLength: number
  playedCount: number
  pendingCount: number
}

export interface PhotoFrameState {
  frames: PhotoFrame[]
  mediaLibrary: MediaItem[]
  playlists: string[]
  rotationInterval: number
  // Queue system state
  globalQueue: QueueItem[]
  holdingTank: QueueItem[]
  frameQueues: Record<string, QueueItem[]>
  queueSettings: QueueSettings
}

export class PhotoFrameService {
  private stateChangeSubscription: number | null = null

  // Parse frame state from HA entities
  private parseFrameState(config: typeof FRAME_CONFIGS[0], states: HAState[], frameQueues: Record<string, QueueItem[]>): PhotoFrame {
    const statusState = states.find(s => s.entity_id === config.statusEntity)
    const attrs = statusState?.attributes as Record<string, unknown> || {}
    const queue = frameQueues[config.id] || []

    const playedCount = queue.filter(item => item.hasPlayed).length
    const pendingCount = queue.length - playedCount

    return {
      id: config.id,
      name: config.name,
      playlist: (attrs.playlist as string) || statusState?.state || 'Office Highlights',
      currentIndex: parseInt(attrs.index as string, 10) || 0,
      skipVotes: parseInt(attrs.skip_votes as string, 10) || 0,
      isOnline: statusState?.state !== 'unavailable' && statusState?.state !== 'unknown',
      orientation: (attrs.orientation as MediaOrientation) || 'horizontal',
      queuePosition: parseInt(attrs.queue_position as string, 10) || 0,
      queueLength: queue.length,
      playedCount,
      pendingCount
    }
  }

  // Parse queue settings from HA entities
  private parseQueueSettings(states: HAState[]): QueueSettings {
    const limitState = states.find(s => s.entity_id === QUEUE_LIMIT_ENTITY)
    const displayTimeState = states.find(s => s.entity_id === IMAGE_DISPLAY_TIME_ENTITY)
    const loopCountState = states.find(s => s.entity_id === VIDEO_LOOP_COUNT_ENTITY)

    return {
      queueLimit: parseInt(limitState?.state || '10', 10),
      imageDisplayTime: parseInt(displayTimeState?.state || '30', 10),
      videoLoopCount: parseInt(loopCountState?.state || '3', 10)
    }
  }

  // Parse global queue from HA entity
  private parseGlobalQueue(states: HAState[]): QueueItem[] {
    const queueState = states.find(s => s.entity_id === MEDIA_QUEUE_ENTITY)
    if (!queueState?.state) return []

    try {
      const items = JSON.parse(queueState.state)
      return Array.isArray(items) ? items : []
    } catch (e) {
      console.error('[PhotoFrame] Failed to parse global queue:', e)
      return []
    }
  }

  // Parse holding tank from HA entity
  private parseHoldingTank(states: HAState[]): QueueItem[] {
    const tankState = states.find(s => s.entity_id === HOLDING_TANK_ENTITY)
    if (!tankState?.state) return []

    try {
      const items = JSON.parse(tankState.state)
      return Array.isArray(items) ? items : []
    } catch (e) {
      console.error('[PhotoFrame] Failed to parse holding tank:', e)
      return []
    }
  }

  // Parse all frame queues from HA entities
  private parseFrameQueues(states: HAState[]): Record<string, QueueItem[]> {
    const queues: Record<string, QueueItem[]> = {}

    for (const config of FRAME_CONFIGS) {
      const queueState = states.find(s => s.entity_id === config.queueEntity)
      if (queueState?.state) {
        try {
          const items = JSON.parse(queueState.state)
          queues[config.id] = Array.isArray(items) ? items : []
        } catch (e) {
          queues[config.id] = []
        }
      } else {
        queues[config.id] = []
      }
    }

    return queues
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
      const frameQueues = this.parseFrameQueues(states)

      return {
        frames: FRAME_CONFIGS.map(config => this.parseFrameState(config, states, frameQueues)),
        mediaLibrary,
        playlists,
        rotationInterval: this.getRotationInterval(states),
        globalQueue: this.parseGlobalQueue(states),
        holdingTank: this.parseHoldingTank(states),
        frameQueues,
        queueSettings: this.parseQueueSettings(states)
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
          isOnline: false,
          orientation: 'horizontal' as MediaOrientation,
          queuePosition: 0,
          queueLength: 0,
          playedCount: 0,
          pendingCount: 0
        })),
        mediaLibrary: [],
        playlists: [],
        rotationInterval: 30,
        globalQueue: [],
        holdingTank: [],
        frameQueues: {},
        queueSettings: { queueLimit: 10, imageDisplayTime: 30, videoLoopCount: 3 }
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
      ...FRAME_CONFIGS.flatMap(f => [
        f.statusEntity,
        f.playlistEntity,
        f.skipVotesEntity,
        f.orientationEntity,
        f.queueEntity,
        f.positionEntity
      ]),
      MEDIA_LIBRARY_ENTITY,
      ROTATION_INTERVAL_ENTITY,
      MEDIA_QUEUE_ENTITY,
      HOLDING_TANK_ENTITY,
      QUEUE_LIMIT_ENTITY,
      IMAGE_DISPLAY_TIME_ENTITY,
      VIDEO_LOOP_COUNT_ENTITY
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

  // =========================================================================
  // Queue Management Methods
  // =========================================================================

  // Add a media item to the queue system
  // This will automatically route to appropriate frame(s) based on orientation
  async addToQueue(item: Omit<QueueItem, 'addedAt' | 'hasPlayed'>): Promise<{ assigned: boolean; frameId?: string; reason?: string }> {
    const state = await this.getState()

    const queueItem: QueueItem = {
      ...item,
      addedAt: Date.now(),
      hasPlayed: false
    }

    // Find frames with matching orientation
    const matchingFrames = state.frames.filter(f => f.orientation === item.orientation)

    if (matchingFrames.length === 0) {
      // No matching frames - add to holding tank
      const newHoldingTank = [...state.holdingTank, queueItem]
      await this.updateHoldingTank(newHoldingTank)
      return { assigned: false, reason: `No ${item.orientation} frames available` }
    }

    // Find frame with shortest queue (load balancing)
    const targetFrame = matchingFrames.reduce((shortest, frame) => {
      const currentQueue = state.frameQueues[frame.id] || []
      const shortestQueue = state.frameQueues[shortest.id] || []
      return currentQueue.length < shortestQueue.length ? frame : shortest
    })

    // Add to target frame's queue
    const frameQueue = [...(state.frameQueues[targetFrame.id] || []), queueItem]
    await this.updateFrameQueue(targetFrame.id, frameQueue)

    // Also add to global queue for tracking
    const newGlobalQueue = [...state.globalQueue, queueItem]
    await this.updateGlobalQueue(newGlobalQueue)

    return { assigned: true, frameId: targetFrame.id }
  }

  // Get the queue for a specific frame
  async getFrameQueue(frameId: string): Promise<QueueItem[]> {
    const state = await this.getState()
    return state.frameQueues[frameId] || []
  }

  // Update queue settings
  async updateQueueSettings(settings: Partial<QueueSettings>): Promise<void> {
    if (settings.queueLimit !== undefined) {
      await haWebSocket.callService('input_number', 'set_value', {
        value: settings.queueLimit
      }, {
        entity_id: QUEUE_LIMIT_ENTITY
      })
    }

    if (settings.imageDisplayTime !== undefined) {
      await haWebSocket.callService('input_number', 'set_value', {
        value: settings.imageDisplayTime
      }, {
        entity_id: IMAGE_DISPLAY_TIME_ENTITY
      })
    }

    if (settings.videoLoopCount !== undefined) {
      await haWebSocket.callService('input_number', 'set_value', {
        value: settings.videoLoopCount
      }, {
        entity_id: VIDEO_LOOP_COUNT_ENTITY
      })
    }
  }

  // Set frame orientation
  async setFrameOrientation(frameId: string, orientation: MediaOrientation): Promise<void> {
    const config = FRAME_CONFIGS.find(f => f.id === frameId)
    if (!config) return

    await haWebSocket.callService('input_select', 'select_option', {
      option: orientation
    }, {
      entity_id: config.orientationEntity
    })

    // After changing orientation, redistribute holding tank
    await this.redistributeHoldingTank()
  }

  // Redistribute items from holding tank to matching frames
  async redistributeHoldingTank(): Promise<{ distributed: number; remaining: number }> {
    const state = await this.getState()
    const remaining: QueueItem[] = []
    let distributed = 0

    for (const item of state.holdingTank) {
      // Find frames with matching orientation
      const matchingFrames = state.frames.filter(f => f.orientation === item.orientation)

      if (matchingFrames.length === 0) {
        remaining.push(item)
        continue
      }

      // Find frame with shortest queue
      const targetFrame = matchingFrames.reduce((shortest, frame) => {
        const currentQueue = state.frameQueues[frame.id] || []
        const shortestQueue = state.frameQueues[shortest.id] || []
        return currentQueue.length < shortestQueue.length ? frame : shortest
      })

      // Add to target frame's queue
      const frameQueue = [...(state.frameQueues[targetFrame.id] || []), item]
      await this.updateFrameQueue(targetFrame.id, frameQueue)

      // Add to global queue
      const newGlobalQueue = [...state.globalQueue, item]
      await this.updateGlobalQueue(newGlobalQueue)

      distributed++
    }

    // Update holding tank with remaining items
    await this.updateHoldingTank(remaining)

    return { distributed, remaining: remaining.length }
  }

  // Get available orientations (orientations that have at least one frame)
  getAvailableOrientations(frames: PhotoFrame[]): MediaOrientation[] {
    const orientations = new Set(frames.map(f => f.orientation))
    return Array.from(orientations) as MediaOrientation[]
  }

  // Helper: Update global queue
  private async updateGlobalQueue(queue: QueueItem[]): Promise<void> {
    await haWebSocket.callService('input_text', 'set_value', {
      value: JSON.stringify(queue)
    }, {
      entity_id: MEDIA_QUEUE_ENTITY
    })
  }

  // Helper: Update holding tank
  private async updateHoldingTank(items: QueueItem[]): Promise<void> {
    await haWebSocket.callService('input_text', 'set_value', {
      value: JSON.stringify(items)
    }, {
      entity_id: HOLDING_TANK_ENTITY
    })
  }

  // Helper: Update a frame's queue
  private async updateFrameQueue(frameId: string, queue: QueueItem[]): Promise<void> {
    const config = FRAME_CONFIGS.find(f => f.id === frameId)
    if (!config) return

    await haWebSocket.callService('input_text', 'set_value', {
      value: JSON.stringify(queue)
    }, {
      entity_id: config.queueEntity
    })
  }

  // Remove an item from holding tank
  async removeFromHoldingTank(itemId: string): Promise<void> {
    const state = await this.getState()
    const items = state.holdingTank.filter(item => item.id !== itemId)
    await this.updateHoldingTank(items)
  }

  // Clear a frame's queue
  async clearFrameQueue(frameId: string): Promise<void> {
    await this.updateFrameQueue(frameId, [])
  }
}

// Singleton instance
export const photoFrameService = new PhotoFrameService()
