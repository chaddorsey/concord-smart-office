import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { usePresence } from './PresenceContext'

// API URL - use current origin to ensure absolute URLs bypass service worker issues
const API_URL = typeof window !== 'undefined' ? window.location.origin : ''

// Fetch helper with auth headers (uses cookies when available)
const fetchApi = async (path: string, options: RequestInit = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...options.headers
    }
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || error.message || 'Request failed')
  }

  return response.json()
}

// Fetch helper WITHOUT credentials - for endpoints with demo mode fallback
// Safari/incognito blocks cross-origin requests with credentials: 'include'
const fetchApiNoCredentials = async (path: string, options: RequestInit = {}) => {
  const fullUrl = `${API_URL}${path}`
  try {
    const response = await fetch(fullUrl, {
      ...options,
      mode: 'cors',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error || error.message || 'Request failed')
    }

    return await response.json()
  } catch (err) {
    throw err
  }
}

// Types
interface Pattern {
  id: string
  name: string
  thumbnail_url: string | null
  duration_seconds: number | null
}

interface PatternSubmission {
  id: number
  pattern_id: string
  pattern_name: string
  thumbnail_url: string | null
  submitted_by_user_id: number
  submitted_by_name: string
  created_at: string
  status: 'queued' | 'playing' | 'played' | 'failed'
  upvotes: number
  downvotes: number
  votes: Record<number, number>
  effectiveIndex: number
}

interface LedEffect {
  id: string
  name: string
  supportsColor: boolean
}

interface LedSubmission {
  id: number
  effect_name: string
  color_hex: string | null
  brightness: number
  submitted_by_user_id: number
  submitted_by_name: string
  created_at: string
  status: 'queued' | 'active' | 'played'
  upvotes: number
  downvotes: number
  votes: Record<number, number>
  effectiveIndex: number
}

interface PatternFavorite {
  id: number
  pattern_id: string
  pattern_name: string
  thumbnail_url: string | null
}

interface LedFavorite {
  id: number
  effect_name: string
  color_hex: string | null
  brightness: number
}

interface OasisStatus {
  isRunning: boolean
  currentPattern: PatternSubmission | null
  currentLed: LedSubmission | null
  patternQueueLength: number
  ledQueueLength: number
  ledChangeIntervalMinutes: number
  timeUntilNextLedChange: number
}

// Real-time status from Home Assistant
interface HAOasisStatus {
  connected: boolean
  state: 'idle' | 'playing' | 'paused'
  currentPattern: {
    name: string
    thumbnailUrl: string | null
    duration: number
    position: number
  } | null
  led: {
    state: 'on' | 'off'
    effect: string
    brightness: number
    color: [number, number, number] | null
    availableEffects: string[]
  } | null
  progress: number
  error?: string
}

// Native queue from Oasis device
interface NativeQueuePattern {
  name: string
  thumbnailUrl: string | null
  isNative: true
  position: number
}

interface NativeQueue {
  current: string | null
  patterns: NativeQueuePattern[]
}

interface TrashRateLimit {
  remaining: number
  resetsIn: number | null
}

interface OasisState {
  // Patterns
  patterns: Pattern[]
  patternQueue: PatternSubmission[]
  patternFavorites: PatternFavorite[]
  playlists: string[]
  nativeQueue: NativeQueue | null

  // LED
  ledEffects: LedEffect[]
  ledQueue: LedSubmission[]
  ledFavorites: LedFavorite[]

  // Status
  status: OasisStatus | null
  haStatus: HAOasisStatus | null
  drawingProgress: number | null

  // Rate limiting (separate for patterns and LED)
  patternTrashRateLimit: TrashRateLimit
  ledTrashRateLimit: TrashRateLimit

  // UI state
  isLoading: boolean
  error: string | null
}

