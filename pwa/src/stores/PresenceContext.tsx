import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { MOCK_STAFF } from '../services/mockData'
import { useAuth } from './AuthContext'
import type { StaffMember } from '../services/types'

// Use relative URLs to go through Vite's proxy (fixes third-party cookie issues)
const BACKEND_URL = ''
const POLL_INTERVAL = 5000 // 5 seconds

interface PresenceState {
  staff: StaffMember[]
  presentCount: number
  isCurrentUserPresent: boolean
  isLoading: boolean
  error: string | null
  currentUserId: string | null
}

interface PresenceContextValue extends PresenceState {
  checkIn: () => Promise<void>
  checkOut: () => Promise<void>
  togglePresence: () => Promise<void>
  refresh: () => Promise<void>
}

const PresenceContext = createContext<PresenceContextValue | null>(null)

// Helper to fetch with credentials
async function fetchAPI(path: string, options?: RequestInit) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...options?.headers
    }
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || error.message || 'Request failed')
  }
  return res.json()
}

// Map backend presence to StaffMember
function mapPresenceToStaff(presence: {
  user_id: number | string
  status: string
  checked_in_at: string | null
  user_name?: string
  user_email?: string
  avatar_url?: string
}): StaffMember {
  const name = presence.user_name || presence.user_email || 'Unknown'
  const initials = name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return {
    id: String(presence.user_id),
    name,
    email: presence.user_email,
    avatarUrl: presence.avatar_url,
    entityId: '', // Not used with backend API
    avatarInitials: initials,
    isPresent: presence.status === 'in',
    arrivedAt: presence.checked_in_at
  }
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isMockMode, user } = useAuth()

  const currentUserId = user?.id ? String(user.id) : null

  const [state, setState] = useState<PresenceState>({
    staff: [],
    presentCount: 0,
    isCurrentUserPresent: false,
    isLoading: false,
    error: null,
    currentUserId: null
  })

  // Fetch presence data from backend API
  const fetchPresence = useCallback(async () => {
    if (!isAuthenticated || isMockMode) return

    try {
      const data = await fetchAPI('/api/presence')
      const presenceList = Array.isArray(data) ? data : (data.users || data.presence || [])
      const staff = presenceList.map(mapPresenceToStaff)

      setState(prev => {
        const currentUser = staff.find(s => s.id === currentUserId)
        return {
          ...prev,
          staff,
          presentCount: staff.filter(s => s.isPresent).length,
          isCurrentUserPresent: currentUser?.isPresent ?? false,
          isLoading: false,
          error: null,
          currentUserId
        }
      })
    } catch (err) {
      console.error('[Presence] Failed to fetch presence:', err)
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load presence data'
      }))
    }
  }, [isAuthenticated, isMockMode, currentUserId])

  // Initialize and poll for presence updates
  useEffect(() => {
    if (!isAuthenticated) {
      setState({
        staff: [],
        presentCount: 0,
        isCurrentUserPresent: false,
        isLoading: false,
        error: null,
        currentUserId: null
      })
      return
    }

    // Use mock data in mock mode
    if (isMockMode) {
      const mockStaff = MOCK_STAFF.map(s => ({ ...s }))
      const currentUser = mockStaff.find(s => s.id === currentUserId)
      setState({
        staff: mockStaff,
        presentCount: mockStaff.filter(s => s.isPresent).length,
        isCurrentUserPresent: currentUser?.isPresent ?? false,
        isLoading: false,
        error: null,
        currentUserId
      })
      return
    }

    // Initial fetch
    setState(prev => ({ ...prev, isLoading: true }))
    fetchPresence()

    // Set up polling
    const intervalId = setInterval(fetchPresence, POLL_INTERVAL)

    return () => {
      clearInterval(intervalId)
    }
  }, [isAuthenticated, isMockMode, currentUserId, fetchPresence])

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return

    // Mock mode uses local state, no need to refresh
    if (isMockMode) return

    setState(prev => ({ ...prev, isLoading: true }))
    await fetchPresence()
  }, [isAuthenticated, isMockMode, fetchPresence])

  const checkIn = useCallback(async () => {
    if (!currentUserId) {
      throw new Error('No user logged in')
    }

    if (isMockMode) {
      // Mock check in - update local state
      setState(prev => {
        const newStaff = prev.staff.map(s =>
          s.id === currentUserId ? { ...s, isPresent: true, arrivedAt: new Date().toISOString() } : s
        )
        return {
          ...prev,
          staff: newStaff,
          presentCount: newStaff.filter(s => s.isPresent).length,
          isCurrentUserPresent: true
        }
      })
      return
    }

    try {
      await fetchAPI('/api/presence/checkin', { method: 'POST' })
      // Refresh to get updated state
      await fetchPresence()
    } catch (err) {
      console.error('[Presence] Check in failed:', err)
      throw err
    }
  }, [currentUserId, isMockMode, fetchPresence])

  const checkOut = useCallback(async () => {
    if (!currentUserId) {
      throw new Error('No user logged in')
    }

    if (isMockMode) {
      // Mock check out - update local state
      setState(prev => {
        const newStaff = prev.staff.map(s =>
          s.id === currentUserId ? { ...s, isPresent: false, arrivedAt: null } : s
        )
        return {
          ...prev,
          staff: newStaff,
          presentCount: newStaff.filter(s => s.isPresent).length,
          isCurrentUserPresent: false
        }
      })
      return
    }

    try {
      await fetchAPI('/api/presence/checkout', { method: 'POST' })
      // Refresh to get updated state
      await fetchPresence()
    } catch (err) {
      console.error('[Presence] Check out failed:', err)
      throw err
    }
  }, [currentUserId, isMockMode, fetchPresence])

  const togglePresence = useCallback(async () => {
    if (!currentUserId) {
      throw new Error('No user logged in')
    }

    if (isMockMode) {
      // Mock toggle - update local state
      setState(prev => {
        const currentUser = prev.staff.find(s => s.id === currentUserId)
        const newIsPresent = !currentUser?.isPresent
        const newStaff = prev.staff.map(s =>
          s.id === currentUserId
            ? { ...s, isPresent: newIsPresent, arrivedAt: newIsPresent ? new Date().toISOString() : null }
            : s
        )
        return {
          ...prev,
          staff: newStaff,
          presentCount: newStaff.filter(s => s.isPresent).length,
          isCurrentUserPresent: newIsPresent
        }
      })
      return
    }

    // Determine current state and toggle
    const currentUser = state.staff.find(s => s.id === currentUserId)
    if (currentUser?.isPresent) {
      await checkOut()
    } else {
      await checkIn()
    }
  }, [currentUserId, isMockMode, state.staff, checkIn, checkOut])

  return (
    <PresenceContext.Provider
      value={{
        ...state,
        checkIn,
        checkOut,
        togglePresence,
        refresh
      }}
    >
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  const context = useContext(PresenceContext)
  if (!context) {
    throw new Error('usePresence must be used within PresenceProvider')
  }
  return context
}
