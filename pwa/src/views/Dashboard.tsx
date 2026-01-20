import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, usePresence, useMusic, useOasis, usePhotoFrames } from '../stores'
import BottomNav from '../components/BottomNav'

function formatArrivalTime(isoString: string | null): string {
  if (!isoString) return ''

  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// Concord Consortium Logo - white version for dark backgrounds
const CONCORD_LOGO_URL = 'https://concord.org/wp-content/themes/concord2017/images/concord-logo.svg'

export default function Dashboard() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus, logout } = useAuth()
  const { staff, presentCount, isCurrentUserPresent, isLoading, error, refresh } = usePresence()
  const { nowPlaying, queue: musicQueue } = useMusic()
  const { status: oasisStatus, haStatus, patternQueue } = useOasis()
  const { frames, mediaLibrary } = usePhotoFrames()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  const presentStaff = staff.filter(s => s.isPresent)

  // Get the most recently arrived person (sorted by arrivedAt descending)
  const mostRecentPerson = presentStaff.length > 0
    ? [...presentStaff].sort((a, b) => {
        if (!a.arrivedAt) return 1
        if (!b.arrivedAt) return -1
        return new Date(b.arrivedAt).getTime() - new Date(a.arrivedAt).getTime()
      })[0]
    : null

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white px-4 py-4 shadow-lg border-b border-gray-100">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <img
            src={CONCORD_LOGO_URL}
            alt="Concord Consortium"
            className="h-10 w-auto"
          />
          <div className="flex items-center gap-2">
            <Link
              to="/scan"
              className="bg-concord-teal text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-concord-teal/90 transition"
            >
              {isCurrentUserPresent ? 'Scan Out' : 'Scan In'}
            </Link>
            <button
              onClick={logout}
              className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-600"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Connection Status */}
      {connectionStatus !== 'authenticated' && (
        <div className="bg-concord-mango text-white px-4 py-2 text-center text-sm">
          {connectionStatus === 'connecting' && 'Connecting to Home Assistant...'}
          {connectionStatus === 'disconnected' && 'Disconnected from Home Assistant'}
          {connectionStatus === 'error' && 'Connection error - retrying...'}
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-lg mx-auto p-4 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={refresh} className="font-medium hover:underline">
              Retry
            </button>
          </div>
        )}

        {/* Presence Status Card */}
        <Link to="/whos-in" className="block bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 font-museo">Who's In</h2>
            <span className="bg-concord-green/20 text-concord-green px-3 py-1 rounded-full text-sm font-medium">
              {presentCount} {presentCount === 1 ? 'person' : 'people'}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-concord-teal border-t-transparent rounded-full animate-spin" />
            </div>
          ) : presentStaff.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">No one is in the office yet</p>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              {/* Most recent person with square avatar */}
              {mostRecentPerson?.avatarUrl ? (
                <img
                  src={mostRecentPerson.avatarUrl}
                  alt={mostRecentPerson.name}
                  className="w-14 h-14 rounded-lg object-cover object-top flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-concord-teal/20 text-concord-teal flex items-center justify-center font-medium text-lg flex-shrink-0">
                  {mostRecentPerson?.avatarInitials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium truncate">{mostRecentPerson?.name}</p>
                <p className="text-gray-500 text-sm">
                  Arrived {formatArrivalTime(mostRecentPerson?.arrivedAt || null)}
                </p>
                {presentCount > 1 && (
                  <p className="text-concord-teal text-sm mt-0.5">
                    +{presentCount - 1} more {presentCount === 2 ? 'person' : 'people'}
                  </p>
                )}
              </div>
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </Link>

        {/* Now Playing Card */}
        <Link to="/music" className="block bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 font-museo">Now Playing</h2>
            {musicQueue.length > 0 && (
              <span className="bg-concord-orange/20 text-concord-orange px-2 py-1 rounded-full text-xs font-medium">
                {musicQueue.length} queued
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-concord-green to-concord-teal rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
              {nowPlaying?.thumbnail ? (
                <img
                  src={nowPlaying.thumbnail}
                  alt={nowPlaying.title || 'Album art'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {nowPlaying ? (
                <>
                  <p className="text-gray-900 font-medium truncate">{nowPlaying.title || 'Unknown Track'}</p>
                  <p className="text-gray-500 text-sm truncate">{nowPlaying.artist || 'Unknown Artist'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-concord-green text-xs">
                      <span className="w-2 h-2 bg-concord-green rounded-full animate-pulse" />
                      Playing
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-500 font-medium">Nothing playing</p>
                  <p className="text-gray-400 text-sm">Tap to browse music</p>
                </>
              )}
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          {!isCurrentUserPresent && (
            <p className="text-sm text-concord-orange mt-4 bg-concord-mango/20 px-3 py-2 rounded-lg">
              Scan in to vote on music
            </p>
          )}
        </Link>

        {/* Sand Table Card */}
        <Link to="/sand" className="block bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 font-museo">Sand Table</h2>
            {patternQueue.length > 0 && (
              <span className="bg-concord-mango/20 text-concord-orange px-2 py-1 rounded-full text-xs font-medium">
                {patternQueue.length} queued
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-concord-mango to-concord-orange rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
              {(haStatus?.currentPattern?.thumbnailUrl || oasisStatus?.currentPattern?.thumbnail_url) ? (
                <img
                  src={haStatus?.currentPattern?.thumbnailUrl || oasisStatus?.currentPattern?.thumbnail_url || ''}
                  alt={haStatus?.currentPattern?.name || oasisStatus?.currentPattern?.pattern_name || 'Pattern'}
                  className="w-full h-full object-cover"
                />
              ) : (haStatus?.state === 'playing' || oasisStatus?.isRunning) ? (
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12c2-4 4-6 8-6s6 4 8 2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16c3-3 5-5 9-3s5 1 7-1" />
                  <circle cx="20" cy="15" r="2.5" fill="currentColor" stroke="none" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12c2-4 4-6 8-6s6 4 8 2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16c3-3 5-5 9-3s5 1 7-1" />
                  <circle cx="20" cy="15" r="2.5" fill="currentColor" stroke="none" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {(haStatus?.currentPattern?.name || oasisStatus?.currentPattern) ? (
                <>
                  <p className="text-gray-900 font-medium truncate">
                    {haStatus?.currentPattern?.name || oasisStatus?.currentPattern?.pattern_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {(haStatus?.state === 'playing' || oasisStatus?.isRunning) ? (
                      <span className="flex items-center gap-1 text-concord-orange text-xs">
                        <span className="w-2 h-2 bg-concord-orange rounded-full animate-pulse" />
                        Drawing
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Idle</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-500 font-medium">No pattern</p>
                  <p className="text-gray-400 text-sm">Tap to add patterns</p>
                </>
              )}
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          {!isCurrentUserPresent && (
            <p className="text-sm text-concord-orange mt-4 bg-concord-mango/20 px-3 py-2 rounded-lg">
              Scan in to vote on patterns
            </p>
          )}
        </Link>

        {/* Cafe Screens Card */}
        <Link to="/photos" className="block bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 font-museo">Cafe Screens</h2>
            <span className="bg-concord-teal/20 text-concord-teal px-2 py-1 rounded-full text-xs font-medium">
              {frames.filter(f => f.isOnline).length}/{frames.length || 4} online
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-concord-teal to-concord-green rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              {mediaLibrary.length > 0 ? (
                <>
                  <p className="text-gray-900 font-medium truncate">{mediaLibrary[0]?.title || 'Media'}</p>
                  <p className="text-gray-500 text-sm truncate">{mediaLibrary.length} items in library</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-concord-teal text-xs">
                      <span className="w-2 h-2 bg-concord-teal rounded-full" />
                      {frames.filter(f => f.isOnline).length} frames online
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-500 font-medium">No media</p>
                  <p className="text-gray-400 text-sm">Tap to browse videos</p>
                </>
              )}
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          {!isCurrentUserPresent && (
            <p className="text-sm text-concord-orange mt-4 bg-concord-mango/20 px-3 py-2 rounded-lg">
              Scan in to vote on videos
            </p>
          )}
        </Link>
      </main>

      <BottomNav />
    </div>
  )
}