interface OasisContextValue extends OasisState {
  // Pattern actions
  submitPattern: (patternId: string, patternName: string, thumbnailUrl?: string) => Promise<void>
  votePattern: (submissionId: number, value: -1 | 0 | 1) => Promise<void>
  trashPattern: (submissionId: number) => Promise<{ success?: boolean; error?: string; warning?: string }>
  addPatternFavorite: (patternId: string, patternName: string, thumbnailUrl?: string) => Promise<void>
  removePatternFavorite: (patternId: string) => Promise<void>

  // LED actions
  submitLed: (effectName: string, colorHex?: string, brightness?: number) => Promise<void>
  voteLed: (submissionId: number, value: -1 | 0 | 1) => Promise<void>
  trashLed: (submissionId: number) => Promise<{ success?: boolean; error?: string; warning?: string }>

  // Direct HA control
  playPatternNow: (patternId: string, patternName: string) => Promise<void>
  setLedEffectNow: (effect: string, rgbColor?: [number, number, number], brightness?: number) => Promise<void>
  setPlaylist: (playlistName: string) => Promise<void>

  // Settings
  setLedChangeInterval: (minutes: number) => Promise<void>

  // Refresh
  refresh: () => Promise<void>

  // Permissions
  canControl: boolean
}

const OasisContext = createContext<OasisContextValue | null>(null)

// Trash rate limiting - 3 trashes per 15 minutes (per feature)
const TRASH_LIMIT = 3
const TRASH_WINDOW_MS = 15 * 60 * 1000

