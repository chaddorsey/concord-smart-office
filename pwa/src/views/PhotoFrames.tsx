import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, usePresence, usePhotoFrames } from '../stores'
import BottomNav from '../components/BottomNav'

export default function PhotoFrames() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus } = useAuth()
  const { isCurrentUserPresent } = usePresence()
  const {
    frames,
    isLoading,
    error,
    selectedFrameId,
    selectFrame,
    getCurrentQueueItem,
    skipToNextQueueItem,
    canControl,
    frameQueues,
    voteQueueItem,
    getQueueItemVote,
    trashQueueItem,
    trashRateLimit
  } = usePhotoFrames()

  const [trashWarning, setTrashWarning] = useState<string | null>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  const selectedFrame = frames.find(f => f.id === selectedFrameId)
  const currentQueueItem = selectedFrameId ? getCurrentQueueItem(selectedFrameId) : null
  const selectedFrameQueue = selectedFrameId ? (frameQueues[selectedFrameId] || []) : []
  const onlineFrames = frames.filter(f => f.isOnline)

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-concord-teal text-white px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="p-2 -ml-2 hover:bg-concord-teal/80 rounded-lg transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-black font-museo">Cafe Screens</h1>
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
          <div className="bg-concord-mango/20 text-concord-orange px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Scan in to control frames and vote</span>
          </div>
        )}

        {/* Trash Warning */}
        {trashWarning && (
          <div className="bg-concord-mango/20 text-concord-orange px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{trashWarning}</span>
          </div>
        )}

        {/* Browse Videos Button */}
        <Link
          to="/browse-videos"
          className="flex items-center justify-center gap-2 py-3 bg-concord-teal text-white rounded-xl font-medium hover:bg-concord-teal/90 transition shadow-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Browse Pixabay Videos
        </Link>

        {/* Frame Selection */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-gray-900 mb-3 font-museo">Select Frame</h3>
          <div className="grid grid-cols-2 gap-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg bg-gray-100 animate-pulse h-20" />
              ))
            ) : (
              frames.map(frame => {
                const queue = frameQueues[frame.id] || []
                return (
                  <button
                    key={frame.id}
                    onClick={() => selectFrame(frame.id === selectedFrameId ? null : frame.id)}
                    className={`p-4 rounded-lg text-left transition ${
                      frame.id === selectedFrameId
                        ? 'bg-concord-teal/10 ring-2 ring-concord-teal'
                        : frame.isOnline
                        ? 'bg-concord-green/10 hover:bg-concord-green/20'
                        : 'bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${
                        frame.isOnline ? 'bg-concord-green' : 'bg-gray-400'
                      }`} />
                      <span className="text-sm font-medium text-gray-700 truncate">
                        Frame {frame.id}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        frame.orientation === 'horizontal' ? 'bg-concord-teal/20 text-concord-teal' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {frame.orientation === 'horizontal' ? 'H' : 'V'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{frame.playlist}</p>
                    {queue.length > 0 && (
                      <p className="text-xs text-concord-teal mt-0.5">
                        Queue: {queue.length} items
                      </p>
                    )}
                  </button>
                )
              })
            )}
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">
            {onlineFrames.length} of {frames.length} frames online
          </p>
        </div>

        {/* Selected Frame Details */}
        {selectedFrame && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Current Media Display */}
            {currentQueueItem ? (
              <div className="aspect-video bg-gray-900 relative">
                {currentQueueItem.type === 'video' ? (
                  <video
                    src={currentQueueItem.url}
                    poster={currentQueueItem.thumbnail}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img
                    src={currentQueueItem.url}
                    alt={currentQueueItem.title}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                  <p className="text-white/80 text-sm">
                    Item {selectedFrame.queuePosition + 1} of {selectedFrameQueue.length}
                    {currentQueueItem.hasPlayed && ' • Played'}
                  </p>
                </div>

                {/* Navigation Arrows */}
                <button
                  onClick={() => skipToNextQueueItem(selectedFrame.id)}
                  disabled={!canControl || selectedFrameQueue.length <= 1}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full hover:bg-white transition disabled:opacity-50"
                >
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => skipToNextQueueItem(selectedFrame.id)}
                  disabled={!canControl || selectedFrameQueue.length <= 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full hover:bg-white transition disabled:opacity-50"
                >
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Type badge */}
                <span className={`absolute top-2 left-2 px-2 py-1 text-xs rounded ${
                  currentQueueItem.type === 'video' ? 'bg-red-600 text-white' : 'bg-concord-teal text-white'
                }`}>
                  {currentQueueItem.type === 'video' ? '▶ Video' : '🖼 Image'}
                </span>
              </div>
            ) : (
              <div className="aspect-video bg-gray-100 flex items-center justify-center flex-col gap-2">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-500">Queue empty - add videos to display</p>
              </div>
            )}

            {/* Frame Controls */}
            <div className="p-4 space-y-4">
              {/* Queue Info */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Queue Status</span>
                <span className={`font-medium ${selectedFrameQueue.length > 0 ? 'text-concord-green' : 'text-gray-400'}`}>
                  {selectedFrameQueue.length > 0
                    ? `${selectedFrameQueue.filter(i => i.hasPlayed).length}/${selectedFrameQueue.length} played`
                    : 'Empty'}
                </span>
              </div>

              {/* Voting Controls for Current Item */}
              {currentQueueItem && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Rate this item</span>
                      {(currentQueueItem.netVotes || 0) !== 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          (currentQueueItem.netVotes || 0) > 0
                            ? 'bg-concord-green/20 text-concord-green'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {(currentQueueItem.netVotes || 0) > 0 ? '+' : ''}{currentQueueItem.netVotes}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Thumbs Up */}
                      <button
                        onClick={() => voteQueueItem(selectedFrame.id, currentQueueItem.id, 'up')}
                        disabled={!canControl}
                        className={`p-2 rounded-lg transition ${
                          getQueueItemVote(currentQueueItem.id) === 'up'
                            ? 'bg-concord-green/20 text-concord-green'
                            : 'text-gray-400 hover:bg-concord-green/10 hover:text-concord-green'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title="Keep in queue longer"
                      >
                        <svg className="w-5 h-5" fill={getQueueItemVote(currentQueueItem.id) === 'up' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                        </svg>
                      </button>

                      {/* Thumbs Down */}
                      <button
                        onClick={() => voteQueueItem(selectedFrame.id, currentQueueItem.id, 'down')}
                        disabled={!canControl}
                        className={`p-2 rounded-lg transition ${
                          getQueueItemVote(currentQueueItem.id) === 'down'
                            ? 'bg-red-100 text-red-600'
                            : 'text-gray-400 hover:bg-red-50 hover:text-red-600'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title="Remove from queue sooner"
                      >
                        <svg className="w-5 h-5" fill={getQueueItemVote(currentQueueItem.id) === 'down' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                        </svg>
                      </button>

                      {/* Trash */}
                      <button
                        onClick={async () => {
                          const result = await trashQueueItem(selectedFrame.id, currentQueueItem.id)
                          if (result.warning || result.error) {
                            setTrashWarning(result.warning || result.error || null)
                            setTimeout(() => setTrashWarning(null), 5000)
                          }
                        }}
                        disabled={!canControl || trashRateLimit.remaining === 0}
                        className={`p-2 rounded-lg transition ${
                          trashRateLimit.remaining === 0
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-400 hover:bg-red-50 hover:text-red-600'
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
                  {/* Rotation Status Message */}
                  {currentQueueItem.rotationsRemaining !== undefined && (currentQueueItem.netVotes || 0) !== 0 && (
                    <p className={`text-xs text-center py-1 rounded ${
                      (currentQueueItem.netVotes || 0) > 0
                        ? 'text-concord-green bg-concord-green/10'
                        : 'text-concord-orange bg-concord-mango/20'
                    }`}>
                      {(currentQueueItem.netVotes || 0) > 0
                        ? `Staying for ${currentQueueItem.rotationsRemaining} more playlist round${currentQueueItem.rotationsRemaining > 1 ? 's' : ''} unless downvoted`
                        : `Leaving in ${currentQueueItem.rotationsRemaining} more playlist round${currentQueueItem.rotationsRemaining > 1 ? 's' : ''} unless upvoted`}
                    </p>
                  )}
                </div>
              )}

              {/* Trash Rate Limit Warning */}
              {trashRateLimit.remaining === 0 && trashRateLimit.resetsIn && (
                <div className="text-xs text-center text-concord-orange bg-concord-mango/20 rounded-lg py-2">
                  Trash limit reached. Resets in {trashRateLimit.resetsIn} min. Use thumbs down to vote items off instead!
                </div>
              )}

              {/* Skip Button */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Skip to next item</p>
                  <p className="text-xs text-gray-400">Jump ahead in the queue</p>
                </div>
                <button
                  onClick={() => skipToNextQueueItem(selectedFrame.id)}
                  disabled={!canControl || selectedFrameQueue.length <= 1}
                  className="px-4 py-2 bg-concord-orange/20 text-concord-orange rounded-lg hover:bg-concord-orange/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
