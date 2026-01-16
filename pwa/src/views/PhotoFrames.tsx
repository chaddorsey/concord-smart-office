import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, usePresence, usePhotoFrames } from '../stores'
import BottomNav from '../components/BottomNav'

export default function PhotoFrames() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus } = useAuth()
  const { isCurrentUserPresent } = usePresence()
  const {
    frames,
    playlist,
    currentImageIndex,
    isLoading,
    error,
    upvote,
    downvote,
    getImageScore,
    getUserVote,
    nextImage,
    previousImage,
    goToImage,
    canControl
  } = usePhotoFrames()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  const currentImage = playlist[currentImageIndex]
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
            <span>Scan in to vote on photos</span>
          </div>
        )}

        {/* Current Image Card */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="aspect-video bg-gray-100 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : currentImage ? (
            <>
              {/* Image Display */}
              <div className="aspect-video bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center relative">
                <div className="absolute inset-0 flex items-center justify-center text-indigo-300">
                  <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="absolute bottom-4 left-4 right-4 text-center">
                  <p className="text-indigo-800 font-medium bg-white/80 rounded-lg px-3 py-1 inline-block">
                    {currentImage.title}
                  </p>
                </div>

                {/* Navigation Arrows */}
                <button
                  onClick={previousImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full hover:bg-white transition"
                >
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full hover:bg-white transition"
                >
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Voting Controls */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Added by {currentImage.addedBy}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Downvote */}
                    <button
                      onClick={() => downvote(currentImage.id)}
                      disabled={!canControl}
                      className={`p-2 rounded-lg transition ${
                        getUserVote(currentImage.id) === 'down'
                          ? 'bg-red-100 text-red-600'
                          : canControl
                          ? 'hover:bg-gray-100 text-gray-500'
                          : 'text-gray-300 cursor-not-allowed'
                      }`}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                      </svg>
                    </button>

                    {/* Score */}
                    <span className={`text-lg font-bold min-w-[3rem] text-center ${
                      getImageScore(currentImage.id) > 0
                        ? 'text-green-600'
                        : getImageScore(currentImage.id) < 0
                        ? 'text-red-600'
                        : 'text-gray-500'
                    }`}>
                      {getImageScore(currentImage.id) > 0 ? '+' : ''}{getImageScore(currentImage.id)}
                    </span>

                    {/* Upvote */}
                    <button
                      onClick={() => upvote(currentImage.id)}
                      disabled={!canControl}
                      className={`p-2 rounded-lg transition ${
                        getUserVote(currentImage.id) === 'up'
                          ? 'bg-green-100 text-green-600'
                          : canControl
                          ? 'hover:bg-gray-100 text-gray-500'
                          : 'text-gray-300 cursor-not-allowed'
                      }`}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 11H5a2 2 0 00-2 2v6a2 2 0 002 2h2.5" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Image Indicators */}
                <div className="flex items-center justify-center gap-1.5 mt-4">
                  {playlist.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToImage(index)}
                      className={`w-2 h-2 rounded-full transition ${
                        index === currentImageIndex
                          ? 'bg-indigo-600 w-4'
                          : 'bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="aspect-video bg-gray-100 flex items-center justify-center">
              <p className="text-gray-500">No images in playlist</p>
            </div>
          )}
        </div>

        {/* Frame Status */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Display Status</h3>
          <div className="grid grid-cols-2 gap-3">
            {frames.length > 0 ? frames.map(frame => (
              <div
                key={frame.id}
                className={`p-3 rounded-lg ${
                  frame.isOnline ? 'bg-green-50' : 'bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    frame.isOnline ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {frame.name}
                  </span>
                </div>
              </div>
            )) : (
              <>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="p-3 rounded-lg bg-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-400" />
                      <span className="text-sm font-medium text-gray-500">Frame {i}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">
            {onlineFrames.length} of {frames.length || 4} frames online
          </p>
        </div>

        {/* Playlist */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Playlist ({playlist.length} images)</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {playlist.map((image, index) => {
              const score = getImageScore(image.id)
              const userVote = getUserVote(image.id)
              const isCurrent = index === currentImageIndex

              return (
                <button
                  key={image.id}
                  onClick={() => goToImage(index)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition ${
                    isCurrent
                      ? 'bg-indigo-50 ring-2 ring-indigo-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Thumbnail placeholder */}
                  <div className="w-12 h-12 rounded bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{image.title}</p>
                    <p className="text-xs text-gray-500">by {image.addedBy}</p>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {userVote === 'up' && (
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 11H5a2 2 0 00-2 2v6a2 2 0 002 2h2.5" />
                      </svg>
                    )}
                    {userVote === 'down' && (
                      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                      </svg>
                    )}
                    <span className={`text-sm font-medium ${
                      score > 0 ? 'text-green-600' : score < 0 ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      {score > 0 ? '+' : ''}{score}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Info */}
        <div className="text-center text-sm text-gray-500">
          <p>Images with low scores may be removed from rotation</p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