export function OasisProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const { isCurrentUserPresent } = usePresence()

  // Separate trash timestamps for patterns and LED
  const [patternTrashTimestamps, setPatternTrashTimestamps] = useState<number[]>([])
  const [ledTrashTimestamps, setLedTrashTimestamps] = useState<number[]>([])

  const getTrashRateLimit = (timestamps: number[]): TrashRateLimit => {
    const now = Date.now()
    const windowStart = now - TRASH_WINDOW_MS
    const recentTrashes = timestamps.filter(ts => ts > windowStart)
    const remaining = Math.max(0, TRASH_LIMIT - recentTrashes.length)

    let resetsIn: number | null = null
    if (remaining === 0 && recentTrashes.length > 0) {
      const oldestInWindow = Math.min(...recentTrashes)
      resetsIn = Math.ceil((oldestInWindow + TRASH_WINDOW_MS - now) / 60000)
    }

    return { remaining, resetsIn }
  }

  const [state, setState] = useState<OasisState>({
    patterns: [],
    patternQueue: [],
    patternFavorites: [],
    playlists: [],
    nativeQueue: null,
    ledEffects: [],
    ledQueue: [],
    ledFavorites: [],
    status: null,
    haStatus: null,
    drawingProgress: null,
    patternTrashRateLimit: { remaining: TRASH_LIMIT, resetsIn: null },
    ledTrashRateLimit: { remaining: TRASH_LIMIT, resetsIn: null },
    isLoading: false,
    error: null
  })

  // Update trash rate limits when timestamps change
  useEffect(() => {
    setState(prev => ({
      ...prev,
      patternTrashRateLimit: getTrashRateLimit(patternTrashTimestamps)
    }))
  }, [patternTrashTimestamps])

  useEffect(() => {
    setState(prev => ({
      ...prev,
      ledTrashRateLimit: getTrashRateLimit(ledTrashTimestamps)
    }))
  }, [ledTrashTimestamps])

  // Load LED effects from HA
  const loadLedEffects = useCallback(async () => {
    try {
      const { effects } = await fetchApi('/api/oasis/ha/effects')
      setState(prev => ({ ...prev, ledEffects: effects }))
    } catch (err) {
      console.error('[Oasis] Failed to load LED effects:', err)
      // Fallback to static list
      try {
        const effects = await fetchApi('/api/oasis/led/effects')
        setState(prev => ({ ...prev, ledEffects: effects }))
      } catch {
        // ignore
      }
    }
  }, [])

  // Load HA status (real-time Oasis state) - no credentials needed for public endpoint
  const loadHAStatus = useCallback(async () => {
    try {
      console.log('[Oasis] Fetching HA status...')
      const response = await fetch('/api/oasis/ha/status', {
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const haStatus = await response.json()
      console.log('[Oasis] Got HA status:', haStatus?.connected)
      setState(prev => ({
        ...prev,
        haStatus,
        drawingProgress: haStatus.progress ?? prev.drawingProgress
      }))
    } catch (err) {
      console.error('[Oasis] Failed to load HA status:', err)
      setState(prev => ({
        ...prev,
        haStatus: { connected: false, error: String(err) } as any
      }))
    }
  }, [])

  // Load playlists from HA
  const loadPlaylists = useCallback(async () => {
    try {
      const { playlists } = await fetchApi('/api/oasis/ha/playlists')
      setState(prev => ({ ...prev, playlists }))
    } catch (err) {
      console.error('[Oasis] Failed to load playlists:', err)
    }
  }, [])

  // Load native queue from Oasis (no credentials needed)
  const loadNativeQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/oasis/ha/queue', {
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const nativeQueue = await response.json()
      setState(prev => ({ ...prev, nativeQueue }))
    } catch (err) {
      console.error('[Oasis] Failed to load native queue:', err)
    }
  }, [])

  // Load pattern queue
  const loadPatternQueue = useCallback(async () => {
    try {
      const queue = await fetchApi('/api/oasis/queue')
      setState(prev => ({ ...prev, patternQueue: queue }))
    } catch (err) {
      console.error('[Oasis] Failed to load pattern queue:', err)
    }
  }, [])

  // Load LED queue
  const loadLedQueue = useCallback(async () => {
    try {
      const queue = await fetchApi('/api/oasis/led/queue')
      setState(prev => ({ ...prev, ledQueue: queue }))
    } catch (err) {
      console.error('[Oasis] Failed to load LED queue:', err)
    }
  }, [])

  // Load status
  const loadStatus = useCallback(async () => {
    try {
      const status = await fetchApi('/api/oasis/status')
      setState(prev => ({ ...prev, status }))
    } catch (err) {
      console.error('[Oasis] Failed to load status:', err)
    }
  }, [])

  // Load favorites
  const loadFavorites = useCallback(async () => {
    try {
      const [patternFavs, ledFavs] = await Promise.all([
        fetchApi('/api/oasis/favorites'),
        fetchApi('/api/oasis/led/favorites')
      ])
      setState(prev => ({
        ...prev,
        patternFavorites: patternFavs,
        ledFavorites: ledFavs
      }))
    } catch (err) {
      console.error('[Oasis] Failed to load favorites:', err)
    }
  }, [])

  // Load patterns (cached from Oasis) - public endpoint, no credentials needed
  const loadPatterns = useCallback(async () => {
    try {
      const response = await fetch('/api/oasis/patterns', {
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const patterns = await response.json()
      console.log(`[Oasis] Loaded ${patterns.length} patterns`)
      setState(prev => ({ ...prev, patterns }))
    } catch (err) {
      console.error('[Oasis] Failed to load patterns:', err)
    }
  }, [])

  // Refresh all data
  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))
    try {
      await Promise.all([
        loadPatterns(),
        loadPatternQueue(),
        loadLedEffects(),
        loadLedQueue(),
        loadStatus(),
        loadFavorites(),
        loadHAStatus(),
        loadPlaylists()
      ])
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to load data'
      }))
    } finally {
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [loadPatterns, loadPatternQueue, loadLedEffects, loadLedQueue, loadStatus, loadFavorites, loadHAStatus, loadPlaylists])

  // Load HA status and patterns always (public info about what Oasis is doing)
  useEffect(() => {
    loadHAStatus()
    loadPlaylists()
    loadLedEffects()
    loadNativeQueue()
    loadPatterns() // Patterns are public - load for browsing

    // Poll HA status and native queue every 5 seconds regardless of auth
    const haStatusInterval = setInterval(() => {
      loadHAStatus()
      loadNativeQueue()
    }, 5000)

    return () => clearInterval(haStatusInterval)
  }, [loadHAStatus, loadPlaylists, loadLedEffects, loadNativeQueue, loadPatterns])

  // Initial load and polling for auth-required data
  useEffect(() => {
    if (!isAuthenticated) {
      // Clear auth-required data but keep patterns (public)
      setState(prev => ({
        ...prev,
        patternQueue: [],
        ledQueue: [],
        status: null,
        isLoading: false
      }))
      return
    }

    refresh()

    // Poll for auth-required updates every 5 seconds
    const pollInterval = setInterval(() => {
      loadPatternQueue()
      loadLedQueue()
      loadStatus()
    }, 5000)

    return () => clearInterval(pollInterval)
  }, [isAuthenticated, refresh, loadPatternQueue, loadLedQueue, loadStatus])

  // Submit pattern to queue (backend handles auth/demo fallback)
  const submitPattern = useCallback(async (patternId: string, patternName: string, thumbnailUrl?: string) => {
    await fetchApiNoCredentials('/api/oasis/submit', {
      method: 'POST',
      body: JSON.stringify({
        pattern_id: patternId,
        pattern_name: patternName,
        thumbnail_url: thumbnailUrl
      })
    })

    loadPatternQueue()
  }, [loadPatternQueue])

  // Vote on pattern
  const votePattern = useCallback(async (submissionId: number, value: -1 | 0 | 1) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/oasis/vote', {
      method: 'POST',
      body: JSON.stringify({ submission_id: submissionId, value })
    })

    loadPatternQueue()
  }, [isAuthenticated, loadPatternQueue])

  // Trash pattern (rate limited)
  const trashPattern = useCallback(async (submissionId: number): Promise<{ success?: boolean; error?: string; warning?: string }> => {
    if (!isAuthenticated) return { error: 'Not authenticated' }

    const rateLimit = getTrashRateLimit(patternTrashTimestamps)
    if (rateLimit.remaining === 0) {
      return {
        error: `Rate limited. Resets in ${rateLimit.resetsIn || '?'} min. Use downvote instead.`
      }
    }

    try {
      await fetchApi(`/api/oasis/submission/${submissionId}/trash`, { method: 'POST' })

      setPatternTrashTimestamps(prev => [...prev, Date.now()])
      loadPatternQueue()

      const newRemaining = rateLimit.remaining - 1
      if (newRemaining <= 1) {
        return {
          success: true,
          warning: `${newRemaining} pattern trash${newRemaining === 1 ? '' : 'es'} remaining.`
        }
      }

      return { success: true }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to trash' }
    }
  }, [isAuthenticated, patternTrashTimestamps, loadPatternQueue])

  // Add pattern favorite (backend handles auth/demo fallback)
  const addPatternFavorite = useCallback(async (patternId: string, patternName: string, thumbnailUrl?: string) => {
    await fetchApiNoCredentials('/api/oasis/favorites', {
      method: 'POST',
      body: JSON.stringify({
        pattern_id: patternId,
        pattern_name: patternName,
        thumbnail_url: thumbnailUrl
      })
    })

    loadFavorites()
  }, [loadFavorites])

  // Remove pattern favorite (backend handles auth/demo fallback)
  const removePatternFavorite = useCallback(async (patternId: string) => {
    await fetchApiNoCredentials(`/api/oasis/favorites/${patternId}`, { method: 'DELETE' })
    loadFavorites()
  }, [loadFavorites])

  // Submit LED to queue
  const submitLed = useCallback(async (effectName: string, colorHex?: string, brightness?: number) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/oasis/led/submit', {
      method: 'POST',
      body: JSON.stringify({
        effect_name: effectName,
        color_hex: colorHex,
        brightness: brightness ?? 128
      })
    })

    loadLedQueue()
  }, [isAuthenticated, loadLedQueue])

  // Vote on LED
  const voteLed = useCallback(async (submissionId: number, value: -1 | 0 | 1) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/oasis/led/vote', {
      method: 'POST',
      body: JSON.stringify({ submission_id: submissionId, value })
    })

    loadLedQueue()
  }, [isAuthenticated, loadLedQueue])

  // Trash LED (rate limited)
  const trashLed = useCallback(async (submissionId: number): Promise<{ success?: boolean; error?: string; warning?: string }> => {
    if (!isAuthenticated) return { error: 'Not authenticated' }

    const rateLimit = getTrashRateLimit(ledTrashTimestamps)
    if (rateLimit.remaining === 0) {
      return {
        error: `Rate limited. Resets in ${rateLimit.resetsIn || '?'} min. Use downvote instead.`
      }
    }

    try {
      await fetchApi(`/api/oasis/led/${submissionId}/trash`, { method: 'POST' })

      setLedTrashTimestamps(prev => [...prev, Date.now()])
      loadLedQueue()

      const newRemaining = rateLimit.remaining - 1
      if (newRemaining <= 1) {
        return {
          success: true,
          warning: `${newRemaining} LED trash${newRemaining === 1 ? '' : 'es'} remaining.`
        }
      }

      return { success: true }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to trash' }
    }
  }, [isAuthenticated, ledTrashTimestamps, loadLedQueue])

  // Set LED change interval
  const setLedChangeInterval = useCallback(async (minutes: number) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/oasis/settings/led-interval', {
      method: 'PUT',
      body: JSON.stringify({ minutes })
    })

    loadStatus()
  }, [isAuthenticated, loadStatus])

  // Direct HA control: Play a pattern immediately
  const playPatternNow = useCallback(async (patternId: string, patternName: string) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/oasis/ha/play', {
      method: 'POST',
      body: JSON.stringify({ pattern_id: patternId, pattern_name: patternName })
    })

    // Refresh HA status to show the new pattern
    setTimeout(() => loadHAStatus(), 1000)
  }, [isAuthenticated, loadHAStatus])

  // Direct HA control: Set LED effect immediately
  const setLedEffectNow = useCallback(async (effect: string, rgbColor?: [number, number, number], brightness?: number) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/oasis/ha/led', {
      method: 'POST',
      body: JSON.stringify({ effect, rgb_color: rgbColor, brightness })
    })

    // Refresh HA status to show the new LED state
    setTimeout(() => loadHAStatus(), 500)
  }, [isAuthenticated, loadHAStatus])

  // Direct HA control: Set playlist
  const setPlaylist = useCallback(async (playlistName: string) => {
    if (!isAuthenticated) throw new Error('Not authenticated')

    await fetchApi('/api/oasis/ha/playlist', {
      method: 'POST',
      body: JSON.stringify({ playlist: playlistName })
    })

    loadHAStatus()
  }, [isAuthenticated, loadHAStatus])

  const canControl = isCurrentUserPresent

  return (
    <OasisContext.Provider
      value={{
        ...state,
        submitPattern,
        votePattern,
        trashPattern,
        addPatternFavorite,
        removePatternFavorite,
        submitLed,
        voteLed,
        trashLed,
        playPatternNow,
        setLedEffectNow,
        setPlaylist,
        setLedChangeInterval,
        refresh,
        canControl
      }}
    >
      {children}
    </OasisContext.Provider>
  )
}

export function useOasis() {
  const context = useContext(OasisContext)
  if (!context) {
    throw new Error('useOasis must be used within OasisProvider')
  }
  return context
}

// Re-export types
export type {
  Pattern,
  PatternSubmission,
  LedEffect,
  LedSubmission,
  PatternFavorite,
  LedFavorite,
  OasisStatus,
  HAOasisStatus,
  NativeQueue,
  NativeQueuePattern
}
