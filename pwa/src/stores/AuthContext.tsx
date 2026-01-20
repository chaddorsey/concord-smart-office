import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { enableMockMode, disableMockMode } from '../services/mockData'
import type { ConnectionStatus } from '../services/types'

// Use relative URLs to go through Vite's proxy (fixes third-party cookie issues)
const BACKEND_URL = ''

// Headers to bypass ngrok's browser warning page
const getHeaders = (extra?: Record<string, string>) => ({
  'ngrok-skip-browser-warning': 'true',
  ...extra
})

interface User {
  id: number
  email: string
  name: string
  avatarUrl?: string
  role: string
}

interface AuthState {
  isAuthenticated: boolean
  connectionStatus: ConnectionStatus
  user: User | null
  error: string | null
  isMockMode: boolean
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  loginWithGoogle: () => void
  connectMock: () => void
  logout: () => Promise<void>
  checkSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const MOCK_USER: User = {
  id: 1,
  email: 'demo@example.com',
  name: 'Demo User',
  avatarUrl: undefined,
  role: 'user'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    // Always start unauthenticated - will check session on mount
    return {
      isAuthenticated: false,
      connectionStatus: 'disconnected',
      user: null,
      error: null,
      isMockMode: false,
      isLoading: true // Will check session on mount
    }
  })

  const checkSession = useCallback(async () => {
    console.log('[Auth] Checking session...')
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/session`, {
        method: 'GET',
        credentials: 'include',
        headers: getHeaders()
      })
      console.log('[Auth] Session response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('[Auth] Session data:', data)
        if (data.user) {
          console.log('[Auth] User found, setting authenticated')
          setState(prev => ({
            ...prev,
            isAuthenticated: true,
            connectionStatus: 'authenticated',
            user: data.user,
            error: null,
            isLoading: false
          }))
        } else {
          console.log('[Auth] No user in session, setting unauthenticated')
          setState(prev => ({
            ...prev,
            isAuthenticated: false,
            connectionStatus: 'disconnected',
            user: null,
            error: null,
            isLoading: false
          }))
        }
      } else {
        console.log('[Auth] Session response not ok, setting unauthenticated')
        setState(prev => ({
          ...prev,
          isAuthenticated: false,
          connectionStatus: 'disconnected',
          user: null,
          error: null,
          isLoading: false
        }))
      }
    } catch (err) {
      console.error('[Auth] Session check failed:', err)
      console.log('[Auth] Error during session check, setting error state')
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        connectionStatus: 'error',
        user: null,
        error: 'Failed to check session',
        isLoading: false
      }))
    }
  }, [])

  // Check session on mount, auto-login in demo mode if no session
  useEffect(() => {
    const initAuth = async () => {
      console.log('[Auth] Checking session...')
      setState(prev => ({ ...prev, isLoading: true, error: null }))

      try {
        // Check existing session
        const sessionRes = await fetch(`${BACKEND_URL}/api/auth/session`, {
          method: 'GET',
          credentials: 'include',
          headers: getHeaders()
        })

        if (sessionRes.ok) {
          const sessionData = await sessionRes.json()
          if (sessionData.user) {
            console.log('[Auth] Existing session found')
            setState({
              isAuthenticated: true,
              connectionStatus: 'authenticated',
              user: sessionData.user,
              error: null,
              isMockMode: false,
              isLoading: false
            })
            return
          }
        }

        // No session - check if we're in demo mode
        const configRes = await fetch(`${BACKEND_URL}/api/config`, {
          headers: getHeaders()
        })

        if (configRes.ok) {
          const config = await configRes.json()
          if (!config.oauth?.configured) {
            // Demo mode - auto login
            console.log('[Auth] Demo mode detected, auto-logging in...')
            const demoRes = await fetch(`${BACKEND_URL}/api/auth/demo`, {
              method: 'POST',
              headers: getHeaders({ 'Content-Type': 'application/json' }),
              credentials: 'include',
              body: JSON.stringify({ name: 'Demo User', email: 'demo@example.com' })
            })

            if (demoRes.ok) {
              const data = await demoRes.json()
              setState({
                isAuthenticated: true,
                connectionStatus: 'authenticated',
                user: data.user,
                error: null,
                isMockMode: false,
                isLoading: false
              })
              return
            }
          }
        }

        // No session and not demo mode (or demo login failed)
        setState({
          isAuthenticated: false,
          connectionStatus: 'disconnected',
          user: null,
          error: null,
          isMockMode: false,
          isLoading: false
        })
      } catch (err) {
        console.error('[Auth] Init failed:', err)
        setState({
          isAuthenticated: false,
          connectionStatus: 'error',
          user: null,
          error: 'Failed to initialize auth',
          isMockMode: false,
          isLoading: false
        })
      }
    }
    initAuth()
  }, [])

  const loginWithGoogle = useCallback(() => {
    // Redirect to backend OAuth endpoint
    window.location.href = `${BACKEND_URL}/api/auth/google`
  }, [])

  const connectMock = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // Try backend demo login first
      const response = await fetch(`${BACKEND_URL}/api/auth/demo`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ name: 'Demo User', email: 'demo@example.com' })
      })

      if (response.ok) {
        const data = await response.json()
        setState({
          isAuthenticated: true,
          connectionStatus: 'authenticated',
          user: data.user,
          error: null,
          isMockMode: false, // Using real backend session
          isLoading: false
        })
        return
      }
    } catch (err) {
      console.warn('[Auth] Backend demo login failed, falling back to client mock:', err)
    }

    // Fallback to client-side mock mode if backend unavailable
    enableMockMode()
    setState({
      isAuthenticated: true,
      connectionStatus: 'authenticated',
      user: MOCK_USER,
      error: null,
      isMockMode: true,
      isLoading: false
    })
  }, [])

  const logout = useCallback(async () => {
    if (state.isMockMode) {
      disableMockMode()
      setState({
        isAuthenticated: false,
        connectionStatus: 'disconnected',
        user: null,
        error: null,
        isMockMode: false,
        isLoading: false
      })
      return
    }

    try {
      await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders()
      })
    } catch (err) {
      console.error('[Auth] Logout request failed:', err)
    }

    // Clear local state regardless of API success
    setState({
      isAuthenticated: false,
      connectionStatus: 'disconnected',
      user: null,
      error: null,
      isMockMode: false,
      isLoading: false
    })
  }, [state.isMockMode])

  return (
    <AuthContext.Provider value={{ ...state, loginWithGoogle, connectMock, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
