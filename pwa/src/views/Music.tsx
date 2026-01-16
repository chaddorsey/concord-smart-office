import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useSpotify, usePresence } from '../stores'
import BottomNav from '../components/BottomNav'

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function ProgressBar({ position, duration }: { position: number; duration: number }) {
  const percent = duration > 0 ? (position / duration) * 100 : 0

  return (
    <div className="w-full">
      <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all duration-1000"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>{formatDuration(position)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  )
}

export default function Music() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus } = useAuth()
  const { isCurrentUserPresent, presentCount } = usePresence()
  const {
    playback,
    isLoading,
    error,
    hasVotedToSkip,
    skipVoteCount,
    skipVotesNeeded,
    play,
    pause,
    nextTrack,
    previousTrack,
    setVolume,
    voteToSkip,
    canControl
  } = useSpotify()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  const track = playback?.track

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-green-600 text-white px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="p-2 -ml-2 hover:bg-green-500 rounded-lg transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">Music</h1>
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
            <span>Scan in to vote and control music</span>
          </div>
        )}

        {/* Now Playing Card */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !track ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
              <p>Nothing playing</p>
              <p className="text-sm mt-1">Start playing something on Spotify</p>
            </div>
          ) : (
            <>
              {/* Album Art */}
              <div className="aspect-square bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                {track.albumArt ? (
                  <img
                    src={track.albumArt}
                    alt={track.album}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg className="w-32 h-32 text-white/50" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                )}
              </div>

              {/* Track Info */}
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 truncate">{track.title}</h2>
                <p className="text-gray-600 truncate">{track.artist}</p>
                {track.album && (
                  <p className="text-gray-500 text-sm truncate mt-1">{track.album}</p>
                )}

                {/* Progress Bar */}
                <div className="mt-4">
                  <ProgressBar position={track.position} duration={track.duration} />
                </div>

                {/* Playback Controls */}
                <div className="flex items-center justify-center gap-4 mt-6">
                  <button
                    onClick={previousTrack}
                    disabled={!canControl}
                    className="p-3 text-gray-700 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition"
                    title={canControl ? 'Previous track' : 'Scan in to control'}
                  >
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                    </svg>
                  </button>

                  <button
                    onClick={playback?.isPlaying ? pause : play}
                    disabled={!canControl}
                    className="p-4 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                    title={canControl ? (playback?.isPlaying ? 'Pause' : 'Play') : 'Scan in to control'}
                  >
                    {playback?.isPlaying ? (
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                      </svg>
                    ) : (
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>

                  <button
                    onClick={nextTrack}
                    disabled={!canControl}
                    className="p-3 text-gray-700 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition"
                    title={canControl ? 'Next track' : 'Scan in to control'}
                  >
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Skip Vote Card */}
        {track && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Vote to Skip</h3>
              <span className="text-sm text-gray-500">
                {skipVoteCount} / {skipVotesNeeded} votes
              </span>
            </div>

            {/* Vote Progress */}
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-orange-500 transition-all"
                style={{ width: `${Math.min(100, (skipVoteCount / skipVotesNeeded) * 100)}%` }}
              />
            </div>

            <p className="text-sm text-gray-600 mb-4">
              {presentCount === 1
                ? '1 person is in the office. 1 vote needed to skip.'
                : `${presentCount} people are in the office. ${skipVotesNeeded} votes needed to skip.`}
            </p>

            <button
              onClick={voteToSkip}
              disabled={!canControl || hasVotedToSkip}
              className={`w-full py-3 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                hasVotedToSkip
                  ? 'bg-orange-100 text-orange-700 cursor-default'
                  : canControl
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {hasVotedToSkip ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  You voted to skip
                </>
              ) : canControl ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  Vote to Skip This Song
                </>
              ) : (
                'Scan in to vote'
              )}
            </button>
          </div>
        )}

        {/* Volume Control */}
        {track && canControl && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-4">
              <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              <input
                type="range"
                min="0"
                max="100"
                value={playback?.volume || 50}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
              />
              <span className="text-sm text-gray-600 w-8 text-right">
                {Math.round(playback?.volume || 50)}
              </span>
            </div>
          </div>
        )}

        {/* Device Info */}
        {playback && (
          <div className="text-center text-sm text-gray-500">
            Playing on {playback.deviceName}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
