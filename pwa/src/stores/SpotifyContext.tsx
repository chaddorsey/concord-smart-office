import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { spotifyService, type SpotifyPlaybackState } from '../services/spotifyService'
import { MOCK_SPOTIFY_TRACKS } from '../services/mockData'
import { useAuth } from './AuthContext'
import { usePresence } from './PresenceContext'

// Voting thresholds
const SKIP_VOTE_THRESHOLD = 0.5 // 50% of present users must vote to skip

interface SkipVoteState {
  trackUri: string
  voters: Set<string>
  timestamp: number
}

interface SpotifyState {
  playback: SpotifyPlaybackState | null
  isLoading: boolean
  error: string | null
  skipVotes: SkipVoteState | null
  hasVotedToSkip: boolean
  skipVoteCount: number
  skipVotesNeeded: number
}

interface SpotifyContextValue extends SpotifyState {
  play: () => Promise<void>
  pause: () => Promise<void>
  nextTrack: () => Promise<void>
  previousTrack: () => Promise<void>
  setVolume: (volume: number) => Promise<void>
  voteToSkip: () => void
  canControl: boolean
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null)

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isMockMode } = useAuth()
  const { currentUserId, isCurrentUserPresent, presentCount } = usePresence()
  const mockTrackIndexRef = useRef(0)
  const mockProgressRef = useRef(0)

  const [state, setState] = useState<SpotifyState>({
    playback: null,
    isLoading: false,
    error: null,
    skipVotes: null,
    hasVotedToSkip: false,
    skipVoteCount: 0,
    skipVotesNeeded: 1
  })

  // Create mock playback state
  const createMockPlayback = useCallback((trackIndex: number, isPlaying: boolean = true): SpotifyPlaybackState => {
    const track = MOCK_SPOTIFY_TRACKS[trackIndex % MOCK_SPOTIFY_TRACKS.length]
    return {
      isPlaying,
      track: {
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArt: track.albumArt,
        duration: track.duration,
        position: mockProgressRef.current,
        uri: `spotify:track:mock${trackIndex}`
      },
      volume: 75,
      shuffle: false,
      repeat: 'off',
      source: 'Mock Player',
      deviceName: 'Demo Device'
    }
  }, [])

  // Calculate votes needed based on present users
  const votesNeeded = Math.max(1, Math.ceil(presentCount * SKIP_VOTE_THRESHOLD))

  // Subscribe to playback changes when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setState(prev => ({
        ...prev,
        playback: null,
        isLoading: false,
        skipVotes: null
      }))
      return
    }

    // Use mock playback in mock mode
    if (isMockMode) {
      mockProgressRef.current = 45000 // Start at 45 seconds
      setState(prev => ({
        ...prev,
        playback: createMockPlayback(mockTrackIndexRef.current),
        isLoading: false,
        error: null
      }))

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        mockProgressRef.current += 1000
        const track = MOCK_SPOTIFY_TRACKS[mockTrackIndexRef.current % MOCK_SPOTIFY_TRACKS.length]
        if (mockProgressRef.current >= track.duration) {
          // Track ended, go to next
          mockTrackIndexRef.current++
          mockProgressRef.current = 0
          setState(prev => ({
            ...prev,
            playback: createMockPlayback(mockTrackIndexRef.current),
            skipVotes: null,
            hasVotedToSkip: false,
            skipVoteCount: 0
          }))
        } else {
          setState(prev => prev.playback?.track ? {
            ...prev,
            playback: {
              ...prev.playback,
              track: { ...prev.playback.track, position: mockProgressRef.current }
            }
          } : prev)
        }
      }, 1000)

      return () => clearInterval(progressInterval)
    }

    setState(prev => ({ ...prev, isLoading: true }))

    let unsubscribe: (() => void) | null = null

    spotifyService
      .subscribeToPlaybackChanges((playback) => {
        setState(prev => {
          // Reset skip votes if track changed
          const trackChanged = playback?.track?.uri !== prev.playback?.track?.uri

          return {
            ...prev,
            playback,
            isLoading: false,
            error: null,
            // Reset votes on track change
            skipVotes: trackChanged ? null : prev.skipVotes,
            hasVotedToSkip: trackChanged ? false : prev.hasVotedToSkip,
            skipVoteCount: trackChanged ? 0 : prev.skipVoteCount
          }
        })
      })
      .then((unsub) => {
        unsubscribe = unsub
      })
      .catch((err) => {
        console.error('[Spotify] Failed to subscribe:', err)
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to connect to Spotify'
        }))
      })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [isAuthenticated, isMockMode, createMockPlayback])

  // Update votes needed when present count changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      skipVotesNeeded: votesNeeded
    }))
  }, [votesNeeded])

  // Check if skip threshold is met and auto-skip
  useEffect(() => {
    if (state.skipVoteCount >= state.skipVotesNeeded && state.playback?.track) {
      if (isMockMode) {
        // Mock auto-skip
        mockTrackIndexRef.current++
        mockProgressRef.current = 0
        setState(prev => ({
          ...prev,
          playback: createMockPlayback(mockTrackIndexRef.current),
          skipVotes: null,
          hasVotedToSkip: false,
          skipVoteCount: 0
        }))
      } else {
        // Threshold met, skip the track
        spotifyService.nextTrack().catch(err => {
          console.error('[Spotify] Auto-skip failed:', err)
        })
      }
    }
  }, [state.skipVoteCount, state.skipVotesNeeded, state.playback?.track, isMockMode, createMockPlayback])

  const play = useCallback(async () => {
    if (isMockMode) {
      setState(prev => prev.playback ? {
        ...prev,
        playback: { ...prev.playback, isPlaying: true }
      } : prev)
      return
    }
    try {
      await spotifyService.play()
    } catch (err) {
      console.error('[Spotify] Play failed:', err)
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to play'
      }))
    }
  }, [isMockMode])

  const pause = useCallback(async () => {
    if (isMockMode) {
      setState(prev => prev.playback ? {
        ...prev,
        playback: { ...prev.playback, isPlaying: false }
      } : prev)
      return
    }
    try {
      await spotifyService.pause()
    } catch (err) {
      console.error('[Spotify] Pause failed:', err)
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to pause'
      }))
    }
  }, [isMockMode])

  const nextTrack = useCallback(async () => {
    if (isMockMode) {
      mockTrackIndexRef.current++
      mockProgressRef.current = 0
      setState(prev => ({
        ...prev,
        playback: createMockPlayback(mockTrackIndexRef.current),
        skipVotes: null,
        hasVotedToSkip: false,
        skipVoteCount: 0
      }))
      return
    }
    try {
      await spotifyService.nextTrack()
    } catch (err) {
      console.error('[Spotify] Next track failed:', err)
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to skip track'
      }))
    }
  }, [isMockMode, createMockPlayback])

  const previousTrack = useCallback(async () => {
    if (isMockMode) {
      mockTrackIndexRef.current = Math.max(0, mockTrackIndexRef.current - 1)
      mockProgressRef.current = 0
      setState(prev => ({
        ...prev,
        playback: createMockPlayback(mockTrackIndexRef.current),
        skipVotes: null,
        hasVotedToSkip: false,
        skipVoteCount: 0
      }))
      return
    }
    try {
      await spotifyService.previousTrack()
    } catch (err) {
      console.error('[Spotify] Previous track failed:', err)
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to go to previous track'
      }))
    }
  }, [isMockMode, createMockPlayback])

  const setVolume = useCallback(async (volume: number) => {
    if (isMockMode) {
      setState(prev => prev.playback ? {
        ...prev,
        playback: { ...prev.playback, volume }
      } : prev)
      return
    }
    try {
      await spotifyService.setVolume(volume)
    } catch (err) {
      console.error('[Spotify] Set volume failed:', err)
    }
  }, [isMockMode])

  const voteToSkip = useCallback(() => {
    if (!currentUserId || !isCurrentUserPresent || !state.playback?.track) {
      return
    }

    setState(prev => {
      // Already voted
      if (prev.hasVotedToSkip) {
        return prev
      }

      const currentTrackUri = prev.playback?.track?.uri || ''
      const existingVotes = prev.skipVotes?.trackUri === currentTrackUri
        ? prev.skipVotes
        : { trackUri: currentTrackUri, voters: new Set<string>(), timestamp: Date.now() }

      existingVotes.voters.add(currentUserId)

      return {
        ...prev,
        skipVotes: existingVotes,
        hasVotedToSkip: true,
        skipVoteCount: existingVotes.voters.size
      }
    })
  }, [currentUserId, isCurrentUserPresent, state.playback?.track])

  // Users can only control if they are scanned in
  const canControl = isCurrentUserPresent

  return (
    <SpotifyContext.Provider
      value={{
        ...state,
        skipVotesNeeded: votesNeeded,
        play,
        pause,
        nextTrack,
        previousTrack,
        setVolume,
        voteToSkip,
        canControl
      }}
    >
      {children}
    </SpotifyContext.Provider>
  )
}

export function useSpotify() {
  const context = useContext(SpotifyContext)
  if (!context) {
    throw new Error('useSpotify must be used within SpotifyProvider')
  }
  return context
}
