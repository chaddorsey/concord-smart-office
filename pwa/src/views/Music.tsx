import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useMusic, usePresence, VOLUME_LABELS } from '../stores'
import BottomNav from '../components/BottomNav'

type VolumeLevel = 'super_quiet' | 'soft' | 'medium'

export default function Music() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus } = useAuth()
  const { isCurrentUserPresent } = usePresence()
  const {
    tastes,
    userTastes,
    userVolume,
    queue,
    nowPlaying,
    upcoming,
    schedulerStatus,
    stats,
    trashRateLimit,
    isLoading,
    error,
    canControl,
    setUserTastes,
    setUserVolume,
    submitTrack,
    vote,
    trashSubmission,
    skipTrack,
    refresh
  } = useMusic()

  const [submitUrl, setSubmitUrl] = useState('')
  const [submitTitle, setSubmitTitle] = useState('')
  const [submitArtist, setSubmitArtist] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showSubmitForm, setShowSubmitForm] = useState(false)
  const [trashWarning, setTrashWarning] = useState<string | null>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  // Handle taste selection (up to 3)
  const handleTasteToggle = async (tasteId: string) => {
    if (!canControl) return

    let newTastes: string[]
    if (userTastes.includes(tasteId)) {
      newTastes = userTastes.filter(t => t !== tasteId)
    } else if (userTastes.length < 3) {
      newTastes = [...userTastes, tasteId]
    } else {
      return // Max 3 tastes
    }

    try {
      await setUserTastes(newTastes)
    } catch (err) {
      console.error('Failed to update tastes:', err)
    }
  }

  // Handle volume preference change
  const handleVolumeChange = async (volume: VolumeLevel) => {
    if (!canControl) return

    try {
      await setUserVolume(volume)
    } catch (err) {
      console.error('Failed to update volume:', err)
    }
  }

  // Handle track submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!submitUrl.trim() || !canControl) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      await submitTrack(
        submitUrl.trim(),
        submitTitle.trim() || undefined,
        submitArtist.trim() || undefined
      )
      setSubmitUrl('')
      setSubmitTitle('')
      setSubmitArtist('')
      setShowSubmitForm(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit track')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle voting
  const handleVote = async (submissionId: number, value: -1 | 0 | 1) => {
    if (!canControl) return

    try {
      await vote(submissionId, value)
    } catch (err) {
      console.error('Failed to vote:', err)
    }
  }

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
          <h1 className="text-xl font-black font-museo">Music</h1>
          <button
            onClick={refresh}
            className="p-2 hover:bg-green-500 rounded-lg transition"
            title="Refresh"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
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
            <span>Scan in to submit tracks and vote</span>
          </div>
        )}

        {/* Scheduler Status */}
        {schedulerStatus && (
          <div className={`text-sm px-4 py-2 rounded-lg flex items-center gap-2 ${
            schedulerStatus.connected && schedulerStatus.running && !schedulerStatus.paused
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              schedulerStatus.connected && schedulerStatus.running && !schedulerStatus.paused
                ? 'bg-green-500'
                : 'bg-gray-400'
            }`} />
            {schedulerStatus.paused
              ? 'Music paused'
              : schedulerStatus.running
              ? 'Now playing'
              : 'Not connected'}
          </div>
        )}

        {/* Now Playing Card */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Now Playing</h2>
          </div>

          {isLoading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !nowPlaying ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
              <p>Nothing playing</p>
              <p className="text-sm mt-1">Submit a track or wait for the scheduler</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center gap-4">
                {nowPlaying.thumbnail ? (
                  <img
                    src={nowPlaying.thumbnail}
                    alt={nowPlaying.title || 'Album art'}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-8 h-8 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {nowPlaying.title || 'Unknown Track'}
                  </h3>
                  <p className="text-gray-600 text-sm truncate">
                    {nowPlaying.artist || 'Unknown Artist'}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    {nowPlaying.source === 'submission' ? 'User submission' : `Taste: ${nowPlaying.taste_id}`}
                  </p>
                </div>
                {canControl && (
                  <button
                    onClick={skipTrack}
                    className="p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                    title="Skip"
                  >
                    <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Taste Preferences */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Your Taste</h2>
            <span className="text-sm text-gray-500">{userTastes.length}/3 selected</span>
          </div>
          <div className="p-4 grid grid-cols-2 gap-2">
            {tastes.filter(t => t.id !== 'default').map(taste => (
              <button
                key={taste.id}
                onClick={() => handleTasteToggle(taste.id)}
                disabled={!canControl || (userTastes.length >= 3 && !userTastes.includes(taste.id))}
                className={`p-3 rounded-lg text-left transition ${
                  userTastes.includes(taste.id)
                    ? 'bg-green-100 border-2 border-green-500 text-green-700'
                    : canControl
                    ? 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                    : 'bg-gray-50 border-2 border-transparent opacity-50'
                }`}
              >
                <span className="font-medium block">{taste.name}</span>
                <span className="text-xs text-gray-500">{taste.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Volume Preference */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Volume Preference</h2>
            <p className="text-sm text-gray-500 mt-1">Music plays at the quietest preference</p>
          </div>
          <div className="p-4 flex gap-2">
            {(['super_quiet', 'soft', 'medium'] as VolumeLevel[]).map(vol => (
              <button
                key={vol}
                onClick={() => handleVolumeChange(vol)}
                disabled={!canControl}
                className={`flex-1 py-3 px-2 rounded-lg text-sm font-medium transition ${
                  userVolume === vol
                    ? 'bg-green-600 text-white'
                    : canControl
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {VOLUME_LABELS[vol]}
              </button>
            ))}
          </div>
          {stats && (
            <div className="px-4 pb-4 text-sm text-gray-500">
              Current office volume: <span className="font-medium">{VOLUME_LABELS[stats.current_volume as VolumeLevel] || stats.current_volume}</span>
            </div>
          )}
        </div>

        {/* Submission Queue */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Queue</h2>
            {canControl && (
              <button
                onClick={() => setShowSubmitForm(!showSubmitForm)}
                className="text-green-600 hover:text-green-700 font-medium text-sm"
              >
                {showSubmitForm ? 'Cancel' : '+ Add Track'}
              </button>
            )}
          </div>

          {/* Submit Form */}
          {showSubmitForm && canControl && (
            <form onSubmit={handleSubmit} className="p-4 bg-gray-50 border-b border-gray-100 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Spotify URL *
                </label>
                <input
                  type="text"
                  value={submitUrl}
                  onChange={e => setSubmitUrl(e.target.value)}
                  placeholder="https://open.spotify.com/track/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title (optional)
                  </label>
                  <input
                    type="text"
                    value={submitTitle}
                    onChange={e => setSubmitTitle(e.target.value)}
                    placeholder="Track name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Artist (optional)
                  </label>
                  <input
                    type="text"
                    value={submitArtist}
                    onChange={e => setSubmitArtist(e.target.value)}
                    placeholder="Artist name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>
              {submitError && (
                <p className="text-red-600 text-sm">{submitError}</p>
              )}
              <button
                type="submit"
                disabled={isSubmitting || !submitUrl.trim()}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Track'}
              </button>
            </form>
          )}

          {/* Trash Warning */}
          {trashWarning && (
            <div className="mx-4 mb-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{trashWarning}</span>
            </div>
          )}

          {/* Trash Rate Limit Warning */}
          {trashRateLimit.remaining === 0 && trashRateLimit.resetsIn && (
            <div className="mx-4 mb-2 text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-2">
              Trash limit reached. Resets in {trashRateLimit.resetsIn} min. Use downvote to vote items off instead.
            </div>
          )}

          {/* Queue List */}
          {queue.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No tracks in queue</p>
              <p className="text-sm mt-1">Submit a Spotify track URL to add to the queue</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {queue.map((item, index) => {
                const netVotes = item.upvotes - item.downvotes

                return (
                  <div key={item.id} className="p-3 flex items-center gap-3">
                    {/* Position number */}
                    <span className="w-5 text-center text-gray-400 text-sm font-medium flex-shrink-0">
                      {index + 1}
                    </span>

                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-900">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title || 'Album art'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-400 to-green-600">
                          <svg className="w-6 h-6 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Track Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">
                        {item.title || 'Unknown Track'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {item.artist || 'Unknown Artist'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        <span>by {item.submitted_by_name}</span>
                        {netVotes !== 0 && (
                          <span className={`px-1.5 py-0.5 rounded ${
                            netVotes > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {netVotes > 0 ? '+' : ''}{netVotes}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Voting & Trash Controls */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Thumbs Up */}
                      <button
                        onClick={() => handleVote(item.id, item.user_vote === 1 ? 0 : 1)}
                        disabled={!canControl}
                        className={`p-1.5 rounded-lg transition ${
                          item.user_vote === 1
                            ? 'bg-green-100 text-green-600'
                            : canControl
                            ? 'text-gray-400 hover:bg-green-50 hover:text-green-600'
                            : 'text-gray-300'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title="Keep in queue longer"
                      >
                        <svg className="w-5 h-5" fill={item.user_vote === 1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                        </svg>
                      </button>

                      {/* Thumbs Down */}
                      <button
                        onClick={() => handleVote(item.id, item.user_vote === -1 ? 0 : -1)}
                        disabled={!canControl}
                        className={`p-1.5 rounded-lg transition ${
                          item.user_vote === -1
                            ? 'bg-red-100 text-red-600'
                            : canControl
                            ? 'text-gray-400 hover:bg-red-50 hover:text-red-600'
                            : 'text-gray-300'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title="Remove from queue sooner"
                      >
                        <svg className="w-5 h-5" fill={item.user_vote === -1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                        </svg>
                      </button>

                      {/* Trash */}
                      <button
                        onClick={async () => {
                          const result = await trashSubmission(item.id)
                          if (result.warning || result.error) {
                            setTrashWarning(result.warning || result.error || null)
                            setTimeout(() => setTrashWarning(null), 5000)
                          }
                        }}
                        disabled={!canControl || trashRateLimit.remaining === 0}
                        className={`p-1.5 rounded-lg transition ${
                          trashRateLimit.remaining === 0
                            ? 'text-gray-300 cursor-not-allowed'
                            : canControl
                            ? 'text-gray-400 hover:bg-red-50 hover:text-red-600'
                            : 'text-gray-300'
                        } disabled:opacity-50`}
                        title={trashRateLimit.remaining === 0
                          ? `Resets in ${trashRateLimit.resetsIn || '?'} min`
                          : `Remove immediately (${trashRateLimit.remaining} left)`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Upcoming Tracks Preview */}
        {upcoming.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Coming Up</h2>
              <p className="text-sm text-gray-500">Preview of upcoming tracks</p>
            </div>
            <div className="divide-y divide-gray-100">
              {upcoming.slice(0, 5).map((track, index) => (
                <div key={`${track.track_url}-${index}`} className="p-3 flex items-center gap-3">
                  {/* Thumbnail or source badge */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    {track.thumbnail ? (
                      <img
                        src={track.thumbnail}
                        alt={track.title || 'Album art'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center text-xs font-medium ${
                        track.source === 'submission'
                          ? 'bg-green-100 text-green-600'
                          : 'bg-purple-100 text-purple-600'
                      }`}>
                        {track.source === 'submission' ? 'Q' : track.taste_id?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate text-sm">
                      {track.title || 'Unknown Track'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {track.artist || 'Unknown Artist'}
                      {track.preview && <span className="text-purple-500 ml-1">(predicted)</span>}
                    </p>
                  </div>
                  {/* Source indicator */}
                  <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                    track.source === 'submission'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {track.source === 'submission' ? 'Queue' : track.taste_id}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Weights */}
        {stats && Object.keys(stats.current_weights).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Current Mix</h2>
              <p className="text-sm text-gray-500">Based on who's in the office</p>
            </div>
            <div className="p-4 space-y-2">
              {Object.entries(stats.current_weights)
                .sort(([, a], [, b]) => b - a)
                .map(([taste, weight]) => (
                  <div key={taste} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-600 capitalize">{taste}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${Math.round(weight * 100)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm text-gray-500">
                      {Math.round(weight * 100)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
