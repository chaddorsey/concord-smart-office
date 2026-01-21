import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const BACKEND_URL = ''
const STORAGE_KEY = 'concordhq_last_checkin_email'

interface CheckInResult {
  status: 'loading' | 'success' | 'already_in' | 'not_found' | 'error'
  userName?: string
  message?: string
}

export default function QuickCheckIn() {
  const navigate = useNavigate()
  const [result, setResult] = useState<CheckInResult>({ status: 'loading' })

  useEffect(() => {
    const attemptQuickCheckIn = async () => {
      // Check if user has checked in before
      const savedEmail = localStorage.getItem(STORAGE_KEY)

      if (!savedEmail) {
        // No previous check-in - redirect to regular scan page
        console.log('[QuickCheckIn] No saved email, redirecting to scan')
        navigate('/scan', { replace: true })
        return
      }

      console.log('[QuickCheckIn] Found saved email:', savedEmail)

      try {
        // First check current presence status
        const presenceRes = await fetch(`${BACKEND_URL}/api/presence`, {
          credentials: 'include',
          headers: { 'ngrok-skip-browser-warning': 'true' }
        })

        if (!presenceRes.ok) {
          throw new Error('Failed to fetch presence')
        }

        const presenceData = await presenceRes.json()
        const users = presenceData.users || []
        const existingPresence = users.find((u: any) => u.user_email === savedEmail)

        // If already checked in, show that status
        if (existingPresence?.status === 'in') {
          setResult({
            status: 'already_in',
            userName: existingPresence.user_name,
            message: 'You\'re already checked in!'
          })
          setTimeout(() => navigate('/dashboard'), 2000)
          return
        }

        // Attempt to check in
        const checkinRes = await fetch(`${BACKEND_URL}/api/staff/checkin`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ email: savedEmail })
        })

        if (!checkinRes.ok) {
          const errorData = await checkinRes.json()

          // If user not found (maybe staff list changed), clear saved email
          if (checkinRes.status === 404) {
            localStorage.removeItem(STORAGE_KEY)
            setResult({
              status: 'not_found',
              message: 'Your profile wasn\'t found. Please select your name again.'
            })
            setTimeout(() => navigate('/scan'), 2500)
            return
          }

          throw new Error(errorData.error || 'Check-in failed')
        }

        const data = await checkinRes.json()
        setResult({
          status: 'success',
          userName: data.user.name,
          message: 'Welcome back!'
        })

        // Redirect to dashboard after showing success
        setTimeout(() => navigate('/dashboard'), 2000)

      } catch (err) {
        console.error('[QuickCheckIn] Error:', err)
        setResult({
          status: 'error',
          message: err instanceof Error ? err.message : 'Something went wrong'
        })
        setTimeout(() => navigate('/scan'), 3000)
      }
    }

    attemptQuickCheckIn()
  }, [navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-400 to-yellow-500 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
        {result.status === 'loading' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-yellow-100 flex items-center justify-center">
              <div className="animate-spin w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 font-museo mb-2">
              Checking you in...
            </h1>
            <p className="text-gray-500">Just a moment</p>
          </>
        )}

        {result.status === 'success' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-gray-900 font-museo mb-2">
              {result.message}
            </h1>
            <p className="text-xl text-green-600 font-semibold mb-4">
              {result.userName}
            </p>
            <p className="text-gray-500 text-sm">Redirecting to dashboard...</p>
          </>
        )}

        {result.status === 'already_in' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-gray-900 font-museo mb-2">
              {result.message}
            </h1>
            <p className="text-xl text-blue-600 font-semibold mb-4">
              {result.userName}
            </p>
            <p className="text-gray-500 text-sm">Redirecting to dashboard...</p>
          </>
        )}

        {result.status === 'not_found' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-yellow-100 flex items-center justify-center">
              <svg className="w-12 h-12 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-black text-gray-900 font-museo mb-2">
              {result.message}
            </h1>
            <p className="text-gray-500 text-sm">Redirecting...</p>
          </>
        )}

        {result.status === 'error' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-black text-gray-900 font-museo mb-2">
              Oops!
            </h1>
            <p className="text-gray-600 mb-4">{result.message}</p>
            <p className="text-gray-500 text-sm">Redirecting to check-in...</p>
          </>
        )}
      </div>
    </div>
  )
}
