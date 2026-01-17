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
    mediaLibrary,
    playlists,
    isLoading,
    error,
    selectedFrameId,
    selectFrame,
    setFramePlaylist,
    voteSkipFrame,
    nextFrameMedia,
    previousFrameMedia,
    getPlaylistMedia,
    getCurrentFrameMedia,
    upvoteMedia,
    downvoteMedia,
    getUserVote,
    canControl
  } = usePhotoFrames()

  const [viewMode, setViewMode] = useState<'frames' | 'library'>('frames')
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  const selectedFrame = frames.find(f => f.id === selectedFrameId)
  const currentMedia = selectedFrameId ? getCurrentFrameMedia(selectedFrameId) : null
  const onlineFrames = frames.filter(f => f.isOnline)

  // Get media for the selected playlist or the selected frame's playlist
  const displayPlaylist = selectedPlaylist || selectedFrame?.playlist || playlists[0]
  const playlistMedia = displayPlaylist ? getPlaylistMedia(displayPlaylist) : []

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
                  frames.map(frame => (
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
                      </div>
                      <p className="text-xs text-gray-500 truncate">{frame.playlist}</p>
                    </button>
                  ))
                )}
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center">
                {onlineFrames.length} of {frames.length} frames online
              </p>
            </div>

            {/* Selected Frame Details */}
            {selectedFrame && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Current Image Display */}
                {currentMedia ? (
                  <div className="aspect-video bg-gray-900 relative">
                    <img
                      src={currentMedia.url}
                      alt={currentMedia.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                      <p className="text-white font-medium">{currentMedia.title}</p>
                      <p className="text-white/70 text-sm">{selectedFrame.playlist}</p>
                    </div>

                    {/* Navigation Arrows */}
                    <button
                      onClick={() => previousFrameMedia(selectedFrame.id)}
                      disabled={!canControl}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full hover:bg-white transition disabled:opacity-50"
                    >
                      <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => nextFrameMedia(selectedFrame.id)}
                      disabled={!canControl}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full hover:bg-white transition disabled:opacity-50"
                    >
                      <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-100 flex items-center justify-center">
                    <p className="text-gray-500">No media in playlist</p>
                  </div>
                )}

                {/* Frame Controls */}
                <div className="p-4 space-y-4">
                  {/* Playlist Selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Playlist</label>
                    <select
                      value={selectedFrame.playlist}
                      onChange={(e) => setFramePlaylist(selectedFrame.id, e.target.value)}
                      disabled={!canControl}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      {playlists.map(playlist => (
                        <option key={playlist} value={playlist}>{playlist}</option>
                      ))}
                    </select>
                  </div>

                  {/* Skip Vote Button */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Vote to skip current image</p>
                      <p className="text-xs text-gray-400">{selectedFrame.skipVotes}/3 votes to skip</p>
                    </div>
                    <button
                      onClick={() => voteSkipFrame(selectedFrame.id)}
                      disabled={!canControl}
                      className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Skip Vote
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Playlist Filter */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Browse by Playlist</h3>
              <div className="flex flex-wrap gap-2">
                {playlists.map(playlist => (
                  <button
                    key={playlist}
                    onClick={() => setSelectedPlaylist(playlist === selectedPlaylist ? null : playlist)}
                    className={`px-3 py-1.5 rounded-full text-sm transition ${
                      playlist === selectedPlaylist
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {playlist}
                  </button>
                ))}
              </div>
            </div>

            {/* Media Library */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                {displayPlaylist ? `${displayPlaylist} (${playlistMedia.length})` : `All Media (${mediaLibrary.length})`}
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {(displayPlaylist ? playlistMedia : mediaLibrary).map(media => {
                  const userVote = getUserVote(media.id)

                  return (
                    <div
                      key={media.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition"
                    >
                      {/* Thumbnail */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        <img
                          src={media.url}
                          alt={media.title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{media.title}</p>
                        <p className="text-xs text-gray-500">{media.playlist}</p>
                      </div>

                      {/* Voting */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => downvoteMedia(media.id)}
                          disabled={!canControl}
                          className={`p-1.5 rounded transition ${
                            userVote === 'down'
                              ? 'bg-red-100 text-red-600'
                              : canControl
                              ? 'hover:bg-gray-100 text-gray-400'
                              : 'text-gray-300 cursor-not-allowed'
                          }`}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                        </button>

                        <span className={`text-sm font-bold min-w-[2rem] text-center ${
                          media.votes > 0
                            ? 'text-green-600'
                            : media.votes < 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}>
                          {media.votes > 0 ? '+' : ''}{media.votes}
                        </span>

                        <button
                          onClick={() => upvoteMedia(media.id)}
                          disabled={!canControl}
                          className={`p-1.5 rounded transition ${
                            userVote === 'up'
                              ? 'bg-green-100 text-green-600'
                              : canControl
                              ? 'hover:bg-gray-100 text-gray-400'
                              : 'text-gray-300 cursor-not-allowed'
                          }`}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}

                {playlistMedia.length === 0 && mediaLibrary.length === 0 && (
                  <p className="text-gray-500 text-center py-8">No media available</p>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="text-center text-sm text-gray-500">
              <p>Higher voted media appears more frequently in rotation</p>
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
