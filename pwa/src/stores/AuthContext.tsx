import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { haWebSocket } from '../services/haWebSocket'
import { checkMockMode, enableMockMode, disableMockMode, isMockModeEnabled } from '../services/mockData'
import type { ConnectionStatus } from '../services/types'

interface AuthState {
  isAuthenticated: boolean
  connectionStatus: ConnectionStatus
  haUrl: string | null
  error: string | null
  isMockMode: boolean
}

interface AuthContextValue extends AuthState {
  connect: (url: string, token: string) => Promise<void>
  connectMock: () => void
  disconnect: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY_URL = 'ha_url'
const STORAGE_KEY_TOKEN = 'ha_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    // Check for mock mode on initial load
    const mockMode = checkMockMode()
    return {
      isAuthenticated: mockMode,
      connectionStatus: mockMode ? 'authenticated' : 'disconnected',
      haUrl: mockMode ? 'mock://demo' : localStorage.getItem(STORAGE_KEY_URL),
      error: null,
      isMockMode: mockMode
    }
  })

  // Listen to connection status changes (skip in mock mode)
  useEffect(() => {
    if (state.isMockMode) return

    const unsubscribe = haWebSocket.onStatusChange((status) => {
      setState(prev => {
        if (prev.isMockMode) return prev
        return {
          ...prev,
          connectionStatus: status,
          isAuthenticated: status === 'authenticated',
          error: status === 'error' ? 'Connection error' : null
        }
      })
    })

    return unsubscribe
  }, [state.isMockMode])

  // Auto-reconnect on mount if we have stored credentials (skip in mock mode)
  useEffect(() => {
    if (isMockModeEnabled()) return

    const storedUrl = localStorage.getItem(STORAGE_KEY_URL)
    const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN)

    if (storedUrl && storedToken && state.connectionStatus === 'disconnected') {
      haWebSocket.connect(storedUrl, storedToken).catch((err) => {
        console.error('[Auth] Auto-reconnect failed:', err)
        // Clear invalid credentials
        localStorage.removeItem(STORAGE_KEY_TOKEN)
      })
    }
  }, [])

  const connect = useCallback(async (url: string, token: string) => {
    setState(prev => ({ ...prev, error: null }))

    try {
      await haWebSocket.connect(url, token)

      // Store credentials on successful connection
      localStorage.setItem(STORAGE_KEY_URL, url)
      localStorage.setItem(STORAGE_KEY_TOKEN, token)

      setState(prev => ({
        ...prev,
        haUrl: url,
        isAuthenticated: true,
        connectionStatus: 'authenticated'
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      setState(prev => ({
        ...prev,
        error: message,
        isAuthenticated: false,
        connectionStatus: 'error'
      }))
      throw err
    }
  }, [])

  const connectMock = useCallback(() => {
    enableMockMode()
    setState({
      isAuthenticated: true,
      connectionStatus: 'authenticated',
      haUrl: 'mock://demo',
      error: null,
      isMockMode: true
    })
  }, [])

  const disconnect = useCallback(() => {
    if (state.isMockMode) {
      disableMockMode()
    } else {
      haWebSocket.disconnect()
      localStorage.removeItem(STORAGE_KEY_TOKEN)
    }
    setState({
      isAuthenticated: false,
      connectionStatus: 'disconnected',
      haUrl: null,
      error: null,
      isMockMode: false
    })
  }, [state.isMockMode])

  return (
    <AuthContext.Provider value={{ ...state, connect, connectMock, disconnect }}>
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
