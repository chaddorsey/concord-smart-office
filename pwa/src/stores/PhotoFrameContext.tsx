import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { photoFrameService, type PhotoFrame, type MediaItem, type PhotoFrameState, type QueueItem, type QueueSettings, type MediaOrientation } from '../services/photoFrameService'
import { useAuth } from './AuthContext'
import { usePresence } from './PresenceContext'

// Use relative URLs to go through Vite's proxy (fixes third-party cookie issues)
const BACKEND_URL = ''

// Headers for fetch requests (bypass ngrok warning)
const getHeaders = (extra?: Record<string, string>) => ({
  'ngrok-skip-browser-warning': 'true',
  ...extra
})

// Demo media for mock mode
const DEMO_MEDIA: MediaItem[] = [
  { id: '1', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920', type: 'image', title: 'Modern Office', playlist: 'Office Highlights', votes: 5 },
  { id: '2', url: 'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1920', type: 'image', title: 'Workspace', playlist: 'Office Highlights', votes: 3 },
  { id: '3', url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1920', type: 'image', title: 'Team Collaboration', playlist: 'Team Photos', votes: 8 },
  { id: '4', url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1920', type: 'image', title: 'Meeting Room', playlist: 'Team Photos', votes: 2 },
  { id: '5', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920', type: 'image', title: 'Mountains', playlist: 'Nature', votes: 10 },
  { id: '6', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920', type: 'image', title: 'Beach', playlist: 'Nature', votes: 7 },
  { id: '7', url: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1920', type: 'image', title: 'Abstract Art', playlist: 'Art', votes: 4 },
  { id: '8', url: 'https://images.unsplash.com/photo-1549490349-8643362247b5?w=1920', type: 'image', title: 'Colorful Pattern', playlist: 'Art', votes: 6 },
]

const DEMO_FRAMES: PhotoFrame[] = [
  { id: '1', name: 'Frame 1 - Lobby', playlist: 'Office Highlights', currentIndex: 0, skipVotes: 0, isOnline: true, orientation: 'horizontal', queuePosition: 0, queueLength: 0, playedCount: 0, pendingCount: 0 },
  { id: '2', name: 'Frame 2 - Kitchen', playlist: 'Team Photos', currentIndex: 0, skipVotes: 0, isOnline: true, orientation: 'horizontal', queuePosition: 0, queueLength: 0, playedCount: 0, pendingCount: 0 },
  { id: '3', name: 'Frame 3 - Meeting Room', playlist: 'Nature', currentIndex: 0, skipVotes: 0, isOnline: false, orientation: 'vertical', queuePosition: 0, queueLength: 0, playedCount: 0, pendingCount: 0 },
  { id: '4', name: 'Frame 4 - Lounge', playlist: 'Art', currentIndex: 0, skipVotes: 0, isOnline: true, orientation: 'vertical', queuePosition: 0, queueLength: 0, playedCount: 0, pendingCount: 0 },
]

const DEMO_QUEUE_SETTINGS: QueueSettings = {
  queueLimit: 10,
  imageDisplayTime: 30,
  videoLoopCount: 3
}

interface TrashRateLimit {
  used: number
  remaining: number
  resetsIn: number | null
}

interface LocalState {
  selectedFrameId: string | null
  selectedPlaylist: string | null
  userVotes: Map<string, 'up' | 'down'>
  queueItemVotes: Map<string, 'up' | 'down'> // itemId -> user's vote
  trashRateLimit: TrashRateLimit
  isLoading: boolean
  error: string | null
}

interface PhotoFrameContextValue extends PhotoFrameState, LocalState {
  // Frame actions
  selectFrame: (frameId: string | null) => void
  setFramePlaylist: (frameId: string, playlist: string) => Promise<void>
  voteSkipFrame: (frameId: string) => Promise<void>
  nextFrameMedia: (frameId: string) => Promise<void>
  previousFrameMedia: (frameId: string) => Promise<void>
  skipToNextQueueItem: (frameId: string) => Promise<void>

  // Playlist browsing
  selectPlaylist: (playlist: string | null) => void
  getPlaylistMedia: (playlist: string) => MediaItem[]
  getCurrentFrameMedia: (frameId: string) => MediaItem | null
  getCurrentQueueItem: (frameId: string) => QueueItem | null

  // Media management
  addMediaToLibrary: (item: MediaItem) => Promise<void>

  // Media voting
  upvoteMedia: (itemId: string) => Promise<void>
  downvoteMedia: (itemId: string) => Promise<void>
  getUserVote: (itemId: string) => 'up' | 'down' | null

  // Queue management
  addToQueue: (item: Omit<QueueItem, 'addedAt' | 'hasPlayed'>) => Promise<{ assigned: boolean; frameId?: string; reason?: string }>
  updateQueueSettings: (settings: Partial<QueueSettings>) => Promise<void>
  setFrameOrientation: (frameId: string, orientation: MediaOrientation) => Promise<void>
  redistributeHoldingTank: () => Promise<{ distributed: number; remaining: number }>
  removeFromHoldingTank: (itemId: string) => Promise<void>
  getAvailableOrientations: () => MediaOrientation[]

  // Queue item voting
  voteQueueItem: (frameId: string, itemId: string, vote: 'up' | 'down') => Promise<{ netVotes: number; markedForRemoval: boolean }>
  getQueueItemVote: (itemId: string) => 'up' | 'down' | null

  // Queue item trash with rate limiting
  trashQueueItem: (frameId: string, itemId: string) => Promise<{ success: boolean; warning?: string; error?: string }>
  refreshTrashRateLimit: () => Promise<void>

  // Permissions
  canControl: boolean
}

const PhotoFrameContext = createContext<PhotoFrameContextValue | null>(null)

export function PhotoFrameProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isMockMode } = useAuth()
  const { currentUserId, isCurrentUserPresent } = usePresence()

  const [haState, setHaState] = useState<PhotoFrameState>({
    frames: [],
    mediaLibrary: [],
    playlists: [],
    rotationInterval: 30,
    globalQueue: [],
    holdingTank: [],
    frameQueues: {},
    queueSettings: DEMO_QUEUE_SETTINGS
  })

  const [localState, setLocalState] = useState<LocalState>({
    selectedFrameId: null,
    selectedPlaylist: null,
    userVotes: new Map(),
    queueItemVotes: new Map(),
    trashRateLimit: { used: 0, remaining: 3, resetsIn: null },
    isLoading: false,
    error: null
  })

  // Subscribe to HA state changes
  useEffect(() => {
    if (!isAuthenticated) {
      setHaState({
        frames: [],
        mediaLibrary: [],
        playlists: [],
        rotationInterval: 30,
        globalQueue: [],
        holdingTank: [],
        frameQueues: {},
        queueSettings: DEMO_QUEUE_SETTINGS
      })
      setLocalState(prev => ({ ...prev, isLoading: false }))
      return
    }

    // Use backend API for queue management (works with or without HA)
    // This handles both mock mode and demo login scenarios
    {
      const fetchLocalState = async () => {
        try {
          const response = await fetch(`${BACKEND_URL}/api/queue`, {
            headers: getHeaders()
          })
          const data = await response.json()

          // Build frames from local API data
          const frames: PhotoFrame[] = ['1', '2', '3', '4'].map(id => ({
            id,
            name: `Frame ${id}`,
            playlist: 'Queue Mode',
            currentIndex: 0,
            skipVotes: 0,
            isOnline: true,
            orientation: (data.frameOrientations?.[id] || 'horizontal') as MediaOrientation,
            queuePosition: data.framePositions?.[id] || 0,
            queueLength: data.frameQueues?.[id]?.length || 0,
            playedCount: (data.frameQueues?.[id] || []).filter((item: QueueItem) => item.hasPlayed).length,
            pendingCount: (data.frameQueues?.[id] || []).filter((item: QueueItem) => !item.hasPlayed).length
          }))

          setHaState({
            frames,
            mediaLibrary: DEMO_MEDIA,
            playlists: ['Office Highlights', 'Team Photos', 'Nature', 'Art'],
            rotationInterval: 30,
            globalQueue: [],
            holdingTank: data.holdingTank || [],
            frameQueues: data.frameQueues || { '1': [], '2': [], '3': [], '4': [] },
            queueSettings: data.settings || DEMO_QUEUE_SETTINGS
          })
          setLocalState(prev => ({ ...prev, isLoading: false, error: null }))
        } catch (err) {
          console.error('[PhotoFrame] Failed to fetch from local API:', err)
          // Fallback to demo data
          setHaState({
            frames: DEMO_FRAMES,
            mediaLibrary: DEMO_MEDIA,
            playlists: ['Office Highlights', 'Team Photos', 'Nature', 'Art'],
            rotationInterval: 30,
            globalQueue: [],
            holdingTank: [],
            frameQueues: { '1': [], '2': [], '3': [], '4': [] },
            queueSettings: DEMO_QUEUE_SETTINGS
          })
          setLocalState(prev => ({ ...prev, isLoading: false, error: null }))
        }
      }

      fetchLocalState()

      // Poll for updates every 3 seconds
      const pollInterval = setInterval(fetchLocalState, 3000)
      return () => clearInterval(pollInterval)
    }
  }, [isAuthenticated])

  // Fetch trash rate limit on mount and periodically
  useEffect(() => {
    if (!currentUserId) return

    const fetchTrashLimit = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/queue/trash-limit/${currentUserId}`, {
          headers: getHeaders()
        })
        const result = await response.json()

        setLocalState(prev => ({
          ...prev,
          trashRateLimit: {
            used: result.used || 0,
            remaining: result.remaining ?? 3,
            resetsIn: result.resetsIn || null
          }
        }))
      } catch (err) {
        console.error('[PhotoFrame] Failed to fetch trash limit:', err)
      }
    }

    fetchTrashLimit()

    // Refresh every 30 seconds to update "resets in" countdown
    const interval = setInterval(fetchTrashLimit, 30000)
    return () => clearInterval(interval)
  }, [currentUserId, isMockMode])

  // Frame selection
  const selectFrame = useCallback((frameId: string | null) => {
    setLocalState(prev => ({ ...prev, selectedFrameId: frameId }))
  }, [])

  // Playlist selection
  const selectPlaylist = useCallback((playlist: string | null) => {
    setLocalState(prev => ({ ...prev, selectedPlaylist: playlist }))
  }, [])

  // Get media for a playlist
  const getPlaylistMedia = useCallback((playlist: string): MediaItem[] => {
    return haState.mediaLibrary
      .filter(item => item.playlist === playlist)
      .sort((a, b) => b.votes - a.votes)
  }, [haState.mediaLibrary])

  // Get current media for a frame (legacy playlist mode)
  const getCurrentFrameMedia = useCallback((frameId: string): MediaItem | null => {
    const frame = haState.frames.find(f => f.id === frameId)
    if (!frame) return null

    const playlistMedia = getPlaylistMedia(frame.playlist)
    if (playlistMedia.length === 0) return null

    const index = frame.currentIndex % playlistMedia.length
    return playlistMedia[index] || null
  }, [haState.frames, getPlaylistMedia])

  // Get current queue item for a frame
  const getCurrentQueueItem = useCallback((frameId: string): QueueItem | null => {
    const frame = haState.frames.find(f => f.id === frameId)
    const queue = haState.frameQueues[frameId] || []
    if (!frame || queue.length === 0) return null

    const position = frame.queuePosition % queue.length
    return queue[position] || null
  }, [haState.frames, haState.frameQueues])

  // Set frame playlist
  const setFramePlaylist = useCallback(async (frameId: string, playlist: string) => {
    if (!isCurrentUserPresent) return

    if (true) { // Always use backend API
      setHaState(prev => ({
        ...prev,
        frames: prev.frames.map(f =>
          f.id === frameId ? { ...f, playlist, currentIndex: 0 } : f
        )
      }))
      return
    }

    try {
      await photoFrameService.setFramePlaylist(frameId, playlist)
    } catch (err) {
      console.error('[PhotoFrame] Failed to set playlist:', err)
    }
  }, [isCurrentUserPresent, isMockMode])

  // Vote to skip frame media
  const voteSkipFrame = useCallback(async (frameId: string) => {
    if (!isCurrentUserPresent) return

    if (true) { // Always use backend API
      setHaState(prev => ({
        ...prev,
        frames: prev.frames.map(f =>
          f.id === frameId ? { ...f, skipVotes: f.skipVotes + 1 } : f
        )
      }))
      return
    }

    try {
      await photoFrameService.voteSkip(frameId)
    } catch (err) {
      console.error('[PhotoFrame] Failed to vote skip:', err)
    }
  }, [isCurrentUserPresent, isMockMode])

  // Next frame media
  const nextFrameMedia = useCallback(async (frameId: string) => {
    if (!isCurrentUserPresent) return

    if (true) { // Always use backend API
      setHaState(prev => ({
        ...prev,
        frames: prev.frames.map(f =>
          f.id === frameId ? { ...f, currentIndex: f.currentIndex + 1, skipVotes: 0 } : f
        )
      }))
      return
    }

    try {
      await photoFrameService.nextMedia(frameId)
    } catch (err) {
      console.error('[PhotoFrame] Failed to go to next:', err)
    }
  }, [isCurrentUserPresent, isMockMode])

  // Previous frame media
  const previousFrameMedia = useCallback(async (frameId: string) => {
    if (!isCurrentUserPresent) return

    if (true) { // Always use backend API
      setHaState(prev => ({
        ...prev,
        frames: prev.frames.map(f =>
          f.id === frameId ? { ...f, currentIndex: Math.max(0, f.currentIndex - 1), skipVotes: 0 } : f
        )
      }))
      return
    }

    try {
      await photoFrameService.previousMedia(frameId)
    } catch (err) {
      console.error('[PhotoFrame] Failed to go to previous:', err)
    }
  }, [isCurrentUserPresent, isMockMode])

  // Upvote media
  const upvoteMedia = useCallback(async (itemId: string) => {
    if (!currentUserId || !isCurrentUserPresent) return

    const currentVote = localState.userVotes.get(itemId)

    // Update local vote state
    setLocalState(prev => {
      const newVotes = new Map(prev.userVotes)
      if (currentVote === 'up') {
        newVotes.delete(itemId)
      } else {
        newVotes.set(itemId, 'up')
      }
      return { ...prev, userVotes: newVotes }
    })

    if (true) { // Always use backend API
      setHaState(prev => ({
        ...prev,
        mediaLibrary: prev.mediaLibrary.map(item => {
          if (item.id !== itemId) return item
          let delta = 1
          if (currentVote === 'up') delta = -1 // Remove upvote
          if (currentVote === 'down') delta = 2 // Remove downvote, add upvote
          return { ...item, votes: item.votes + delta }
        })
      }))
      return
    }

    try {
      await photoFrameService.upvoteMedia(itemId)
    } catch (err) {
      console.error('[PhotoFrame] Failed to upvote:', err)
    }
  }, [currentUserId, isCurrentUserPresent, localState.userVotes, isMockMode])

  // Downvote media
  const downvoteMedia = useCallback(async (itemId: string) => {
    if (!currentUserId || !isCurrentUserPresent) return

    const currentVote = localState.userVotes.get(itemId)

    // Update local vote state
    setLocalState(prev => {
      const newVotes = new Map(prev.userVotes)
      if (currentVote === 'down') {
        newVotes.delete(itemId)
      } else {
        newVotes.set(itemId, 'down')
      }
      return { ...prev, userVotes: newVotes }
    })

    if (true) { // Always use backend API
      setHaState(prev => ({
        ...prev,
        mediaLibrary: prev.mediaLibrary.map(item => {
          if (item.id !== itemId) return item
          let delta = -1
          if (currentVote === 'down') delta = 1 // Remove downvote
          if (currentVote === 'up') delta = -2 // Remove upvote, add downvote
          return { ...item, votes: item.votes + delta }
        })
      }))
      return
    }

    try {
      await photoFrameService.downvoteMedia(itemId)
    } catch (err) {
      console.error('[PhotoFrame] Failed to downvote:', err)
    }
  }, [currentUserId, isCurrentUserPresent, localState.userVotes, isMockMode])

  // Add media to library
  const addMediaToLibrary = useCallback(async (item: MediaItem) => {
    if (!isCurrentUserPresent) return

    if (true) { // Always use backend API
      setHaState(prev => {
        // Check if item already exists
        if (prev.mediaLibrary.some(m => m.id === item.id)) {
          return prev
        }
        // Add new playlist if it doesn't exist
        const playlists = prev.playlists.includes(item.playlist)
          ? prev.playlists
          : [...prev.playlists, item.playlist].sort()
        return {
          ...prev,
          mediaLibrary: [...prev.mediaLibrary, item],
          playlists
        }
      })
      return
    }

    try {
      // Get current library and add item
      const currentLibrary = haState.mediaLibrary
      if (currentLibrary.some(m => m.id === item.id)) {
        return // Already exists
      }
      await photoFrameService.updateMediaLibrary([...currentLibrary, item])
    } catch (err) {
      console.error('[PhotoFrame] Failed to add media:', err)
    }
  }, [isCurrentUserPresent, isMockMode, haState.mediaLibrary])

  // Get user's vote on a media item
  const getUserVote = useCallback((itemId: string): 'up' | 'down' | null => {
    return localState.userVotes.get(itemId) || null
  }, [localState.userVotes])

  // Add item to queue (routes to appropriate frame based on orientation)
  const addToQueue = useCallback(async (item: Omit<QueueItem, 'addedAt' | 'hasPlayed'>) => {
    if (!isCurrentUserPresent) {
      return { assigned: false, reason: 'User not scanned in' }
    }

    if (true) { // Always use backend API
      // Mock mode: use local queue API
      try {
        const response = await fetch(`${BACKEND_URL}/api/queue/add`, {
          method: 'POST',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(item)
        })
        const result = await response.json()

        // Also update local state for immediate UI feedback
        const queueItem: QueueItem = {
          ...item,
          addedAt: Date.now(),
          hasPlayed: false
        }

        if (result.assigned) {
          setHaState(prev => ({
            ...prev,
            globalQueue: [...prev.globalQueue, queueItem],
            frameQueues: {
              ...prev.frameQueues,
              [result.frameId]: [...(prev.frameQueues[result.frameId] || []), queueItem]
            }
          }))
        } else {
          setHaState(prev => ({
            ...prev,
            holdingTank: [...prev.holdingTank, queueItem]
          }))
        }

        return result
      } catch (err) {
        console.error('[PhotoFrame] Failed to add to local queue API:', err)
        return { assigned: false, reason: 'Failed to connect to queue service' }
      }
    }

    try {
      return await photoFrameService.addToQueue(item)
    } catch (err) {
      console.error('[PhotoFrame] Failed to add to queue:', err)
      return { assigned: false, reason: 'Failed to add to queue' }
    }
  }, [isCurrentUserPresent, isMockMode])

  // Update queue settings
  const updateQueueSettings = useCallback(async (settings: Partial<QueueSettings>) => {
    if (!isCurrentUserPresent) return

    if (true) { // Always use backend API
      try {
        await fetch(`${BACKEND_URL}/api/queue/settings`, {
          method: 'PUT',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(settings)
        })
        // Local state will be updated by polling
      } catch (err) {
        console.error('[PhotoFrame] Failed to update settings via local API:', err)
      }
      return
    }

    try {
      await photoFrameService.updateQueueSettings(settings)
    } catch (err) {
      console.error('[PhotoFrame] Failed to update queue settings:', err)
    }
  }, [isCurrentUserPresent, isMockMode])

  // Set frame orientation
  const setFrameOrientation = useCallback(async (frameId: string, orientation: MediaOrientation) => {
    if (!isCurrentUserPresent) return

    if (true) { // Always use backend API
      try {
        await fetch(`${BACKEND_URL}/api/queue/frame/${frameId}/orientation`, {
          method: 'PUT',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ orientation })
        })
        // Local state will be updated by polling
      } catch (err) {
        console.error('[PhotoFrame] Failed to set orientation via local API:', err)
      }
      return
    }

    try {
      await photoFrameService.setFrameOrientation(frameId, orientation)
    } catch (err) {
      console.error('[PhotoFrame] Failed to set frame orientation:', err)
    }
  }, [isCurrentUserPresent, isMockMode])

  // Redistribute holding tank
  const redistributeHoldingTank = useCallback(async () => {
    if (!isCurrentUserPresent) {
      return { distributed: 0, remaining: haState.holdingTank.length }
    }

    if (true) { // Always use backend API
      // In mock mode, redistribute is handled by re-adding items
      // For now, just return current state - polling will update
      return { distributed: 0, remaining: haState.holdingTank.length }
    }

    try {
      return await photoFrameService.redistributeHoldingTank()
    } catch (err) {
      console.error('[PhotoFrame] Failed to redistribute holding tank:', err)
      return { distributed: 0, remaining: haState.holdingTank.length }
    }
  }, [isCurrentUserPresent, isMockMode, haState.holdingTank])

  // Remove from holding tank
  const removeFromHoldingTank = useCallback(async (itemId: string) => {
    if (!isCurrentUserPresent) return

    if (true) { // Always use backend API
      try {
        await fetch(`${BACKEND_URL}/api/queue/holding-tank/${itemId}`, {
          method: 'DELETE',
          headers: getHeaders()
        })
        // Local state will be updated by polling
      } catch (err) {
        console.error('[PhotoFrame] Failed to remove from holding tank via local API:', err)
      }
      return
    }

    try {
      await photoFrameService.removeFromHoldingTank(itemId)
    } catch (err) {
      console.error('[PhotoFrame] Failed to remove from holding tank:', err)
    }
  }, [isCurrentUserPresent, isMockMode])

  // Skip to next queue item (for vote-to-skip)
  const skipToNextQueueItem = useCallback(async (frameId: string) => {
    if (!isCurrentUserPresent) return

    const queue = haState.frameQueues[frameId] || []
    if (queue.length === 0) return

    const frame = haState.frames.find(f => f.id === frameId)
    if (!frame) return

    const newPosition = (frame.queuePosition + 1) % queue.length

    if (true) { // Always use backend API
      try {
        await fetch(`${BACKEND_URL}/api/queue/frame/${frameId}`, {
          method: 'PUT',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ position: newPosition })
        })
      } catch (err) {
        console.error('[PhotoFrame] Failed to skip via local API:', err)
      }
      return
    }

    // For HA mode, update the position entity via service call
    try {
      // TODO: Add proper method to photoFrameService for updating queue position
      console.log(`[PhotoFrame] Would update position to ${newPosition} for frame ${frameId}`)
    } catch (err) {
      console.error('[PhotoFrame] Failed to skip queue item:', err)
    }
  }, [isCurrentUserPresent, isMockMode, haState.frameQueues, haState.frames])

  // Get available orientations
  const getAvailableOrientations = useCallback((): MediaOrientation[] => {
    return photoFrameService.getAvailableOrientations(haState.frames)
  }, [haState.frames])

  // Vote on a queue item
  const voteQueueItem = useCallback(async (frameId: string, itemId: string, vote: 'up' | 'down') => {
    if (!currentUserId || !isCurrentUserPresent) {
      return { netVotes: 0, markedForRemoval: false }
    }

    // Check if user already voted the same way (toggle off)
    const existingVote = localState.queueItemVotes.get(itemId)
    const isTogglingOff = existingVote === vote

    if (true) { // Always use backend API
      try {
        let response
        if (isTogglingOff) {
          // Remove the vote entirely
          response = await fetch(`${BACKEND_URL}/api/queue/vote`, {
            method: 'DELETE',
            headers: getHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              frameId,
              itemId,
              voterId: currentUserId
            })
          })
        } else {
          // Add or change vote
          response = await fetch(`${BACKEND_URL}/api/queue/vote`, {
            method: 'POST',
            headers: getHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              frameId,
              itemId,
              voterId: currentUserId,
              vote
            })
          })
        }
        const result = await response.json()

        // Update local vote state
        setLocalState(prev => {
          const newVotes = new Map(prev.queueItemVotes)
          if (isTogglingOff) {
            newVotes.delete(itemId)
          } else {
            newVotes.set(itemId, vote)
          }
          return { ...prev, queueItemVotes: newVotes }
        })

        return { netVotes: result.netVotes || 0, markedForRemoval: result.markedForRemoval || false }
      } catch (err) {
        console.error('[PhotoFrame] Failed to vote:', err)
        return { netVotes: 0, markedForRemoval: false }
      }
    }

    // For HA mode - TODO: implement
    return { netVotes: 0, markedForRemoval: false }
  }, [currentUserId, isCurrentUserPresent, isMockMode, localState.queueItemVotes])

  // Get user's vote on a queue item
  const getQueueItemVote = useCallback((itemId: string): 'up' | 'down' | null => {
    return localState.queueItemVotes.get(itemId) || null
  }, [localState.queueItemVotes])

  // Trash a queue item with rate limiting
  const trashQueueItem = useCallback(async (frameId: string, itemId: string) => {
    if (!currentUserId || !isCurrentUserPresent) {
      return { success: false, error: 'Not signed in' }
    }

    if (true) { // Always use backend API
      try {
        const response = await fetch(`${BACKEND_URL}/api/queue/trash`, {
          method: 'POST',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            frameId,
            itemId,
            userId: currentUserId
          })
        })

        if (response.status === 429) {
          const errorData = await response.json()
          return { success: false, error: errorData.message }
        }

        const result = await response.json()

        // Update local trash rate limit
        setLocalState(prev => ({
          ...prev,
          trashRateLimit: {
            used: 3 - (result.trashesRemaining || 0),
            remaining: result.trashesRemaining || 0,
            resetsIn: null
          }
        }))

        return { success: true, warning: result.warning }
      } catch (err) {
        console.error('[PhotoFrame] Failed to trash:', err)
        return { success: false, error: 'Failed to remove item' }
      }
    }

    // For HA mode - TODO: implement
    return { success: false, error: 'Not implemented' }
  }, [currentUserId, isCurrentUserPresent, isMockMode])

  // Refresh trash rate limit
  const refreshTrashRateLimit = useCallback(async () => {
    if (!currentUserId) return

    if (true) { // Always use backend API
      try {
        const response = await fetch(`${BACKEND_URL}/api/queue/trash-limit/${currentUserId}`, {
          headers: getHeaders()
        })
        const result = await response.json()

        setLocalState(prev => ({
          ...prev,
          trashRateLimit: {
            used: result.used || 0,
            remaining: result.remaining || 3,
            resetsIn: result.resetsIn
          }
        }))
      } catch (err) {
        console.error('[PhotoFrame] Failed to refresh trash limit:', err)
      }
    }
  }, [currentUserId, isMockMode])

  const canControl = isCurrentUserPresent

  return (
    <PhotoFrameContext.Provider
      value={{
        ...haState,
        ...localState,
        selectFrame,
        setFramePlaylist,
        voteSkipFrame,
        nextFrameMedia,
        previousFrameMedia,
        selectPlaylist,
        getPlaylistMedia,
        getCurrentFrameMedia,
        getCurrentQueueItem,
        skipToNextQueueItem,
        addMediaToLibrary,
        upvoteMedia,
        downvoteMedia,
        getUserVote,
        addToQueue,
        updateQueueSettings,
        setFrameOrientation,
        redistributeHoldingTank,
        removeFromHoldingTank,
        getAvailableOrientations,
        voteQueueItem,
        getQueueItemVote,
        trashQueueItem,
        refreshTrashRateLimit,
        canControl
      }}
    >
      {children}
    </PhotoFrameContext.Provider>
  )
}

export function usePhotoFrames() {
  const context = useContext(PhotoFrameContext)
  if (!context) {
    throw new Error('usePhotoFrames must be used within PhotoFrameProvider')
  }
  return context
}

// Re-export types
export type { PhotoFrame, MediaItem, PhotoFrameState, QueueItem, QueueSettings, MediaOrientation }
