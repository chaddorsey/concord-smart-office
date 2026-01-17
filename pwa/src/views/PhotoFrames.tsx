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
    // Queue system
    queueSettings,
    holdingTank,
    frameQueues,
    updateQueueSettings,
    setFrameOrientation,
    redistributeHoldingTank,
    removeFromHoldingTank
  } = usePhotoFrames()

  const [viewMode, setViewMode] = useState<'frames' | 'library' | 'settings'>('frames')
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null)

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
      <header className="bg-indigo-600 text-white px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="p-2 -ml-2 hover:bg-indigo-500 rounded-lg transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">Photo Frames</h1>
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
            <span>Scan in to control frames and vote</span>
          </div>
        )}

        {/* Browse Videos Button */}
        <Link
          to="/browse-videos"
          className="flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition shadow-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Browse Pixabay Videos
        </Link>

        {/* View Toggle */}
        <div className="flex bg-gray-200 rounded-lg p-1">
          <button
            onClick={() => setViewMode('frames')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
              viewMode === 'frames'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Frames
          </button>
          <button
            onClick={() => setViewMode('library')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
              viewMode === 'library'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Library
          </button>
          <button
            onClick={() => setViewMode('settings')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition relative ${
              viewMode === 'settings'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Settings
            {holdingTank.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center">
                {holdingTank.length}
              </span>
            )}
          </button>
        </div>

        {viewMode === 'frames' ? (
          <>
            {/* Frame Selection */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Select Frame</h3>
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
                            ? 'bg-indigo-100 ring-2 ring-indigo-500'
                            : frame.isOnline
                            ? 'bg-green-50 hover:bg-green-100'
                            : 'bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full ${
                            frame.isOnline ? 'bg-green-500' : 'bg-gray-400'
                          }`} />
                          <span className="text-sm font-medium text-gray-700 truncate">
                            Frame {frame.id}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            frame.orientation === 'horizontal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {frame.orientation === 'horizontal' ? 'H' : 'V'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{frame.playlist}</p>
                        {queue.length > 0 && (
                          <p className="text-xs text-indigo-600 mt-0.5">
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
                {/* Current Media Display - prioritize queue items */}
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
                      currentQueueItem.type === 'video' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
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
                    <span className={`font-medium ${selectedFrameQueue.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {selectedFrameQueue.length > 0
                        ? `${selectedFrameQueue.filter(i => i.hasPlayed).length}/${selectedFrameQueue.length} played`
                        : 'Empty'}
                    </span>
                  </div>

                  {/* Skip Button */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Skip to next item</p>
                      <p className="text-xs text-gray-400">Jump ahead in the queue</p>
                    </div>
                    <button
                      onClick={() => skipToNextQueueItem(selectedFrame.id)}
                      disabled={!canControl || selectedFrameQueue.length <= 1}
                      className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : viewMode === 'library' ? (
          <>
            {/* Frame Queue Selector */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Browse Frame Queues</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedPlaylist(null)}
                  className={`px-3 py-1.5 rounded-full text-sm transition ${
                    selectedPlaylist === null
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Queues
                </button>
                {frames.map(frame => {
                  const queue = frameQueues[frame.id] || []
                  return (
                    <button
                      key={frame.id}
                      onClick={() => setSelectedPlaylist(frame.id)}
                      className={`px-3 py-1.5 rounded-full text-sm transition flex items-center gap-1 ${
                        selectedPlaylist === frame.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        frame.orientation === 'horizontal' ? 'bg-blue-500' : 'bg-purple-500'
                      }`} />
                      Frame {frame.id}
                      {queue.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                          {queue.length}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Queue Items */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                {selectedPlaylist
                  ? `Frame ${selectedPlaylist} Queue (${(frameQueues[selectedPlaylist] || []).length})`
                  : `All Queued Items (${Object.values(frameQueues).flat().length})`}
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {(selectedPlaylist
                  ? (frameQueues[selectedPlaylist] || [])
                  : Object.entries(frameQueues).flatMap(([frameId, queue]) =>
                      queue.map(item => ({ ...item, frameId }))
                    )
                ).map((item: any) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-2 rounded-lg transition ${
                      item.hasPlayed ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-900 relative">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {/* Type badge */}
                      <span className={`absolute bottom-0 right-0 px-1 text-[10px] ${
                        item.type === 'video' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                      }`}>
                        {item.type === 'video' ? '▶' : '🖼'}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        {item.frameId && !selectedPlaylist && (
                          <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">Frame {item.frameId}</span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded ${
                          item.orientation === 'horizontal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {item.orientation === 'horizontal' ? 'H' : 'V'}
                        </span>
                        {item.duration && (
                          <span className="text-gray-400">
                            {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
                          </span>
                        )}
                        {item.hasPlayed && (
                          <span className="text-green-600">✓ Played</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {Object.values(frameQueues).flat().length === 0 && (
                  <div className="text-center py-8">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p className="text-gray-500">No items in queue</p>
                    <p className="text-gray-400 text-sm mt-1">Browse videos to add items</p>
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="text-center text-sm text-gray-500">
              <p>Items are distributed to frames based on orientation matching</p>
            </div>
          </>
        ) : (
          <>
            {/* Queue Settings */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Queue Settings</h3>

              {/* Queue Limit */}
              <div className="mb-4">
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">Queue Limit</span>
                  <span className="text-sm font-medium text-indigo-600">{queueSettings.queueLimit} items</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={queueSettings.queueLimit}
                  onChange={(e) => updateQueueSettings({ queueLimit: parseInt(e.target.value, 10) })}
                  disabled={!canControl}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>5</span>
                  <span>50</span>
                </div>
              </div>

              {/* Image Display Time */}
              <div className="mb-4">
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">Image Display Time</span>
                  <span className="text-sm font-medium text-indigo-600">{queueSettings.imageDisplayTime}s</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={queueSettings.imageDisplayTime}
                  onChange={(e) => updateQueueSettings({ imageDisplayTime: parseInt(e.target.value, 10) })}
                  disabled={!canControl}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>5s</span>
                  <span>120s</span>
                </div>
              </div>

              {/* Video Loop Count */}
              <div>
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">Video Loop Count</span>
                  <span className="text-sm font-medium text-indigo-600">{queueSettings.videoLoopCount}x</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={queueSettings.videoLoopCount}
                  onChange={(e) => updateQueueSettings({ videoLoopCount: parseInt(e.target.value, 10) })}
                  disabled={!canControl}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1x</span>
                  <span>10x</span>
                </div>
              </div>
            </div>

            {/* Frame Orientations */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Frame Orientations</h3>
              <div className="space-y-3">
                {frames.map(frame => {
                  const queue = frameQueues[frame.id] || []
                  const playedCount = queue.filter(item => item.hasPlayed).length
                  const pendingCount = queue.length - playedCount

                  return (
                    <div key={frame.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Frame {frame.id}</p>
                        <p className="text-xs text-gray-500">
                          {queue.length > 0 ? (
                            <>
                              <span className="text-green-600">{playedCount} played</span>
                              {' / '}
                              <span className="text-indigo-600">{pendingCount} pending</span>
                            </>
                          ) : (
                            'Queue empty'
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setFrameOrientation(frame.id, 'horizontal')}
                          disabled={!canControl}
                          className={`p-2 rounded-lg transition ${
                            frame.orientation === 'horizontal'
                              ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50'
                          }`}
                          title="Horizontal"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth={2} />
                          </svg>
                        </button>
                        <button
                          onClick={() => setFrameOrientation(frame.id, 'vertical')}
                          disabled={!canControl}
                          className={`p-2 rounded-lg transition ${
                            frame.orientation === 'vertical'
                              ? 'bg-purple-100 text-purple-700 ring-2 ring-purple-500'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50'
                          }`}
                          title="Vertical"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="6" y="3" width="12" height="18" rx="2" strokeWidth={2} />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Holding Tank */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">
                  Holding Tank
                  {holdingTank.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                      {holdingTank.length}
                    </span>
                  )}
                </h3>
                {holdingTank.length > 0 && (
                  <button
                    onClick={() => redistributeHoldingTank()}
                    disabled={!canControl}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    Redistribute
                  </button>
                )}
              </div>

              {holdingTank.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  No items waiting for frames
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {holdingTank.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2 bg-amber-50 rounded-lg">
                      {/* Thumbnail */}
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-900">
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-amber-700">
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                            item.orientation === 'horizontal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {item.orientation === 'horizontal' ? 'H' : 'V'}
                          </span>
                          <span>No matching frames</span>
                        </div>
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => removeFromHoldingTank(item.id)}
                        disabled={!canControl}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded transition disabled:opacity-50"
                        title="Remove"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Queue Status Overview */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Queue Status</h3>
              <div className="grid grid-cols-2 gap-3">
                {frames.map(frame => {
                  const queue = frameQueues[frame.id] || []
                  const playedPct = queue.length > 0
                    ? Math.round((queue.filter(i => i.hasPlayed).length / queue.length) * 100)
                    : 0

                  return (
                    <div key={frame.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Frame {frame.id}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          frame.orientation === 'horizontal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {frame.orientation === 'horizontal' ? 'H' : 'V'}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-300"
                          style={{ width: `${playedPct}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {queue.length > 0 ? `${playedPct}% played (${queue.length} items)` : 'Empty'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
