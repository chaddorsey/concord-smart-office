import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, usePresence, usePhotoFrames } from '../stores'
import { pixabayService, type PixabayVideo } from '../services/pixabayService'
import BottomNav from '../components/BottomNav'

export default function BrowseVideos() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus } = useAuth()
  const { isCurrentUserPresent } = usePresence()
  const { playlists, addMediaToLibrary, canControl } = usePhotoFrames()

  const [videos, setVideos] = useState<PixabayVideo[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('loop')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalVideos, setTotalVideos] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addedVideos, setAddedVideos] = useState<Set<string>>(new Set())

  // Modal state
  const [selectedVideo, setSelectedVideo] = useState<PixabayVideo | null>(null)
  const [selectedPlaylist, setSelectedPlaylist] = useState(playlists[0] || 'Art')

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  // Load categories on mount
  useEffect(() => {
    pixabayService.getCategories()
      .then(setCategories)
      .catch(err => console.error('Failed to load categories:', err))
  }, [])

  // Search videos
  const searchVideos = useCallback(async (append = false) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await pixabayService.searchVideos(searchQuery, {
        page: append ? currentPage : 1,
        perPage: 20,
        category: selectedCategory
      })

      setTotalVideos(result.total)
      if (append) {
        setVideos(prev => [...prev, ...result.videos])
      } else {
        setVideos(result.videos)
        setCurrentPage(1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search videos')
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, selectedCategory, currentPage])

  // Initial search
  useEffect(() => {
    searchVideos()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = () => {
    setCurrentPage(prev => prev + 1)
    searchVideos(true)
  }

  const handleSearch = () => {
    setCurrentPage(1)
    searchVideos()
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const openPreview = (video: PixabayVideo) => {
    setSelectedVideo(video)
    setSelectedPlaylist(playlists[0] || 'Art')
  }

  const closePreview = () => {
    setSelectedVideo(null)
  }

  const addVideo = async (video: PixabayVideo, playlist: string) => {
    if (!canControl) return

    try {
      await addMediaToLibrary({
        id: video.id,
        url: video.url,
        type: 'video',
        title: video.title,
        playlist,
        votes: 0
      })

      setAddedVideos(prev => new Set([...prev, video.id]))
      closePreview()
    } catch (err) {
      console.error('Failed to add video:', err)
    }
  }

  const quickAdd = async (video: PixabayVideo) => {
    await addVideo(video, playlists[0] || 'Art')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-indigo-600 text-white px-4 py-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <Link to="/photos" className="p-2 -ml-2 hover:bg-indigo-500 rounded-lg transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold">Browse Videos</h1>
            <div className="w-10" />
          </div>

          {/* Search Bar */}
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search videos..."
              className="flex-1 px-3 py-2 rounded-lg bg-indigo-500 text-white placeholder-indigo-200 border border-indigo-400 focus:outline-none focus:ring-2 focus:ring-white"
            />
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-white text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition"
            >
              Search
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Not Scanned In Warning */}
        {!isCurrentUserPresent && (
          <div className="bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Scan in to add videos to frames</span>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
          <button
            onClick={() => {
              setSelectedCategory('')
              setTimeout(handleSearch, 0)
            }}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
              !selectedCategory
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat)
                setTimeout(handleSearch, 0)
              }}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Video Grid */}
        {isLoading && videos.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading videos...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {videos.map(video => (
              <div
                key={video.id}
                className={`bg-white rounded-xl shadow-sm overflow-hidden ${
                  addedVideos.has(video.id) ? 'ring-2 ring-green-500' : ''
                }`}
              >
                <div className="flex">
                  {/* Thumbnail */}
                  <div
                    className="w-32 h-24 flex-shrink-0 bg-gray-900 relative cursor-pointer"
                    onClick={() => openPreview(video)}
                  >
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1 right-1 bg-black/75 text-white text-xs px-1.5 py-0.5 rounded">
                      {formatDuration(video.duration)}
                    </span>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition">
                      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                    <div>
                      <h3 className="font-medium text-gray-900 text-sm truncate">{video.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">by {video.user}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => openPreview(video)}
                        className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => quickAdd(video)}
                        disabled={!canControl || addedVideos.has(video.id)}
                        className={`px-3 py-1.5 text-xs rounded-lg transition ${
                          addedVideos.has(video.id)
                            ? 'bg-green-100 text-green-700'
                            : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                      >
                        {addedVideos.has(video.id) ? 'Added ✓' : 'Add'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {videos.length === 0 && !isLoading && (
              <div className="text-center py-12 text-gray-500">
                No videos found. Try a different search.
              </div>
            )}
          </div>
        )}

        {/* Load More */}
        {videos.length < totalVideos && (
          <div className="text-center pt-4">
            <button
              onClick={loadMore}
              disabled={isLoading}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}

        {/* Results count */}
        <p className="text-center text-sm text-gray-500">
          Showing {videos.length} of {totalVideos} videos
        </p>
      </main>

      {/* Preview Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col"
          onClick={closePreview}
        >
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="w-full max-w-lg">
              {/* Close button */}
              <button
                onClick={closePreview}
                className="absolute top-4 right-4 text-white p-2"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Video */}
              <video
                src={selectedVideo.url}
                autoPlay
                loop
                muted
                playsInline
                controls
                className="w-full rounded-lg"
              />

              {/* Info & Actions */}
              <div className="mt-4 text-center">
                <h3 className="text-white font-medium text-lg">{selectedVideo.title}</h3>
                <p className="text-gray-400 text-sm mt-1">
                  by {selectedVideo.user} • {formatDuration(selectedVideo.duration)} • {selectedVideo.views.toLocaleString()} views
                </p>

                {/* Playlist selector */}
                <div className="mt-4 flex gap-2 justify-center">
                  <select
                    value={selectedPlaylist}
                    onChange={(e) => setSelectedPlaylist(e.target.value)}
                    className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700"
                    onClick={e => e.stopPropagation()}
                  >
                    {playlists.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      addVideo(selectedVideo, selectedPlaylist)
                    }}
                    disabled={!canControl || addedVideos.has(selectedVideo.id)}
                    className={`px-6 py-2 rounded-lg font-medium transition ${
                      addedVideos.has(selectedVideo.id)
                        ? 'bg-green-600 text-white'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                    }`}
                  >
                    {addedVideos.has(selectedVideo.id) ? 'Added ✓' : 'Add to Frames'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
