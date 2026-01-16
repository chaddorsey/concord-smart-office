import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores'

export default function Login() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus, connect, connectMock, error: authError } = useAuth()

  const [haUrl, setHaUrl] = useState(() => localStorage.getItem('ha_url') || '')
  const [accessToken, setAccessToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isLoading = connectionStatus === 'connecting'

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard')
    }
  }, [isAuthenticated, navigate])

  // Show auth errors
  useEffect(() => {
    if (authError) {
      setError(authError)
    }
  }, [authError])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!haUrl.trim()) {
      setError('Please enter your Home Assistant URL')
      return
    }

    if (!accessToken.trim()) {
      setError('Please enter your access token')
      return
    }

    try {
      await connect(haUrl.trim(), accessToken.trim())
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
    }
  }

  const handleDemoMode = () => {
    connectMock()
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Smart Office</h1>
          <p className="text-gray-600 mt-2">Connect to Home Assistant</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="ha-url" className="block text-sm font-medium text-gray-700 mb-2">
              Home Assistant URL
            </label>
            <input
              id="ha-url"
              type="url"
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
              placeholder="http://homeassistant.local:8123"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="access-token" className="block text-sm font-medium text-gray-700 mb-2">
              Long-Lived Access Token
            </label>
            <input
              id="access-token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Enter your access token"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-2">
              Create a token in HA: Profile → Long-Lived Access Tokens
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading && (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {isLoading ? 'Connecting...' : 'Connect'}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDemoMode}
            disabled={isLoading}
            className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Try Demo Mode
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Explore the app with simulated data
          </p>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Concord Smart Office PWA
        </p>
      </div>
    </div>
  )
}
