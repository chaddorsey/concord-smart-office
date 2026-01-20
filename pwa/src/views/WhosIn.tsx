import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import BottomNav from '../components/BottomNav'

interface PresenceInfo {
  user_id: number
  user_name: string
  user_email: string
  avatar_url: string | null
  status: string
  checked_in_at: string | null
}

const BACKEND_URL = ''

function formatFullTime(isoString: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function WhosIn() {
  const [presence, setPresence] = useState<PresenceInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPresence = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/presence`, {
        credentials: 'include',
        headers: { 'ngrok-skip-browser-warning': 'true' }
      })

      if (!res.ok) throw new Error('Failed to fetch presence')

      const data = await res.json()
      setPresence(data.users || [])
      setError(null)
    } catch (err) {
      console.error('Failed to fetch presence:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPresence()
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchPresence, 10000)
    return () => clearInterval(interval)
  }, [fetchPresence])

  // Filter to only people who are checked in and sort by most recent
  const checkedIn = presence
    .filter(p => p.status === 'in')
    .sort((a, b) => {
      if (!a.checked_in_at) return 1
      if (!b.checked_in_at) return -1
      return new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime()
    })

  // Get avatar URL with fallback
  const getAvatarUrl = (avatarUrl: string | null) => {
    if (!avatarUrl) return null
    if (avatarUrl.startsWith('/')) {
      return `${BACKEND_URL}${avatarUrl}`
    }
    return avatarUrl
  }

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <header className="bg-white px-4 py-4 shadow-sm border-b border-gray-100">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Who's In</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto p-4">
        {/* Count Banner */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{checkedIn.length}</p>
              <p className="text-sm text-gray-500">
                {checkedIn.length === 1 ? 'person' : 'people'} in the office
              </p>
            </div>
          </div>
          <Link
            to="/scan"
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-green-700 transition"
          >
            Check In
          </Link>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">
            {error}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && checkedIn.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-600 font-medium mb-1">No one is in the office yet</p>
            <p className="text-gray-500 text-sm">Be the first to check in!</p>
          </div>
        )}

        {/* Staff List */}
        {!isLoading && checkedIn.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {checkedIn.map((person, index) => (
              <div key={person.user_email} className="flex items-center gap-4 p-4">
                {/* Square Avatar */}
                {person.avatar_url ? (
                  <img
                    src={getAvatarUrl(person.avatar_url) || ''}
                    alt={person.user_name}
                    className="w-14 h-14 rounded-lg object-cover object-top flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-medium text-lg flex-shrink-0">
                    {person.user_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium truncate">{person.user_name}</p>
                  <p className="text-gray-500 text-sm">
                    Arrived at {formatFullTime(person.checked_in_at)}
                  </p>
                </div>

                {/* Most recent badge for first person */}
                {index === 0 && (
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0">
                    Most recent
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Refresh hint */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Auto-refreshes every 10 seconds
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
