import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { photoFrameService, type PhotoFrame } from '../services/photoFrameService'
import { MOCK_PHOTO_FRAMES } from '../services/mockData'
import { useAuth } from './AuthContext'
import { usePresence } from './PresenceContext'

// Demo images for the playlist (in production, these would come from HA)
const DEMO_PLAYLIST: PlaylistImage[] = [
  { id: '1', url: '/images/office-1.jpg', title: 'Team Building 2024', addedBy: 'Alice', addedAt: '2024-01-15' },
  { id: '2', url: '/images/office-2.jpg', title: 'Product Launch', addedBy: 'Bob', addedAt: '2024-01-10' },
  { id: '3', url: '/images/office-3.jpg', title: 'Holiday Party', addedBy: 'Carol', addedAt: '2024-01-05' },
  { id: '4', url: '/images/nature-1.jpg', title: 'Mountain View', addedBy: 'Dave', addedAt: '2024-01-01' },
  { id: '5', url: '/images/nature-2.jpg', title: 'Ocean Sunset', addedBy: 'Eve', addedAt: '2023-12-20' },
  { id: '6', url: '/images/art-1.jpg', title: 'Abstract Art', addedBy: 'Frank', addedAt: '2023-12-15' },
]

export interface PlaylistImage {
  id: string
  url: string
  title: string
  addedBy: string
  addedAt: string
}

interface ImageVotes {
  upvoters: Set<string>
  downvoters: Set<string>
}

interface PhotoFrameState {
  frames: PhotoFrame[]
  playlist: PlaylistImage[]
  votes: Map<string, ImageVotes>
  userVotes: Map<string, 'up' | 'down'>
  currentImageIndex: number
  isLoading: boolean
  error: string | null
}

interface PhotoFrameContextValue extends PhotoFrameState {
  upvote: (imageId: string) => void
  downvote: (imageId: string) => void
  clearVote: (imageId: string) => void
  getImageScore: (imageId: string) => number
  getUserVote: (imageId: string) => 'up' | 'down' | null
  nextImage: () => void
  previousImage: () => void
  goToImage: (index: number) => void
  canControl: boolean
}

const PhotoFrameContext = createContext<PhotoFrameContextValue | null>(null)

export function PhotoFrameProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isMockMode } = useAuth()
  const { currentUserId, isCurrentUserPresent } = usePresence()

  const [state, setState] = useState<PhotoFrameState>({
    frames: [],
    playlist: DEMO_PLAYLIST,
    votes: new Map(),
    userVotes: new Map(),
    currentImageIndex: 0,
    isLoading: false,
    error: null
  })

  // Subscribe to frame state changes
  useEffect(() => {
    if (!isAuthenticated) {
      setState(prev => ({
        ...prev,
        frames: [],
        isLoading: false
      }))
      return
    }

    // Use mock frame data in mock mode
    if (isMockMode) {
      const mockFrames: PhotoFrame[] = MOCK_PHOTO_FRAMES.map(f => ({
        ...f,
        currentImage: null
      }))
      setState(prev => ({
        ...prev,
        frames: mockFrames,
        isLoading: false,
        error: null
      }))
      return
    }

    setState(prev => ({ ...prev, isLoading: true }))

    let unsubscribe: (() => void) | null = null

    photoFrameService
      .subscribeToChanges((frames) => {
        setState(prev => ({
          ...prev,
          frames,
          isLoading: false,
          error: null
        }))
      })
      .then((unsub) => {
        unsubscribe = unsub
      })
      .catch((err) => {
        console.error('[PhotoFrame] Failed to subscribe:', err)
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to connect to photo frames'
        }))
      })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [isAuthenticated, isMockMode])

  const upvote = useCallback((imageId: string) => {
    if (!currentUserId || !isCurrentUserPresent) return

    setState(prev => {
      const newVotes = new Map(prev.votes)
      const newUserVotes = new Map(prev.userVotes)

      // Get or create image votes
      let imageVotes = newVotes.get(imageId)
      if (!imageVotes) {
        imageVotes = { upvoters: new Set(), downvoters: new Set() }
        newVotes.set(imageId, imageVotes)
      }

      // Remove from downvoters if present
      imageVotes.downvoters.delete(currentUserId)

      // Toggle upvote
      if (imageVotes.upvoters.has(currentUserId)) {
        imageVotes.upvoters.delete(currentUserId)
        newUserVotes.delete(imageId)
      } else {
        imageVotes.upvoters.add(currentUserId)
        newUserVotes.set(imageId, 'up')
      }

      return {
        ...prev,
        votes: newVotes,
        userVotes: newUserVotes
      }
    })
  }, [currentUserId, isCurrentUserPresent])

  const downvote = useCallback((imageId: string) => {
    if (!currentUserId || !isCurrentUserPresent) return

    setState(prev => {
      const newVotes = new Map(prev.votes)
      const newUserVotes = new Map(prev.userVotes)

      // Get or create image votes
      let imageVotes = newVotes.get(imageId)
      if (!imageVotes) {
        imageVotes = { upvoters: new Set(), downvoters: new Set() }
        newVotes.set(imageId, imageVotes)
      }

      // Remove from upvoters if present
      imageVotes.upvoters.delete(currentUserId)

      // Toggle downvote
      if (imageVotes.downvoters.has(currentUserId)) {
        imageVotes.downvoters.delete(currentUserId)
        newUserVotes.delete(imageId)
      } else {
        imageVotes.downvoters.add(currentUserId)
        newUserVotes.set(imageId, 'down')
      }

      return {
        ...prev,
        votes: newVotes,
        userVotes: newUserVotes
      }
    })
  }, [currentUserId, isCurrentUserPresent])

  const clearVote = useCallback((imageId: string) => {
    if (!currentUserId) return

    setState(prev => {
      const newVotes = new Map(prev.votes)
      const newUserVotes = new Map(prev.userVotes)

      const imageVotes = newVotes.get(imageId)
      if (imageVotes) {
        imageVotes.upvoters.delete(currentUserId)
        imageVotes.downvoters.delete(currentUserId)
      }
      newUserVotes.delete(imageId)

      return {
        ...prev,
        votes: newVotes,
        userVotes: newUserVotes
      }
    })
  }, [currentUserId])

  const getImageScore = useCallback((imageId: string): number => {
    const imageVotes = state.votes.get(imageId)
    if (!imageVotes) return 0
    return imageVotes.upvoters.size - imageVotes.downvoters.size
  }, [state.votes])

  const getUserVote = useCallback((imageId: string): 'up' | 'down' | null => {
    return state.userVotes.get(imageId) || null
  }, [state.userVotes])

  const nextImage = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentImageIndex: (prev.currentImageIndex + 1) % prev.playlist.length
    }))
  }, [])

  const previousImage = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentImageIndex: prev.currentImageIndex === 0
        ? prev.playlist.length - 1
        : prev.currentImageIndex - 1
    }))
  }, [])

  const goToImage = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      currentImageIndex: Math.max(0, Math.min(index, prev.playlist.length - 1))
    }))
  }, [])

  const canControl = isCurrentUserPresent

  return (
    <PhotoFrameContext.Provider
      value={{
        ...state,
        upvote,
        downvote,
        clearVote,
        getImageScore,
        getUserVote,
        nextImage,
        previousImage,
        goToImage,
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
