import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, usePresence, useOasis } from '../stores'
import type { Pattern, PatternSubmission, LedSubmission } from '../stores'
import BottomNav from '../components/BottomNav'

export default function SandTable() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus, user } = useAuth()
  const { isCurrentUserPresent } = usePresence()
  const {
    patterns,
    patternQueue,
    patternFavorites,
    nativeQueue,
    ledEffects,
    ledQueue,
    status,
    haStatus,
    drawingProgress,
    patternTrashRateLimit,
    ledTrashRateLimit,
    isLoading,
    error,
    canControl,
    submitPattern,
    votePattern,
    trashPattern,
    addPatternFavorite,
    removePatternFavorite,
    submitLed,
    voteLed,
    trashLed,
    setLedChangeInterval,
    refresh
  } = useOasis()

  const [viewMode, setViewMode] = useState<'patterns' | 'led'>('patterns')
  const [showPatternBrowser, setShowPatternBrowser] = useState(false)
  const [patternSearchQuery, setPatternSearchQuery] = useState('')
  const [trashWarning, setTrashWarning] = useState<string | null>(null)

  // LED submission form
  const [selectedEffect, setSelectedEffect] = useState<string>('')
  const [selectedColor, setSelectedColor] = useState('#ff6b6b')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  // Get current user's vote for a pattern
  const getPatternVote = (submission: PatternSubmission): number => {
    if (!user) return 0
    return submission.votes[user.id] || 0
  }

  // Get current user's vote for LED
  const getLedVote = (submission: LedSubmission): number => {
    if (!user) return 0
    return submission.votes[user.id] || 0
  }

  // Handle pattern voting
  const handlePatternVote = async (submissionId: number, currentVote: number, newVote: -1 | 1) => {
    if (!canControl) return
    const value = currentVote === newVote ? 0 : newVote
    try {
      await votePattern(submissionId, value as -1 | 0 | 1)
    } catch (err) {
      console.error('Failed to vote:', err)
    }
  }

  // Handle LED voting
  const handleLedVote = async (submissionId: number, currentVote: number, newVote: -1 | 1) => {
    if (!canControl) return
    const value = currentVote === newVote ? 0 : newVote
    try {
      await voteLed(submissionId, value as -1 | 0 | 1)
    } catch (err) {
      console.error('Failed to vote:', err)
    }
  }

  // Handle pattern submission (backend handles auth/demo fallback)
  const handleSubmitPattern = async (pattern: Pattern) => {
    try {
      setSubmitFeedback(`Adding "${pattern.name}"...`)
      await submitPattern(pattern.id, pattern.name, pattern.thumbnail_url || undefined)
      setSubmitFeedback(`Added "${pattern.name}" to queue!`)
      setTimeout(() => {
        setSubmitFeedback(null)
        setShowPatternBrowser(false)
        setPatternSearchQuery('')
        setSelectedCategory(null)
      }, 1500)
    } catch (err) {
      console.error('Failed to submit pattern:', err)
      setSubmitFeedback(`Failed to add: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setTimeout(() => setSubmitFeedback(null), 3000)
    }
  }

  // Handle LED submission
  const handleSubmitLed = async () => {
    if (!canControl || !selectedEffect) return
    setIsSubmitting(true)
    try {
      const effect = ledEffects.find(e => e.id === selectedEffect)
      await submitLed(
        selectedEffect,
        effect?.supportsColor ? selectedColor : undefined
      )
      setSelectedEffect('')
    } catch (err) {
      console.error('Failed to submit LED:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Pattern categories based on common keywords
  const PATTERN_CATEGORIES = [
    { id: 'animals', label: 'Animals', keywords: ['cat', 'dog', 'dragon', 'lion', 'fish', 'bird', 'butterfly', 'tiger', 'bear', 'wolf', 'fox', 'owl', 'whale', 'dolphin', 'turtle', 'horse', 'rabbit', 'deer', 'elephant', 'penguin', 'octopus', 'snake', 'frog', 'bee', 'spider', 'crab', 'jellyfish', 'seahorse', 'koi', 'otter', 'llama', 'sloth'] },
    { id: 'nature', label: 'Nature', keywords: ['flower', 'tree', 'leaf', 'forest', 'mountain', 'ocean', 'sea', 'wave', 'sun', 'moon', 'cloud', 'rain', 'snow', 'garden', 'rose', 'lotus', 'bamboo', 'mushroom', 'cactus', 'palm', 'bonsai', 'aurora'] },
    { id: 'shapes', label: 'Shapes & Spirals', keywords: ['spiral', 'circle', 'triangle', 'square', 'star', 'heart', 'hexagon', 'polygon', 'geometric', 'symmetry', 'tessellation', 'fractal', 'spirograph', 'mandala', 'kaleidoscope'] },
    { id: 'holidays', label: 'Holidays', keywords: ['christmas', 'halloween', 'valentine', 'easter', 'thanksgiving', 'birthday', 'new year', 'st patrick', 'fourth of july', 'independence'] },
    { id: 'abstract', label: 'Abstract', keywords: ['abstract', 'zen', 'minimal', 'modern', 'art', 'pattern', 'texture', 'wave', 'flow', 'swirl', 'dizzy', 'warped', 'psychedelic'] },
    { id: 'celtic', label: 'Celtic & Tribal', keywords: ['celtic', 'tribal', 'knot', 'nordic', 'viking', 'rune', 'aztec', 'mayan', 'native'] },
  ]

  // Filter patterns by search query and/or category
  const MAX_DISPLAY_PATTERNS = 50
  const allFilteredPatterns = patterns.filter(p => {
    const name = p.name.toLowerCase()
    const matchesSearch = !patternSearchQuery || name.includes(patternSearchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || PATTERN_CATEGORIES.find(c => c.id === selectedCategory)?.keywords.some(kw => name.includes(kw))
    return matchesSearch && matchesCategory
  })
  const filteredPatterns = allFilteredPatterns.slice(0, MAX_DISPLAY_PATTERNS)
  const hasMorePatterns = allFilteredPatterns.length > MAX_DISPLAY_PATTERNS

  // Check if pattern is a favorite
  const isPatternFavorite = (patternId: string) =>
    patternFavorites.some(f => f.pattern_id === patternId)

  // Current LED from queue status (for "submitted by" info)
  const currentLed = status?.currentLed

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
          <button
            onClick={refresh}
            className="p-2 hover:bg-amber-500 rounded-lg transition"
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
            <span>Scan in to submit patterns and vote</span>
          </div>
        )}

        {/* View Toggle */}
        <div className="flex bg-gray-200 rounded-lg p-1">
          <button
            onClick={() => setViewMode('patterns')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
              viewMode === 'patterns'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Patterns
            {(patternQueue.length > 0 || (nativeQueue && nativeQueue.patterns.length > 0)) && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-amber-500 text-white text-xs rounded-full">
                {patternQueue.length + (nativeQueue?.patterns.length || 0)}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode('led')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
              viewMode === 'led'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            LED
            {ledQueue.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-purple-500 text-white text-xs rounded-full">
                {ledQueue.length}
              </span>
            )}
          </button>
        </div>

        {viewMode === 'patterns' ? (
          <>
            {/* Now Playing Card */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-white">
                <div className="flex items-center gap-4">
                  {/* Pattern thumbnail or placeholder */}
                  <div className="w-20 h-20 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {isLoading ? (
                      <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                    ) : haStatus?.currentPattern?.thumbnailUrl ? (
                      <img
                        src={haStatus.currentPattern.thumbnailUrl}
                        alt={haStatus.currentPattern.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg className="w-10 h-10 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/70 text-sm">
                      {haStatus?.connected ? 'Now Drawing' : (haStatus ? 'Oasis Disconnected' : 'Loading...')}
                    </p>
                    <h2 className="text-xl font-bold truncate">
                      {haStatus?.currentPattern?.name || (haStatus?.error ? 'Error' : 'No Pattern')}
                    </h2>
                    {haStatus?.led && (
                      <p className="text-white/80 text-sm mt-1">
                        LED: {haStatus.led.effect}
                      </p>
                    )}
                    {(haStatus as any)?.error && (
                      <p className="text-white/60 text-xs mt-1 truncate">
                        {(haStatus as any).error}
                      </p>
                    )}
                  </div>
                </div>

                {/* Drawing Progress */}
                {haStatus?.connected && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-white/70">Drawing Progress</span>
                      <span className="font-medium">
                        {drawingProgress !== null ? `${Math.round(drawingProgress)}%` : haStatus.state}
                      </span>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white transition-all"
                        style={{ width: `${drawingProgress ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Queue info */}
              <div className="p-4 flex items-center justify-between text-sm">
                <span className="text-gray-600">Queue Status</span>
                <div className="flex items-center gap-2">
                  {patternQueue.length > 0 && (
                    <span className="font-medium text-amber-600">
                      {patternQueue.length} submitted
                    </span>
                  )}
                  {patternQueue.length > 0 && nativeQueue && nativeQueue.patterns.length > 0 && (
                    <span className="text-gray-300">+</span>
                  )}
                  {nativeQueue && nativeQueue.patterns.length > 0 && (
                    <span className="font-medium text-gray-500">
                      {nativeQueue.patterns.length} default
                    </span>
                  )}
                  {patternQueue.length === 0 && (!nativeQueue || nativeQueue.patterns.length === 0) && (
                    <span className="font-medium text-gray-400">Queue empty</span>
                  )}
                </div>
              </div>
            </div>

            {/* Browse Patterns Button */}
            <button
              onClick={() => setShowPatternBrowser(true)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Find and Add Patterns
            </button>

            {/* Trash Warning */}
            {trashWarning && (
              <div className="bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{trashWarning}</span>
              </div>
            )}

            {/* Trash Rate Limit Warning */}
            {patternTrashRateLimit.remaining === 0 && patternTrashRateLimit.resetsIn && (
              <div className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-2">
                Pattern trash limit reached. Resets in {patternTrashRateLimit.resetsIn} min. Use downvote to vote items off instead.
              </div>
            )}

            {/* Combined Pattern Queue */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Pattern Queue</h2>
                <div className="flex items-center gap-2">
                  {patternQueue.length > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {patternQueue.length} submitted
                    </span>
                  )}
                  {patternTrashRateLimit.remaining < 3 && patternTrashRateLimit.remaining > 0 && (
                    <span className="text-xs text-gray-500">
                      {patternTrashRateLimit.remaining}/3 trash left
                    </span>
                  )}
                </div>
              </div>

              {patternQueue.length === 0 && (!nativeQueue || nativeQueue.patterns.length === 0) ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p>No patterns in queue</p>
                  <p className="text-sm mt-1">Add a pattern to get started</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* User Submissions (with voting) */}
                  {patternQueue.map((item, index) => {
                    const netVotes = item.upvotes - item.downvotes
                    const userVote = getPatternVote(item)

                    return (
                      <div key={item.id} className="p-3 flex items-center gap-3">
                        {/* Position */}
                        <span className="w-5 text-center text-gray-400 text-sm font-medium flex-shrink-0">
                          {index + 1}
                        </span>

                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-amber-100">
                          {item.thumbnail_url ? (
                            <img
                              src={item.thumbnail_url}
                              alt={item.pattern_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate text-sm">
                            {item.pattern_name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
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

                        {/* Voting & Trash */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Thumbs Up */}
                          <button
                            onClick={() => handlePatternVote(item.id, userVote, 1)}
                            disabled={!canControl}
                            className={`p-1.5 rounded-lg transition ${
                              userVote === 1
                                ? 'bg-green-100 text-green-600'
                                : canControl
                                ? 'text-gray-400 hover:bg-green-50 hover:text-green-600'
                                : 'text-gray-300'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title="Upvote"
                          >
                            <svg className="w-5 h-5" fill={userVote === 1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                            </svg>
                          </button>

                          {/* Thumbs Down */}
                          <button
                            onClick={() => handlePatternVote(item.id, userVote, -1)}
                            disabled={!canControl}
                            className={`p-1.5 rounded-lg transition ${
                              userVote === -1
                                ? 'bg-red-100 text-red-600'
                                : canControl
                                ? 'text-gray-400 hover:bg-red-50 hover:text-red-600'
                                : 'text-gray-300'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title="Downvote"
                          >
                            <svg className="w-5 h-5" fill={userVote === -1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                            </svg>
                          </button>

                          {/* Trash */}
                          <button
                            onClick={async () => {
                              const result = await trashPattern(item.id)
                              if (result.warning || result.error) {
                                setTrashWarning(result.warning || result.error || null)
                                setTimeout(() => setTrashWarning(null), 5000)
                              }
                            }}
                            disabled={!canControl || patternTrashRateLimit.remaining === 0}
                            className={`p-1.5 rounded-lg transition ${
                              patternTrashRateLimit.remaining === 0
                                ? 'text-gray-300 cursor-not-allowed'
                                : canControl
                                ? 'text-gray-400 hover:bg-red-50 hover:text-red-600'
                                : 'text-gray-300'
                            } disabled:opacity-50`}
                            title={patternTrashRateLimit.remaining === 0
                              ? `Resets in ${patternTrashRateLimit.resetsIn || '?'} min`
                              : `Remove immediately (${patternTrashRateLimit.remaining} left)`}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Divider between user submissions and native queue */}
                  {patternQueue.length > 0 && nativeQueue && nativeQueue.patterns.length > 0 && (
                    <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 uppercase tracking-wider">Oasis Queue</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  )}

                  {/* Native Oasis Queue (read-only) */}
                  {nativeQueue?.patterns.map((item, index) => {
                    // Generate initials from pattern name for placeholder
                    const initials = item.name
                      .split(/[\s-]+/)
                      .filter(word => word.length > 0)
                      .slice(0, 2)
                      .map(word => word[0].toUpperCase())
                      .join('')

                    return (
                      <div key={`native-${index}`} className="p-3 flex items-center gap-3 bg-gray-50/50">
                        {/* Position (continues from user queue) */}
                        <span className="w-5 text-center text-gray-300 text-sm font-medium flex-shrink-0">
                          {patternQueue.length + index + 1}
                        </span>

                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-gray-200 to-gray-300">
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500 font-semibold text-sm">
                              {initials || '?'}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-600 truncate text-sm">
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span>Oasis Default</span>
                          </div>
                        </div>

                        {/* No voting controls for native queue items */}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Favorites */}
            {patternFavorites.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Favorites</h2>
                  <p className="text-sm text-gray-500">Used when queue is empty</p>
                </div>
                <div className="p-4 grid grid-cols-3 gap-2">
                  {patternFavorites.slice(0, 6).map(fav => (
                    <button
                      key={fav.id}
                      onClick={() => handleSubmitPattern({
                        id: fav.pattern_id,
                        name: fav.pattern_name,
                        thumbnail_url: fav.thumbnail_url,
                        duration_seconds: null
                      })}
                      disabled={!canControl}
                      className="aspect-square rounded-lg bg-amber-50 p-2 hover:bg-amber-100 transition disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                    >
                      {fav.thumbnail_url ? (
                        <img
                          src={fav.thumbnail_url}
                          alt={fav.pattern_name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Current LED */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-purple-500 to-indigo-600 p-6 text-white">
                <div className="flex items-center gap-4">
                  {/* LED preview */}
                  <div
                    className="w-16 h-16 rounded-full flex-shrink-0 animate-pulse"
                    style={{
                      background: currentLed?.color_hex
                        ? currentLed.color_hex
                        : 'linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)'
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white/70 text-sm">Current LED</p>
                    <h2 className="text-xl font-bold truncate">
                      {currentLed?.effect_name || 'Rainbow'}
                    </h2>
                    {currentLed && (
                      <p className="text-white/80 text-sm mt-1">
                        by {currentLed.submitted_by_name}
                      </p>
                    )}
                  </div>
                </div>

                {/* Next LED change countdown */}
                {status && (
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-white/70">Changes in</span>
                    <span className="font-medium">
                      {status.timeUntilNextLedChange > 0
                        ? `${status.timeUntilNextLedChange} min`
                        : 'Soon'}
                    </span>
                  </div>
                )}
              </div>

              {/* LED Queue info */}
              <div className="p-4 flex items-center justify-between text-sm">
                <span className="text-gray-600">LED Queue</span>
                <span className={`font-medium ${ledQueue.length > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
                  {ledQueue.length > 0 ? `${ledQueue.length} effects queued` : 'Queue empty'}
                </span>
              </div>
            </div>

            {/* LED Submission Form */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Submit LED Effect</h2>
              </div>
              <div className="p-4 space-y-4">
                {/* Effect Selection */}
                <div className="grid grid-cols-2 gap-2">
                  {ledEffects.map(effect => (
                    <button
                      key={effect.id}
                      onClick={() => setSelectedEffect(effect.id)}
                      disabled={!canControl}
                      className={`p-3 rounded-lg text-left transition ${
                        selectedEffect === effect.id
                          ? 'bg-purple-100 border-2 border-purple-500 text-purple-700'
                          : canControl
                          ? 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                          : 'bg-gray-50 border-2 border-transparent opacity-50'
                      }`}
                    >
                      <span className="font-medium block text-sm">{effect.name}</span>
                      {effect.supportsColor && (
                        <span className="text-xs text-gray-500">+ color</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Color Picker (if effect supports color) */}
                {selectedEffect && ledEffects.find(e => e.id === selectedEffect)?.supportsColor && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Color
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={selectedColor}
                        onChange={e => setSelectedColor(e.target.value)}
                        className="w-12 h-12 rounded-lg border-0 cursor-pointer"
                      />
                      <div className="flex gap-2 flex-wrap">
                        {['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#a29bfe', '#fd79a8'].map(color => (
                          <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            className={`w-8 h-8 rounded-full transition ${
                              selectedColor === color ? 'ring-2 ring-offset-2 ring-purple-500' : ''
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleSubmitLed}
                  disabled={!canControl || !selectedEffect || isSubmitting}
                  className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Add to LED Queue'}
                </button>
              </div>
            </div>

            {/* LED Trash Rate Limit Warning */}
            {ledTrashRateLimit.remaining === 0 && ledTrashRateLimit.resetsIn && (
              <div className="text-xs text-center text-purple-600 bg-purple-50 rounded-lg py-2">
                LED trash limit reached. Resets in {ledTrashRateLimit.resetsIn} min. Use downvote instead.
              </div>
            )}

            {/* LED Queue */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">LED Queue</h2>
                {ledTrashRateLimit.remaining < 3 && ledTrashRateLimit.remaining > 0 && (
                  <span className="text-xs text-gray-500">
                    {ledTrashRateLimit.remaining}/3 trash left
                  </span>
                )}
              </div>

              {ledQueue.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p>No LED effects in queue</p>
                  <p className="text-sm mt-1">Submit an effect above</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {ledQueue.map((item, index) => {
                    const netVotes = item.upvotes - item.downvotes
                    const userVote = getLedVote(item)

                    return (
                      <div key={item.id} className="p-3 flex items-center gap-3">
                        {/* Position */}
                        <span className="w-5 text-center text-gray-400 text-sm font-medium flex-shrink-0">
                          {index + 1}
                        </span>

                        {/* LED Color Preview */}
                        <div
                          className="w-10 h-10 rounded-full flex-shrink-0"
                          style={{
                            background: item.color_hex
                              ? item.color_hex
                              : 'linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)'
                          }}
                        />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate text-sm">
                            {item.effect_name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
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

                        {/* Voting & Trash */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Thumbs Up */}
                          <button
                            onClick={() => handleLedVote(item.id, userVote, 1)}
                            disabled={!canControl}
                            className={`p-1.5 rounded-lg transition ${
                              userVote === 1
                                ? 'bg-green-100 text-green-600'
                                : canControl
                                ? 'text-gray-400 hover:bg-green-50 hover:text-green-600'
                                : 'text-gray-300'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title="Upvote"
                          >
                            <svg className="w-5 h-5" fill={userVote === 1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                            </svg>
                          </button>

                          {/* Thumbs Down */}
                          <button
                            onClick={() => handleLedVote(item.id, userVote, -1)}
                            disabled={!canControl}
                            className={`p-1.5 rounded-lg transition ${
                              userVote === -1
                                ? 'bg-red-100 text-red-600'
                                : canControl
                                ? 'text-gray-400 hover:bg-red-50 hover:text-red-600'
                                : 'text-gray-300'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title="Downvote"
                          >
                            <svg className="w-5 h-5" fill={userVote === -1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                            </svg>
                          </button>

                          {/* Trash */}
                          <button
                            onClick={async () => {
                              const result = await trashLed(item.id)
                              if (result.warning || result.error) {
                                setTrashWarning(result.warning || result.error || null)
                                setTimeout(() => setTrashWarning(null), 5000)
                              }
                            }}
                            disabled={!canControl || ledTrashRateLimit.remaining === 0}
                            className={`p-1.5 rounded-lg transition ${
                              ledTrashRateLimit.remaining === 0
                                ? 'text-gray-300 cursor-not-allowed'
                                : canControl
                                ? 'text-gray-400 hover:bg-red-50 hover:text-red-600'
                                : 'text-gray-300'
                            } disabled:opacity-50`}
                            title={ledTrashRateLimit.remaining === 0
                              ? `Resets in ${ledTrashRateLimit.resetsIn || '?'} min`
                              : `Remove immediately (${ledTrashRateLimit.remaining} left)`}
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

            {/* LED Settings */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">LED Settings</h2>
              </div>
              <div className="p-4">
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">Change Interval</span>
                  <span className="text-sm font-medium text-purple-600">
                    {status?.ledChangeIntervalMinutes || 10} min
                  </span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={status?.ledChangeIntervalMinutes || 10}
                  onChange={(e) => setLedChangeInterval(parseInt(e.target.value, 10))}
                  disabled={!canControl}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1 min</span>
                  <span>60 min</span>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Pattern Browser Modal */}
      {showPatternBrowser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-lg max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(selectedCategory || patternSearchQuery) && (
                  <button
                    onClick={() => {
                      setSelectedCategory(null)
                      setPatternSearchQuery('')
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {selectedCategory
                      ? PATTERN_CATEGORIES.find(c => c.id === selectedCategory)?.label
                      : patternSearchQuery
                      ? `Search: "${patternSearchQuery}"`
                      : 'Find Patterns'}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {selectedCategory || patternSearchQuery
                      ? `${allFilteredPatterns.length} patterns`
                      : `${patterns.length} patterns in library`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowPatternBrowser(false)
                  setPatternSearchQuery('')
                  setSelectedCategory(null)
                }}
                className="p-2 text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Feedback Toast */}
            {submitFeedback && (
              <div className={`mx-4 mt-3 px-4 py-2 rounded-lg text-sm font-medium ${
                submitFeedback.includes('Added') ? 'bg-green-100 text-green-700' :
                submitFeedback.includes('Adding') ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>
                {submitFeedback}
              </div>
            )}

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Category Selection (home state) */}
              {!selectedCategory && !patternSearchQuery ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {PATTERN_CATEGORIES.map(category => {
                      const count = patterns.filter(p =>
                        category.keywords.some(kw => p.name.toLowerCase().includes(kw))
                      ).length
                      return (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl text-left hover:from-amber-100 hover:to-orange-100 transition border border-amber-100"
                        >
                          <p className="font-semibold text-gray-900">{category.label}</p>
                          <p className="text-xs text-gray-500 mt-1">{count} patterns</p>
                        </button>
                      )
                    })}
                  </div>

                  {/* All patterns option */}
                  <button
                    onClick={() => setPatternSearchQuery(' ')}
                    className="w-full p-3 bg-gray-50 rounded-xl text-center hover:bg-gray-100 transition border border-gray-200"
                  >
                    <p className="font-medium text-gray-700">Browse All {patterns.length} Patterns</p>
                  </button>
                </div>
              ) : filteredPatterns.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No patterns found</p>
                  <p className="text-sm mt-1">Try a different category or search term</p>
                </div>
              ) : (
                /* Pattern Grid */
                <div className="grid grid-cols-2 gap-3">
                  {filteredPatterns.map(pattern => (
                    <div
                      key={pattern.id}
                      className="relative rounded-lg overflow-hidden bg-amber-50"
                    >
                      {/* Pattern image */}
                      <div className="aspect-square">
                        {pattern.thumbnail_url ? (
                          <img
                            src={pattern.thumbnail_url}
                            alt={pattern.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100">
                            <span className="text-2xl font-bold text-amber-300">
                              {pattern.name.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Pattern name and Add button */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-8">
                        <p className="text-white text-sm font-medium truncate mb-1.5">{pattern.name}</p>
                        <button
                          onClick={() => handleSubmitPattern(pattern)}
                          className={`w-full py-2 rounded-lg text-xs font-semibold transition ${
                            canControl
                              ? 'bg-amber-500 text-white active:bg-amber-600'
                              : 'bg-white/20 text-white/80'
                          }`}
                        >
                          {canControl ? '+ Add to Queue' : 'Scan in to add'}
                        </button>
                      </div>

                      {/* Favorite button (backend handles auth/demo fallback) */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            if (isPatternFavorite(pattern.id)) {
                              await removePatternFavorite(pattern.id)
                              setSubmitFeedback('Removed from favorites')
                            } else {
                              await addPatternFavorite(pattern.id, pattern.name, pattern.thumbnail_url || undefined)
                              setSubmitFeedback('Added to favorites!')
                            }
                            setTimeout(() => setSubmitFeedback(null), 2000)
                          } catch (err) {
                            setSubmitFeedback(`Favorite error: ${err instanceof Error ? err.message : String(err)}`)
                            setTimeout(() => setSubmitFeedback(null), 5000)
                          }
                        }}
                        className={`absolute top-2 right-2 p-2 rounded-full transition z-20 ${
                          isPatternFavorite(pattern.id)
                            ? 'bg-amber-500 text-white'
                            : 'bg-white/90 text-gray-400 active:bg-white'
                        }`}
                      >
                        <svg
                          className="w-5 h-5"
                          fill={isPatternFavorite(pattern.id) ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Load more indicator */}
                  {hasMorePatterns && (
                    <div className="col-span-2 text-center py-4 text-gray-500 text-sm">
                      Showing {filteredPatterns.length} of {allFilteredPatterns.length} — use search to find more
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Search Bar at Bottom */}
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={patternSearchQuery}
                  onChange={e => {
                    setPatternSearchQuery(e.target.value)
                    if (e.target.value) setSelectedCategory(null)
                  }}
                  placeholder="Search all patterns..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                />
                {patternSearchQuery && (
                  <button
                    onClick={() => setPatternSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
