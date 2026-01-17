import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { photoFrameService, type PhotoFrame, type MediaItem, type PhotoFrameState } from '../services/photoFrameService'
import { useAuth } from './AuthContext'
import { usePresence } from './PresenceContext'

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
  { id: '1', name: 'Frame 1 - Lobby', playlist: 'Office Highlights', currentIndex: 0, skipVotes: 0, isOnline: true },
  { id: '2', name: 'Frame 2 - Kitchen', playlist: 'Team Photos', currentIndex: 0, skipVotes: 0, isOnline: true },
  { id: '3', name: 'Frame 3 - Meeting Room', playlist: 'Nature', currentIndex: 0, skipVotes: 0, isOnline: false },
  { id: '4', name: 'Frame 4 - Lounge', playlist: 'Art', currentIndex: 0, skipVotes: 0, isOnline: true },
]

interface LocalState {
  selectedFrameId: string | null
  selectedPlaylist: string | null
  userVotes: Map<string, 'up' | 'down'>
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

  // Playlist browsing
  selectPlaylist: (playlist: string | null) => void
  getPlaylistMedia: (playlist: string) => MediaItem[]
  getCurrentFrameMedia: (frameId: string) => MediaItem | null

  // Media voting
  upvoteMedia: (itemId: string) => Promise<void>
  downvoteMedia: (itemId: string) => Promise<void>
  getUserVote: (itemId: string) => 'up' | 'down' | null

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
    rotationInterval: 30
  })

  const [localState, setLocalState] = useState<LocalState>({
    selectedFrameId: null,
    selectedPlaylist: null,
    userVotes: new Map(),
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
        rotationInterval: 30
      })
      setLocalState(prev => ({ ...prev, isLoading: false }))
      return
    }

    // Use mock data in mock mode
    if (isMockMode) {
      setHaState({
        frames: DEMO_FRAMES,
        mediaLibrary: DEMO_MEDIA,
        playlists: ['Office Highlights', 'Team Photos', 'Nature', 'Art'],
        rotationInterval: 30
      })
      setLocalState(prev => ({ ...prev, isLoading: false, error: null }))
      return
    }

    setLocalState(prev => ({ ...prev, isLoading: true }))

    let unsubscribe: (() => void) | null = null

    photoFrameService
      .subscribeToChanges((state) => {
        setHaState(state)
        setLocalState(prev => ({ ...prev, isLoading: false, error: null }))
      })
      .then((unsub) => {
        unsubscribe = unsub
      })
      .catch((err) => {
        console.error('[PhotoFrame] Failed to subscribe:', err)
        setLocalState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to connect'
        }))
      })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [isAuthenticated, isMockMode])

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

  // Get current media for a frame
  const getCurrentFrameMedia = useCallback((frameId: string): MediaItem | null => {
    const frame = haState.frames.find(f => f.id === frameId)
    if (!frame) return null

    const playlistMedia = getPlaylistMedia(frame.playlist)
    if (playlistMedia.length === 0) return null

    const index = frame.currentIndex % playlistMedia.length
    return playlistMedia[index] || null
  }, [haState.frames, getPlaylistMedia])

  // Set frame playlist
  const setFramePlaylist = useCallback(async (frameId: string, playlist: string) => {
    if (!isCurrentUserPresent) return

    if (isMockMode) {
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

    if (isMockMode) {
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

    if (isMockMode) {
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

    if (isMockMode) {
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

    if (isMockMode) {
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

    if (isMockMode) {
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

  // Get user's vote on a media item
  const getUserVote = useCallback((itemId: string): 'up' | 'down' | null => {
    return localState.userVotes.get(itemId) || null
  }, [localState.userVotes])

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
        upvoteMedia,
        downvoteMedia,
        getUserVote,
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
export type { PhotoFrame, MediaItem, PhotoFrameState }
