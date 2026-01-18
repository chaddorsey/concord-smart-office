import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, usePresence, useSpotify, useSandTable, usePhotoFrames } from '../stores'
import BottomNav from '../components/BottomNav'

function formatArrivalTime(isoString: string | null): string {
  if (!isoString) return ''

  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus, logout } = useAuth()
  const { staff, presentCount, isCurrentUserPresent, isLoading, error, refresh } = usePresence()
  const { playback, skipVoteCount, skipVotesNeeded } = useSpotify()
  const { oasis, leadingPattern, votesNeeded: sandVotesNeeded } = useSandTable()
  const { frames, mediaLibrary } = usePhotoFrames()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  const presentStaff = staff.filter(s => s.isPresent)

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">Smart Office</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/scan"
              className="bg-white text-blue-600 px-4 py-2 rounded-lg font-medium text-sm hover:bg-blue-50 transition"
            >
              {isCurrentUserPresent ? 'Scan Out' : 'Scan In'}
            </Link>
            <button
              onClick={logout}
              className="p-2 hover:bg-blue-500 rounded-lg transition"
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
        <div className="bg-amber-100 text-amber-800 px-4 py-2 text-center text-sm">
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
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Who's In</h2>
            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
              {presentCount} {presentCount === 1 ? 'person' : 'people'}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : presentStaff.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p>No one is in the office</p>
            </div>
          ) : (
            <div className="space-y-3">
              {presentStaff.map((person) => (
                <div key={person.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium text-sm">
                    {person.avatarInitials}
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium">{person.name}</p>
                    <p className="text-gray-500 text-sm">
                      Arrived {formatArrivalTime(person.arrivedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Now Playing Card */}
        <Link to="/music" className="block bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Now Playing</h2>
            {skipVoteCount > 0 && (
              <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-xs font-medium">
                {skipVoteCount}/{skipVotesNeeded} skip votes
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
              {playback?.track?.albumArt ? (
                <img
                  src={playback.track.albumArt}
                  alt={playback.track.album}
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {playback?.track ? (
                <>
                  <p className="text-gray-900 font-medium truncate">{playback.track.title}</p>
                  <p className="text-gray-500 text-sm truncate">{playback.track.artist}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {playback.isPlaying ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                        Playing
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Paused</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-500 font-medium">Nothing playing</p>
                  <p className="text-gray-400 text-sm">Tap to control Spotify</p>
                </>
              )}
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          {!isCurrentUserPresent && (
            <p className="text-sm text-amber-600 mt-4 bg-amber-50 px-3 py-2 rounded-lg">
              Scan in to vote on music
            </p>
          )}
        </Link>

        {/* Sand Table Card */}
        <Link to="/sand" className="block bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Sand Table</h2>
            {leadingPattern && leadingPattern.votes > 0 && (
              <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-medium">
                {leadingPattern.votes}/{sandVotesNeeded} votes
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              {oasis.status === 'playing' ? (
                <svg className="w-8 h-8 text-white animate-spin" style={{ animationDuration: '3s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {oasis.currentPattern ? (
                <>
                  <p className="text-gray-900 font-medium truncate">{oasis.currentPattern}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {oasis.status === 'playing' ? (
                      <span className="flex items-center gap-1 text-amber-600 text-xs">
                        <span className="w-2 h-2 bg-amber-600 rounded-full animate-pulse" />
                        Drawing
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs capitalize">{oasis.status}</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-500 font-medium">No pattern</p>
                  <p className="text-gray-400 text-sm">Tap to vote on patterns</p>
                </>
              )}
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          {!isCurrentUserPresent && (
            <p className="text-sm text-amber-600 mt-4 bg-amber-50 px-3 py-2 rounded-lg">
              Scan in to vote on patterns
            </p>
          )}
        </Link>

        {/* Photo Frames Card */}
        <Link to="/photos" className="block bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Photo Frames</h2>
            <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full text-xs font-medium">
              {frames.filter(f => f.isOnline).length}/{frames.length || 4} online
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
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
                    <span className="flex items-center gap-1 text-indigo-600 text-xs">
                      <span className="w-2 h-2 bg-indigo-600 rounded-full" />
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
            <p className="text-sm text-amber-600 mt-4 bg-amber-50 px-3 py-2 rounded-lg">
              Scan in to vote on photos
            </p>
          )}
        </Link>
      </main>

      <BottomNav />
    </div>
  )
}
