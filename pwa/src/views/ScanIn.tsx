import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'

interface StaffMember {
  id: number
  name: string
  email: string
  avatar_url: string | null
}

interface PresenceInfo {
  user_id: number
  user_name: string
  user_email: string
  avatar_url: string | null
  status: string
  checked_in_at: string | null
}

const BACKEND_URL = ''

export default function ScanIn() {
  const navigate = useNavigate()

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [presence, setPresence] = useState<PresenceInfo[]>([])
  const [selectedEmail, setSelectedEmail] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch staff list and presence data
  const fetchData = useCallback(async () => {
    try {
      const [staffRes, presenceRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/staff`, {
          credentials: 'include',
          headers: { 'ngrok-skip-browser-warning': 'true' }
        }),
        fetch(`${BACKEND_URL}/api/presence`, {
          credentials: 'include',
          headers: { 'ngrok-skip-browser-warning': 'true' }
        })
      ])

      if (!staffRes.ok) throw new Error('Failed to fetch staff')
      if (!presenceRes.ok) throw new Error('Failed to fetch presence')

      const staffData = await staffRes.json()
      const presenceData = await presenceRes.json()

      setStaff(staffData.staff || [])
      setPresence(presenceData.users || [])
      setError(null)
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Check if selected user is currently checked in (match by email)
  const selectedUserPresence = presence.find(p => p.user_email === selectedEmail)
  const isCheckedIn = selectedUserPresence?.status === 'in'
  const selectedStaff = staff.find(s => s.email === selectedEmail)

  // Get avatar URL with fallback
  const getAvatarUrl = (avatarUrl: string | null) => {
    if (!avatarUrl) return null
    // If it's a relative path, prepend the backend URL
    if (avatarUrl.startsWith('/')) {
      return `${BACKEND_URL}${avatarUrl}`
    }
    return avatarUrl
  }

  const handleCheckIn = async () => {
    if (!selectedEmail) return

    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`${BACKEND_URL}/api/staff/checkin`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ email: selectedEmail })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Check-in failed')
      }

      const data = await res.json()
      setSuccessMessage(`${data.user.name} checked in!`)

      // Refresh data and redirect after delay
      await fetchData()
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      console.error('Check-in failed:', err)
      setError(err instanceof Error ? err.message : 'Check-in failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCheckOut = async () => {
    if (!selectedEmail) return

    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`${BACKEND_URL}/api/staff/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ email: selectedEmail })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Check-out failed')
      }

      const data = await res.json()
      setSuccessMessage(`${data.user.name} checked out!`)

      // Refresh data and redirect after delay
      await fetchData()
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      console.error('Check-out failed:', err)
      setError(err instanceof Error ? err.message : 'Check-out failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="p-2 -ml-2 hover:bg-blue-500 rounded-lg transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-black font-museo">Check In / Out</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto p-4 space-y-6">
        {/* Loading State */}
        {isLoading && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600">Loading staff...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Success State */}
        {successMessage && (
          <div className="bg-green-50 rounded-xl shadow-sm p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-700 font-medium text-lg">{successMessage}</p>
            <p className="text-gray-500 text-sm mt-2">Redirecting to dashboard...</p>
          </div>
        )}

        {/* Staff Selector */}
        {!isLoading && !successMessage && (
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
            <div>
              <label htmlFor="staff-select" className="block text-sm font-medium text-gray-700 mb-2">
                Who are you?
              </label>
              <select
                id="staff-select"
                value={selectedEmail}
                onChange={(e) => setSelectedEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white text-lg"
                disabled={isSubmitting}
              >
                <option value="">Select your name...</option>
                {staff.map((person) => (
                  <option key={person.email} value={person.email}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Selected User Preview */}
            {selectedStaff && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                {selectedStaff.avatar_url ? (
                  <img
                    src={getAvatarUrl(selectedStaff.avatar_url) || ''}
                    alt={selectedStaff.name}
                    className="w-16 h-16 rounded-lg object-cover object-top"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-medium text-xl">
                    {selectedStaff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-lg">{selectedStaff.name}</p>
                  <p className={`text-sm ${isCheckedIn ? 'text-green-600' : 'text-gray-500'}`}>
                    {isCheckedIn ? 'Currently in office' : 'Not checked in'}
                  </p>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isCheckedIn
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {isCheckedIn ? 'In' : 'Out'}
                </div>
              </div>
            )}

            {/* Check In/Out Button */}
            {selectedEmail && (
              <button
                onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
                disabled={isSubmitting}
                className={`w-full py-4 rounded-xl font-medium text-lg transition ${
                  isSubmitting
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : isCheckedIn
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    Processing...
                  </span>
                ) : isCheckedIn ? (
                  'Check Out'
                ) : (
                  'Check In'
                )}
              </button>
            )}
          </div>
        )}

        {/* Currently In Office */}
        {!isLoading && !successMessage && presence.filter(p => p.status === 'in').length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Currently in office</h2>
            <div className="flex flex-wrap gap-2">
              {presence
                .filter(p => p.status === 'in')
                .map((person) => (
                  <div
                    key={person.user_email}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full"
                  >
                    {person.avatar_url ? (
                      <img
                        src={getAvatarUrl(person.avatar_url) || ''}
                        alt={person.user_name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-green-200 text-green-700 flex items-center justify-center text-xs font-medium">
                        {person.user_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                    )}
                    <span className="text-sm text-green-700">{person.user_name.split(' ')[0]}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="text-center text-sm text-gray-500 space-y-1">
          <p>Select your name from the list above</p>
          <p className="text-xs">then tap Check In or Check Out</p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
