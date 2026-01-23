/**
 * Notification Toast Component
 *
 * Displays incoming notifications as a toast overlay.
 * Auto-dismisses after a timeout or can be manually dismissed.
 */

import { useEffect, useCallback } from 'react'
import { useNotifications, type Notification } from '../stores/NotificationContext'

const AUTO_DISMISS_MS = 5000

interface NotificationToastProps {
  notification: Notification
  onDismiss: () => void
}

function ToastContent({ notification, onDismiss }: NotificationToastProps) {
  // Auto-dismiss after timeout
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  // Get icon based on notification type
  const getIcon = () => {
    switch (notification.type) {
      case 'message':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )
      case 'checkin':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'alert':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      default:
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        )
    }
  }

  // Get background color based on type
  const getBgColor = () => {
    switch (notification.type) {
      case 'message':
        return 'bg-blue-500'
      case 'checkin':
        return 'bg-green-500'
      case 'alert':
        return 'bg-amber-500'
      default:
        return 'bg-gray-700'
    }
  }

  return (
    <div
      className={`${getBgColor()} text-white rounded-xl shadow-2xl p-4 max-w-sm w-full mx-4 animate-slide-up`}
      onClick={onDismiss}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{notification.title}</p>
          <p className="text-sm text-white/90 mt-1 break-words">{notification.message}</p>
          {notification.sender_name && (
            <p className="text-xs text-white/70 mt-2">From {notification.sender_name}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="flex-shrink-0 p-1 hover:bg-white/20 rounded-full transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1 bg-white/30 rounded-full overflow-hidden">
        <div
          className="h-full bg-white/70 rounded-full animate-shrink"
          style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
        />
      </div>
    </div>
  )
}

export default function NotificationToast() {
  const { currentToast, dismissToast, markAsRead } = useNotifications()

  const handleDismiss = useCallback(() => {
    if (currentToast) {
      markAsRead(currentToast.id)
    }
    dismissToast()
  }, [currentToast, markAsRead, dismissToast])

  if (!currentToast) return null

  return (
    <div className="fixed top-4 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto">
        <ToastContent notification={currentToast} onDismiss={handleDismiss} />
      </div>
    </div>
  )
}
