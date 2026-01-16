import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, usePresence, useSandTable } from '../stores'
import BottomNav from '../components/BottomNav'

// Pattern icons/colors for visual variety
const patternStyles = [
  { bg: 'from-amber-400 to-orange-500', icon: 'spiral' },
  { bg: 'from-blue-400 to-indigo-500', icon: 'wave' },
  { bg: 'from-green-400 to-teal-500', icon: 'circle' },
  { bg: 'from-purple-400 to-pink-500', icon: 'star' },
  { bg: 'from-red-400 to-rose-500', icon: 'diamond' },
  { bg: 'from-cyan-400 to-blue-500', icon: 'flow' },
]

function getPatternStyle(index: number) {
  return patternStyles[index % patternStyles.length]
}

function PatternIcon({ type }: { type: string }) {
  switch (type) {
    case 'spiral':
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )
    case 'wave':
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      )
    case 'circle':
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" strokeWidth={2} />
        </svg>
      )
    case 'star':
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      )
    default:
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
  }
}

export default function SandTable() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus } = useAuth()
  const { isCurrentUserPresent, presentCount } = usePresence()
  const {
    oasis,
    isLoading,
    error,
    voting,
    votesNeeded,
    leadingPattern,
    pause,
    resume,
    voteForPattern,
    clearVote,
    getVotesForPattern,
    canControl
  } = useSandTable()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  const { currentPattern, availablePatterns, status, isPlaying } = oasis

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-amber-600 text-white px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="p-2 -ml-2 hover:bg-amber-500 rounded-lg transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">Sand Table</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto p-4 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Not Scanned In Warning */}
        {!isCurrentUserPresent && (
          <div className="bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Scan in to vote on patterns</span>
          </div>
        )}

        {/* Now Playing Card */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-8 text-white text-center">
            {isLoading ? (
              <div className="py-8">
                <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : (
              <>
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center">
                  {status === 'playing' ? (
                    <svg className="w-12 h-12 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  )}
                </div>
                <h2 className="text-2xl font-bold">{currentPattern || 'No Pattern'}</h2>
                <p className="text-white/80 mt-1 capitalize">{status}</p>
              </>
            )}
          </div>

          {/* Playback Controls */}
          <div className="p-4 flex justify-center">
            <button
              onClick={isPlaying ? pause : resume}
              disabled={!canControl || !currentPattern}
              className="px-6 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              {isPlaying ? (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Resume
                </>
              )}
            </button>
          </div>
        </div>

        {/* Voting Status */}
        {leadingPattern && leadingPattern.votes > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Next Pattern Vote</span>
              <span className="text-sm text-gray-500">
                {leadingPattern.votes} / {votesNeeded} votes needed
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${Math.min(100, (leadingPattern.votes / votesNeeded) * 100)}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Leading: <span className="font-medium">{leadingPattern.name}</span>
            </p>
          </div>
        )}

        {/* Pattern Selection */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Vote for Next Pattern</h3>
            {voting.userVote && (
              <button
                onClick={clearVote}
                className="text-sm text-amber-600 hover:text-amber-700"
              >
                Clear vote
              </button>
            )}
          </div>

          <p className="text-sm text-gray-600 mb-4">
            {presentCount === 1
              ? '1 person in office. 1 vote needed to change pattern.'
              : `${presentCount} people in office. ${votesNeeded} votes needed to change pattern.`}
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : availablePatterns.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No patterns available</p>
              <p className="text-sm mt-1">Connect Oasis Mini to Home Assistant</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {availablePatterns.map((pattern, index) => {
                const style = getPatternStyle(index)
                const votes = getVotesForPattern(pattern.name)
                const isVoted = voting.userVote === pattern.name
                const isCurrent = currentPattern === pattern.name

                return (
                  <button
                    key={pattern.id}
                    onClick={() => voteForPattern(pattern.name)}
                    disabled={!canControl || isCurrent}
                    className={`relative p-4 rounded-xl text-left transition ${
                      isVoted
                        ? 'ring-2 ring-amber-500 bg-amber-50'
                        : isCurrent
                        ? 'bg-gray-100 cursor-default'
                        : canControl
                        ? 'bg-gray-50 hover:bg-gray-100'
                        : 'bg-gray-50 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${style.bg} text-white flex items-center justify-center mb-2`}>
                      <PatternIcon type={style.icon} />
                    </div>
                    <p className="font-medium text-gray-900 text-sm truncate">{pattern.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {isCurrent ? 'Now playing' : votes > 0 ? `${votes} vote${votes > 1 ? 's' : ''}` : 'No votes'}
                    </p>

                    {isVoted && (
                      <div className="absolute top-2 right-2">
                        <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      </div>
                    )}

                    {isCurrent && (
                      <div className="absolute top-2 right-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full block animate-pulse" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="text-center text-sm text-gray-500">
          <p>Oasis Mini Sand Table</p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
