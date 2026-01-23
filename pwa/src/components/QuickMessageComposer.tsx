/**
 * Quick Message Composer Component
 *
 * UI for sending quick messages to other checked-in users.
 * Features:
 * - Quick message buttons (coffee, lunch, ice cream, etc.)
 * - Custom message input
 * - "Send to all" checkbox (default checked)
 * - Recipient exclusion list
 */

import { useState, useEffect } from 'react'
import { useNotifications } from '../stores/NotificationContext'

interface QuickMessageComposerProps {
  onClose?: () => void
  onSent?: () => void
}

export default function QuickMessageComposer({ onClose, onSent }: QuickMessageComposerProps) {
  const {
    quickMessages,
    recipients,
    fetchRecipients,
    sendQuickMessage,
    sendCustomMessage,
    isLoading,
    error
  } = useNotifications()

  const [customMessage, setCustomMessage] = useState('')
  const [sendToAll, setSendToAll] = useState(true)
  const [excludedUsers, setExcludedUsers] = useState<Set<number>>(new Set())
  const [sending, setSending] = useState(false)
  const [sentMessage, setSentMessage] = useState<string | null>(null)

  // Fetch recipients when component mounts
  useEffect(() => {
    fetchRecipients()
  }, [fetchRecipients])

  const handleQuickMessage = async (messageId: string) => {
    setSending(true)
    setSentMessage(null)

    try {
      const excludeIds = sendToAll ? [] : Array.from(excludedUsers)
      await sendQuickMessage(messageId, excludeIds)

      const msg = quickMessages.find(m => m.id === messageId)
      setSentMessage(`${msg?.emoji} Message sent!`)

      setTimeout(() => {
        onSent?.()
      }, 1500)
    } catch {
      // Error is handled in context
    } finally {
      setSending(false)
    }
  }

  const handleCustomMessage = async () => {
    if (!customMessage.trim()) return

    setSending(true)
    setSentMessage(null)

    try {
      const excludeIds = sendToAll ? [] : Array.from(excludedUsers)
      await sendCustomMessage(customMessage.trim(), excludeIds)

      setSentMessage('Message sent!')
      setCustomMessage('')

      setTimeout(() => {
        onSent?.()
      }, 1500)
    } catch {
      // Error is handled in context
    } finally {
      setSending(false)
    }
  }

  const toggleExcludeUser = (userId: number) => {
    setExcludedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Send a Message</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Success message */}
      {sentMessage && (
        <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-lg text-center font-medium">
          {sentMessage}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg text-center">
          {error}
        </div>
      )}

      {/* Quick message buttons */}
      <div className="mb-5">
        <p className="text-sm text-gray-600 mb-3">Quick messages:</p>
        <div className="grid grid-cols-2 gap-2">
          {quickMessages.map(msg => (
            <button
              key={msg.id}
              onClick={() => handleQuickMessage(msg.id)}
              disabled={sending || isLoading}
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-yellow-50 border border-gray-200 hover:border-yellow-300 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-2xl">{msg.emoji}</span>
              <span className="text-sm font-medium text-gray-700">{msg.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom message input */}
      <div className="mb-5">
        <label className="text-sm text-gray-600 mb-2 block">Or write your own:</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            disabled={sending || isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleCustomMessage()
              }
            }}
          />
          <button
            onClick={handleCustomMessage}
            disabled={!customMessage.trim() || sending || isLoading}
            className="px-4 py-2 bg-yellow-500 text-white font-medium rounded-xl hover:bg-yellow-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>

      {/* Send to all checkbox */}
      <div className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sendToAll}
            onChange={(e) => setSendToAll(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
          />
          <span className="text-sm text-gray-700">Send to everyone checked in</span>
        </label>
      </div>

      {/* Recipient selection (when not sending to all) */}
      {!sendToAll && recipients.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-600 mb-3">Exclude from message:</p>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {recipients.map(recipient => (
              <label
                key={recipient.id}
                className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={excludedUsers.has(recipient.id)}
                  onChange={() => toggleExcludeUser(recipient.id)}
                  className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
                />
                <div className="flex items-center gap-2">
                  {recipient.avatar_url ? (
                    <img
                      src={recipient.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {recipient.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <span className="text-sm text-gray-700">{recipient.name}</span>
                </div>
              </label>
            ))}
          </div>
          {excludedUsers.size > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              {excludedUsers.size} user{excludedUsers.size !== 1 ? 's' : ''} excluded
            </p>
          )}
        </div>
      )}

      {recipients.length === 0 && !sendToAll && (
        <p className="text-sm text-gray-500 text-center py-4">
          No other users are currently checked in
        </p>
      )}
    </div>
  )
}
