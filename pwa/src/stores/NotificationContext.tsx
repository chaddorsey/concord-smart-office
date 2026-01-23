/**
 * Notification Context
 *
 * Manages in-app notifications, quick messages, and push subscription state.
 * Provides real-time notification updates via polling and SSE integration.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

const BACKEND_URL = ''
const POLL_INTERVAL_MS = 30000 // Poll every 30 seconds

const getHeaders = (extra?: Record<string, string>) => ({
  'ngrok-skip-browser-warning': 'true',
  ...extra
})

// Quick message templates (mirror of backend)
export interface QuickMessage {
  id: string
  emoji: string
  title: string
  message: string
}

export interface Notification {
  id: number
  user_id: number
  group_type: string | null
  title: string
  message: string
  type: string
  action_url: string | null
  sender_user_id: number | null
  sender_name: string | null
  created_at: string
  read_at: string | null
}

export interface Recipient {
  id: number
  name: string
  avatar_url: string | null
  checked_in_at: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  quickMessages: QuickMessage[]
  recipients: Recipient[]
  isLoading: boolean
  error: string | null
  pushSubscribed: boolean
}

interface NotificationContextValue extends NotificationState {
  // Fetch actions
  fetchNotifications: () => Promise<void>
  fetchUnread: () => Promise<void>
  fetchQuickMessages: () => Promise<void>
  fetchRecipients: () => Promise<void>

  // Notification actions
  markAsRead: (notificationId: number) => Promise<void>
  markAllAsRead: () => Promise<void>

  // Quick message actions
  sendQuickMessage: (messageId: string, excludeUserIds?: number[]) => Promise<void>
  sendCustomMessage: (message: string, excludeUserIds?: number[]) => Promise<void>

  // Push subscription
  subscribeToPush: () => Promise<void>
  unsubscribeFromPush: () => Promise<void>

  // Toast management
  showToast: (notification: Notification) => void
  dismissToast: () => void
  currentToast: Notification | null
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()

  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    quickMessages: [],
    recipients: [],
    isLoading: false,
    error: null,
    pushSubscribed: false
  })

  const [currentToast, setCurrentToast] = useState<Notification | null>(null)

  // Fetch all notifications
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      const response = await fetch(`${BACKEND_URL}/api/notifications`, {
        credentials: 'include',
        headers: getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setState(prev => ({
          ...prev,
          notifications: data.notifications || [],
          error: null
        }))
      }
    } catch (err) {
      console.error('[Notifications] Failed to fetch:', err)
    }
  }, [isAuthenticated])

  // Fetch unread notifications
  const fetchUnread = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      const response = await fetch(`${BACKEND_URL}/api/notifications/unread`, {
        credentials: 'include',
        headers: getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        const newNotifications = data.notifications || []
        const newCount = data.count || 0

        setState(prev => {
          // Check for new notifications to show as toast
          if (newCount > prev.unreadCount && newNotifications.length > 0) {
            // Show the newest notification as a toast
            const newest = newNotifications[0]
            setCurrentToast(newest)
          }

          return {
            ...prev,
            unreadCount: newCount,
            error: null
          }
        })
      }
    } catch (err) {
      console.error('[Notifications] Failed to fetch unread:', err)
    }
  }, [isAuthenticated])

  // Fetch quick message templates
  const fetchQuickMessages = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/notifications/quick-messages`, {
        headers: getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setState(prev => ({
          ...prev,
          quickMessages: data.messages || []
        }))
      }
    } catch (err) {
      console.error('[Notifications] Failed to fetch quick messages:', err)
    }
  }, [])

  // Fetch checked-in recipients
  const fetchRecipients = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      const response = await fetch(`${BACKEND_URL}/api/notifications/recipients`, {
        credentials: 'include',
        headers: getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setState(prev => ({
          ...prev,
          recipients: data.recipients || []
        }))
      }
    } catch (err) {
      console.error('[Notifications] Failed to fetch recipients:', err)
    }
  }, [isAuthenticated])

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: number) => {
    if (!isAuthenticated) return

    try {
      await fetch(`${BACKEND_URL}/api/notifications/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders()
      })

      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n =>
          n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1)
      }))
    } catch (err) {
      console.error('[Notifications] Failed to mark as read:', err)
    }
  }, [isAuthenticated])

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      await fetch(`${BACKEND_URL}/api/notifications/read-all`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders()
      })

      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n => ({
          ...n,
          read_at: n.read_at || new Date().toISOString()
        })),
        unreadCount: 0
      }))
    } catch (err) {
      console.error('[Notifications] Failed to mark all as read:', err)
    }
  }, [isAuthenticated])

  // Send quick message
  const sendQuickMessage = useCallback(async (messageId: string, excludeUserIds: number[] = []) => {
    if (!isAuthenticated) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch(`${BACKEND_URL}/api/notifications/quick-message`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          quickMessageId: messageId,
          sendToAll: true,
          excludeUserIds
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send message')
      }

      setState(prev => ({ ...prev, isLoading: false }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message'
      setState(prev => ({ ...prev, isLoading: false, error: message }))
      throw err
    }
  }, [isAuthenticated])

  // Send custom message
  const sendCustomMessage = useCallback(async (message: string, excludeUserIds: number[] = []) => {
    if (!isAuthenticated) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch(`${BACKEND_URL}/api/notifications/quick-message`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          customMessage: message,
          sendToAll: true,
          excludeUserIds
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send message')
      }

      setState(prev => ({ ...prev, isLoading: false }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message'
      setState(prev => ({ ...prev, isLoading: false, error: message }))
      throw err
    }
  }, [isAuthenticated])

  // Subscribe to push notifications
  const subscribeToPush = useCallback(async () => {
    if (!isAuthenticated || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[Notifications] Push not supported')
      return
    }

    try {
      // Get VAPID public key
      const keyResponse = await fetch(`${BACKEND_URL}/api/push/vapid-key`, {
        headers: getHeaders()
      })
      const { publicKey } = await keyResponse.json()

      if (!publicKey) {
        console.warn('[Notifications] VAPID key not configured')
        return
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
      })

      // Send subscription to backend
      await fetch(`${BACKEND_URL}/api/push/subscribe`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(subscription)
      })

      setState(prev => ({ ...prev, pushSubscribed: true }))
    } catch (err) {
      console.error('[Notifications] Failed to subscribe to push:', err)
    }
  }, [isAuthenticated])

  // Unsubscribe from push notifications
  const unsubscribeFromPush = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await fetch(`${BACKEND_URL}/api/push/unsubscribe`, {
          method: 'DELETE',
          credentials: 'include',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ endpoint: subscription.endpoint })
        })

        await subscription.unsubscribe()
      }

      setState(prev => ({ ...prev, pushSubscribed: false }))
    } catch (err) {
      console.error('[Notifications] Failed to unsubscribe from push:', err)
    }
  }, [])

  // Toast management
  const showToast = useCallback((notification: Notification) => {
    setCurrentToast(notification)
  }, [])

  const dismissToast = useCallback(() => {
    setCurrentToast(null)
  }, [])

  // Initial fetch and polling
  useEffect(() => {
    if (isAuthenticated) {
      fetchQuickMessages()
      fetchUnread()

      // Poll for new notifications
      const interval = setInterval(fetchUnread, POLL_INTERVAL_MS)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, fetchQuickMessages, fetchUnread])

  // Check push subscription status
  useEffect(() => {
    const checkPushStatus = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        setState(prev => ({ ...prev, pushSubscribed: !!subscription }))
      } catch (err) {
        console.error('[Notifications] Failed to check push status:', err)
      }
    }

    if (isAuthenticated) {
      checkPushStatus()
    }
  }, [isAuthenticated])

  return (
    <NotificationContext.Provider value={{
      ...state,
      currentToast,
      fetchNotifications,
      fetchUnread,
      fetchQuickMessages,
      fetchRecipients,
      markAsRead,
      markAllAsRead,
      sendQuickMessage,
      sendCustomMessage,
      subscribeToPush,
      unsubscribeFromPush,
      showToast,
      dismissToast
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}

// Helper: Convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
