/**
 * Music Control Context
 * Manages taste preferences, submissions, voting, and playback via backend API
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { usePresence } from './PresenceContext'

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || ''

// Types
interface Taste {
  id: string
  name: string
  description: string
}

interface Submission {
  id: number
  track_url: string
  title: string | null
  artist: string | null
  thumbnail: string | null
  submitted_by_name: string
  submitted_by_user_id: number
  upvotes: number
  downvotes: number
  user_vote: number | null
  created_at: string
}

interface NowPlaying {
  track_url: string
  title: string | null
  artist: string | null
  thumbnail: string | null
  source: 'submission' | 'taste'
  taste_id: string | null
  started_at: string
}

interface UpcomingTrack {
  source: 'submission' | 'taste'
  track_url: string
  title: string | null
  artist: string | null
  thumbnail?: string | null
  taste_id?: string
  submitted_by?: string
  upvotes?: number
  downvotes?: number
  preview?: boolean
}

interface TrashRateLimit {
  remaining: number
  resetsIn: number | null
}

interface SchedulerStatus {
  running: boolean
  paused: boolean
  connected: boolean
  sonosEntity: string | null
  currentPlayId: number | null
}

interface MusicStats {
  scheduler_running: boolean
  scheduler_paused: boolean
  queue_length: number
  recent_plays: number
  submissions_played: number
  taste_distribution: Record<string, number>
  current_weights: Record<string, number>
  current_volume: string
}

type VolumeLevel = 'super_quiet' | 'soft' | 'medium'

interface MusicState {
  tastes: Taste[]
  userTastes: string[]
  userVolume: VolumeLevel
  queue: Submission[]
  nowPlaying: NowPlaying | null
  upcoming: UpcomingTrack[]
  schedulerStatus: SchedulerStatus | null
  stats: MusicStats | null
  trashRateLimit: TrashRateLimit
  isLoading: boolean
  error: string | null
}

interface MusicContextValue extends MusicState {
  // Taste preferences
  setUserTastes: (tasteIds: string[]) => Promise<void>
  setUserVolume: (volume: VolumeLevel) => Promise<void>

  // Submissions
  submitTrack: (trackUrl: string, title?: string, artist?: string) => Promise<void>
  removeSubmission: (submissionId: number) => Promise<void>
  trashSubmission: (submissionId: number) => Promise<{ success?: boolean; error?: string; warning?: string }>

  // Voting
  vote: (submissionId: number, value: -1 | 0 | 1) => Promise<void>

  // Scheduler control (requires auth)
  skipTrack: () => Promise<void>
  pauseScheduler: () => Promise<void>
  resumeScheduler: () => Promise<void>

  // Refresh data
  refresh: () => Promise<void>

  // Control permission
  canControl: boolean
}

const MusicContext = createContext<MusicContextValue | null>(null)

export function MusicProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const { isCurrentUserPresent } = usePresence()

  // Trash rate limiting - 3 trashes per 15 minutes
  const TRASH_LIMIT = 3
  const TRASH_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
  const [trashTimestamps, setTrashTimestamps] = useState<number[]>([])

  // Calculate current trash rate limit
  const getTrashRateLimit = (): TrashRateLimit => {
    const now = Date.now()
    const windowStart = now - TRASH_WINDOW_MS
    const recentTrashes = trashTimestamps.filter(ts => ts > windowStart)
    const remaining = Math.max(0, TRASH_LIMIT - recentTrashes.length)

    let resetsIn: number | null = null
    if (remaining === 0 && recentTrashes.length > 0) {
      const oldestInWindow = Math.min(...recentTrashes)
      resetsIn = Math.ceil((oldestInWindow + TRASH_WINDOW_MS - now) / 60000)
    }

    return { remaining, resetsIn }
  }

  const [state, setState] = useState<MusicState>({
    tastes: [],
    userTastes: [],
    userVolume: 'medium',
    queue: [],
    nowPlaying: null,
    upcoming: [],
    schedulerStatus: null,
    stats: null,
    trashRateLimit: { remaining: TRASH_LIMIT, resetsIn: null },
    isLoading: false,
    error: null
  })

  // Update trash rate limit in state when timestamps change
  useEffect(() => {
    setState(prev => ({ ...prev, trashRateLimit: getTrashRateLimit() }))
  }, [trashTimestamps])

  // Fetch helper with error handling
  const fetchApi = useCallback(async (endpoint: string, options?: RequestInit) => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      }
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Request failed: ${response.status}`)
    }

    return response.json()
  }, [])

  // Load tastes list (public)
  const loadTastes = useCallback(async () => {
    try {
      const tastes = await fetchApi('/api/music/tastes')
      setState(prev => ({ ...prev, tastes }))
    } catch (err) {
      console.error('[Music] Failed to load tastes:', err)
    }
  }, [fetchApi])

  // Load user preferences (requires auth)
  const loadUserPreferences = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      const preferences = await fetchApi('/api/me/tastes')
      setState(prev => ({
        ...prev,
        userTastes: preferences.tastes || [],
        userVolume: preferences.volume || 'medium'
      }))
    } catch (err) {
      console.error('[Music] Failed to load user preferences:', err)
    }
  }, [isAuthenticated, fetchApi])

  // Load queue
  const loadQueue = useCallback(async () => {
    try {
      const queue = await fetchApi('/api/music/queue')
      setState(prev => ({ ...prev, queue }))
    } catch (err) {
      console.error('[Music] Failed to load queue:', err)
    }
  }, [fetchApi])

  // Load now playing
  const loadNowPlaying = useCallback(async () => {
    try {
      const data = await fetchApi('/api/music/now-playing')
      setState(prev => ({
        ...prev,
        nowPlaying: data.playing === false ? null : data
      }))
    } catch (err) {
      console.error('[Music] Failed to load now playing:', err)
    }
  }, [fetchApi])

  // Load upcoming
  const loadUpcoming = useCallback(async () => {
    try {
      const upcoming = await fetchApi('/api/music/upcoming?k=10')
      setState(prev => ({ ...prev, upcoming }))
    } catch (err) {
      console.error('[Music] Failed to load upcoming:', err)
    }
  }, [fetchApi])

  // Load scheduler status
  const loadSchedulerStatus = useCallback(async () => {
    try {
      const status = await fetchApi('/api/music/scheduler/status')
      setState(prev => ({ ...prev, schedulerStatus: status }))
    } catch (err) {
      console.error('[Music] Failed to load scheduler status:', err)
    }
  }, [fetchApi])

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const stats = await fetchApi('/api/music/stats')
      setState(prev => ({ ...prev, stats }))
    } catch (err) {
      console.error('[Music] Failed to load stats:', err)
    }
  }, [fetchApi])

  // Refresh all data
  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      await Promise.all([
        loadTastes(),
        loadUserPreferences(),
        loadQueue(),
        loadNowPlaying(),
        loadUpcoming(),
        loadSchedulerStatus(),
        loadStats()
      ])
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to load data'
      }))
    } finally {
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [loadTastes, loadUserPreferences, loadQueue, loadNowPlaying, loadUpcoming, loadSchedulerStatus, loadStats])

  // Set user taste preferences
  const setUserTastes = useCallback(async (tasteIds: string[]) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/me/tastes', {
      method: 'POST',
      body: JSON.stringify({ tastes: tasteIds })
    })

    setState(prev => ({ ...prev, userTastes: tasteIds }))

    // Refresh stats to see updated weights
    loadStats()
  }, [isAuthenticated, fetchApi, loadStats])

  // Set user volume preference
  const setUserVolume = useCallback(async (volume: VolumeLevel) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/me/volume', {
      method: 'POST',
      body: JSON.stringify({ volume })
    })

    setState(prev => ({ ...prev, userVolume: volume }))

    // Refresh stats
    loadStats()
  }, [isAuthenticated, fetchApi, loadStats])

  // Submit a track
  const submitTrack = useCallback(async (trackUrl: string, title?: string, artist?: string) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/music/submit', {
      method: 'POST',
      body: JSON.stringify({ track_url: trackUrl, title, artist })
    })

    // Refresh queue and upcoming
    loadQueue()
    loadUpcoming()
  }, [isAuthenticated, fetchApi, loadQueue, loadUpcoming])

  // Remove own submission
  const removeSubmission = useCallback(async (submissionId: number) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi(`/api/music/submission/${submissionId}`, {
      method: 'DELETE'
    })

    // Refresh queue
    loadQueue()
    loadUpcoming()
  }, [isAuthenticated, fetchApi, loadQueue, loadUpcoming])

  // Trash any submission (rate limited)
  const trashSubmission = useCallback(async (submissionId: number): Promise<{ success?: boolean; error?: string; warning?: string }> => {
    if (!isAuthenticated) return { error: 'Not authenticated' }

    const rateLimit = getTrashRateLimit()
    if (rateLimit.remaining === 0) {
      return {
        error: `Rate limited. Resets in ${rateLimit.resetsIn || '?'} min. Use downvote to vote items off instead.`
      }
    }

    try {
      await fetchApi(`/api/music/submission/${submissionId}/trash`, {
        method: 'POST'
      })

      // Record the trash
      setTrashTimestamps(prev => [...prev, Date.now()])

      // Refresh queue
      loadQueue()
      loadUpcoming()

      const newRemaining = rateLimit.remaining - 1
      if (newRemaining <= 1) {
        return {
          success: true,
          warning: `${newRemaining} trash${newRemaining === 1 ? '' : 'es'} remaining. Use downvote to vote items off.`
        }
      }

      return { success: true }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to trash' }
    }
  }, [isAuthenticated, fetchApi, loadQueue, loadUpcoming, getTrashRateLimit])

  // Vote on a submission
  const vote = useCallback(async (submissionId: number, value: -1 | 0 | 1) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/music/vote', {
      method: 'POST',
      body: JSON.stringify({ submission_id: submissionId, value })
    })

    // Refresh queue
    loadQueue()
  }, [isAuthenticated, fetchApi, loadQueue])

  // Skip current track
  const skipTrack = useCallback(async () => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/music/scheduler/skip', {
      method: 'POST'
    })

    // Refresh now playing and upcoming
    setTimeout(() => {
      loadNowPlaying()
      loadUpcoming()
      loadQueue()
    }, 1000)
  }, [isAuthenticated, fetchApi, loadNowPlaying, loadUpcoming, loadQueue])

  // Pause scheduler
  const pauseScheduler = useCallback(async () => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/music/scheduler/pause', {
      method: 'POST'
    })

    loadSchedulerStatus()
  }, [isAuthenticated, fetchApi, loadSchedulerStatus])

  // Resume scheduler
  const resumeScheduler = useCallback(async () => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/music/scheduler/resume', {
      method: 'POST'
    })

    loadSchedulerStatus()
  }, [isAuthenticated, fetchApi, loadSchedulerStatus])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(() => {
      loadNowPlaying()
      loadQueue()
      loadSchedulerStatus()
      loadStats()
    }, 10000) // Every 10 seconds

    return () => clearInterval(interval)
  }, [loadNowPlaying, loadQueue, loadSchedulerStatus, loadStats])

  // Reload user preferences when auth changes
  useEffect(() => {
    if (isAuthenticated) {
      loadUserPreferences()
    }
  }, [isAuthenticated, loadUserPreferences])

  // Users can only control if they are scanned in
  const canControl = isAuthenticated && isCurrentUserPresent

  return (
    <MusicContext.Provider
      value={{
        ...state,
        setUserTastes,
        setUserVolume,
        submitTrack,
        removeSubmission,
        trashSubmission,
        vote,
        skipTrack,
        pauseScheduler,
        resumeScheduler,
        refresh,
        canControl
      }}
    >
      {children}
    </MusicContext.Provider>
  )
}

export function useMusic() {
  const context = useContext(MusicContext)
  if (!context) {
    throw new Error('useMusic must be used within MusicProvider')
  }
  return context
}

// Volume level display labels
export const VOLUME_LABELS: Record<VolumeLevel, string> = {
  super_quiet: 'Super Quiet',
  soft: 'Soft',
  medium: 'Mediumish'
}
