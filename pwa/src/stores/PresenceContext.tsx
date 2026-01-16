import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { presenceService } from '../services/presenceService'
import { MOCK_STAFF } from '../services/mockData'
import { useAuth } from './AuthContext'
import type { StaffMember } from '../services/types'

interface PresenceState {
  staff: StaffMember[]
  presentCount: number
  currentUserId: string | null
  isCurrentUserPresent: boolean
  isLoading: boolean
  error: string | null
}

interface PresenceContextValue extends PresenceState {
  scanIn: (staffId: string) => Promise<void>
  scanOut: (staffId: string) => Promise<void>
  togglePresence: (staffId: string) => Promise<void>
  setCurrentUser: (staffId: string | null) => void
  refresh: () => Promise<void>
}

const PresenceContext = createContext<PresenceContextValue | null>(null)

const STORAGE_KEY_CURRENT_USER = 'current_user_id'

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isMockMode } = useAuth()

  const [state, setState] = useState<PresenceState>(() => {
    const storedUserId = localStorage.getItem(STORAGE_KEY_CURRENT_USER)
    return {
      staff: [],
      presentCount: 0,
      currentUserId: storedUserId,
      isCurrentUserPresent: false,
      isLoading: false,
      error: null
    }
  })

  // Subscribe to presence changes when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setState(prev => ({
        ...prev,
        staff: [],
        presentCount: 0,
        isLoading: false
      }))
      return
    }

    // Use mock data in mock mode
    if (isMockMode) {
      const mockStaff = MOCK_STAFF.map(s => ({ ...s }))
      setState(prev => {
        const currentUser = mockStaff.find(s => s.id === prev.currentUserId)
        return {
          ...prev,
          staff: mockStaff,
          presentCount: mockStaff.filter(s => s.isPresent).length,
          isCurrentUserPresent: currentUser?.isPresent ?? false,
          isLoading: false,
          error: null
        }
      })
      return
    }

    setState(prev => ({ ...prev, isLoading: true }))

    let unsubscribe: (() => void) | null = null

    presenceService
      .subscribeToPresenceChanges((staff) => {
        setState(prev => {
          const currentUser = staff.find(s => s.id === prev.currentUserId)
          return {
            ...prev,
            staff,
            presentCount: staff.filter(s => s.isPresent).length,
            isCurrentUserPresent: currentUser?.isPresent ?? false,
            isLoading: false,
            error: null
          }
        })
      })
      .then((unsub) => {
        unsubscribe = unsub
      })
      .catch((err) => {
        console.error('[Presence] Failed to subscribe:', err)
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load presence data'
        }))
      })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [isAuthenticated, isMockMode])

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return

    // Mock mode doesn't need refresh
    if (isMockMode) return

    setState(prev => ({ ...prev, isLoading: true }))

    try {
      const staff = await presenceService.getStaffPresence()
      setState(prev => {
        const currentUser = staff.find(s => s.id === prev.currentUserId)
        return {
          ...prev,
          staff,
          presentCount: staff.filter(s => s.isPresent).length,
          isCurrentUserPresent: currentUser?.isPresent ?? false,
          isLoading: false,
          error: null
        }
      })
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to refresh'
      }))
    }
  }, [isAuthenticated, isMockMode])

  const scanIn = useCallback(async (staffId: string) => {
    if (isMockMode) {
      // Mock scan in - update local state
      setState(prev => {
        const newStaff = prev.staff.map(s =>
          s.id === staffId ? { ...s, isPresent: true, arrivedAt: new Date().toISOString() } : s
        )
        const currentUser = newStaff.find(s => s.id === prev.currentUserId)
        return {
          ...prev,
          staff: newStaff,
          presentCount: newStaff.filter(s => s.isPresent).length,
          isCurrentUserPresent: currentUser?.isPresent ?? false
        }
      })
      return
    }
    try {
      await presenceService.scanIn(staffId)
    } catch (err) {
      console.error('[Presence] Scan in failed:', err)
      throw err
    }
  }, [isMockMode])

  const scanOut = useCallback(async (staffId: string) => {
    if (isMockMode) {
      // Mock scan out - update local state
      setState(prev => {
        const newStaff = prev.staff.map(s =>
          s.id === staffId ? { ...s, isPresent: false, arrivedAt: null } : s
        )
        const currentUser = newStaff.find(s => s.id === prev.currentUserId)
        return {
          ...prev,
          staff: newStaff,
          presentCount: newStaff.filter(s => s.isPresent).length,
          isCurrentUserPresent: currentUser?.isPresent ?? false
        }
      })
      return
    }
    try {
      await presenceService.scanOut(staffId)
    } catch (err) {
      console.error('[Presence] Scan out failed:', err)
      throw err
    }
  }, [isMockMode])

  const togglePresence = useCallback(async (staffId: string) => {
    if (isMockMode) {
      // Mock toggle - update local state
      setState(prev => {
        const newStaff = prev.staff.map(s =>
          s.id === staffId
            ? { ...s, isPresent: !s.isPresent, arrivedAt: !s.isPresent ? new Date().toISOString() : null }
            : s
        )
        const currentUser = newStaff.find(s => s.id === prev.currentUserId)
        return {
          ...prev,
          staff: newStaff,
          presentCount: newStaff.filter(s => s.isPresent).length,
          isCurrentUserPresent: currentUser?.isPresent ?? false
        }
      })
      return
    }
    try {
      await presenceService.togglePresence(staffId)
    } catch (err) {
      console.error('[Presence] Toggle failed:', err)
      throw err
    }
  }, [isMockMode])

  const setCurrentUser = useCallback((staffId: string | null) => {
    if (staffId) {
      localStorage.setItem(STORAGE_KEY_CURRENT_USER, staffId)
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT_USER)
    }

    setState(prev => {
      const currentUser = prev.staff.find(s => s.id === staffId)
      return {
        ...prev,
        currentUserId: staffId,
        isCurrentUserPresent: currentUser?.isPresent ?? false
      }
    })
  }, [])

  return (
    <PresenceContext.Provider
      value={{
        ...state,
        scanIn,
        scanOut,
        togglePresence,
        setCurrentUser,
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
