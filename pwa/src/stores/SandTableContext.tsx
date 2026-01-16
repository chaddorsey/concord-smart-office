import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { oasisService, type OasisState } from '../services/oasisService'
import { MOCK_OASIS_PATTERNS } from '../services/mockData'
import { useAuth } from './AuthContext'
import { usePresence } from './PresenceContext'

// Voting threshold - pattern with most votes wins when threshold met
const VOTE_THRESHOLD = 0.5 // 50% of present users must vote

interface VotingState {
  votes: Map<string, Set<string>> // patternName -> Set of userIds
  userVote: string | null // Current user's voted pattern
}

interface SandTableState {
  oasis: OasisState
  isLoading: boolean
  error: string | null
  voting: VotingState
  votesNeeded: number
  leadingPattern: { name: string; votes: number } | null
}

interface SandTableContextValue extends SandTableState {
  playPattern: (patternName: string) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  voteForPattern: (patternName: string) => void
  clearVote: () => void
  getVotesForPattern: (patternName: string) => number
  canControl: boolean
}

const SandTableContext = createContext<SandTableContextValue | null>(null)

export function SandTableProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isMockMode } = useAuth()
  const { currentUserId, isCurrentUserPresent, presentCount } = usePresence()

  const [state, setState] = useState<SandTableState>({
    oasis: {
      isPlaying: false,
      currentPattern: null,
      availablePatterns: [],
      status: 'unknown',
      progress: 0
    },
    isLoading: false,
    error: null,
    voting: {
      votes: new Map(),
      userVote: null
    },
    votesNeeded: 1,
    leadingPattern: null
  })

  // Calculate votes needed
  const votesNeeded = Math.max(1, Math.ceil(presentCount * VOTE_THRESHOLD))

  // Subscribe to Oasis state changes
  useEffect(() => {
    if (!isAuthenticated) {
      setState(prev => ({
        ...prev,
        oasis: {
          isPlaying: false,
          currentPattern: null,
          availablePatterns: [],
          status: 'unknown',
          progress: 0
        },
        isLoading: false
      }))
      return
    }

    // Use mock data in mock mode
    if (isMockMode) {
      setState(prev => ({
        ...prev,
        oasis: {
          isPlaying: true,
          currentPattern: MOCK_OASIS_PATTERNS[0].name,
          availablePatterns: MOCK_OASIS_PATTERNS.map((p, i) => ({
            id: `pattern_${i}`,
            name: p.name,
            thumbnail: undefined
          })),
          status: 'playing',
          progress: 35
        },
        isLoading: false,
        error: null
      }))
      return
    }

    setState(prev => ({ ...prev, isLoading: true }))

    let unsubscribe: (() => void) | null = null

    oasisService
      .subscribeToChanges((oasisState) => {
        setState(prev => {
          // Reset votes if pattern changed (someone manually changed it or vote won)
          const patternChanged = oasisState.currentPattern !== prev.oasis.currentPattern

          return {
            ...prev,
            oasis: oasisState,
            isLoading: false,
            error: null,
            // Reset votes on pattern change
            voting: patternChanged ? { votes: new Map(), userVote: null } : prev.voting
          }
        })
      })
      .then((unsub) => {
        unsubscribe = unsub
      })
      .catch((err) => {
        console.error('[SandTable] Failed to subscribe:', err)
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to connect to sand table'
        }))
      })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [isAuthenticated, isMockMode])

  // Update votes needed when present count changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      votesNeeded
    }))
  }, [votesNeeded])

  // Calculate leading pattern and check if threshold met
  useEffect(() => {
    const { votes } = state.voting

    let leadingName: string | null = null
    let leadingVotes = 0

    votes.forEach((voters, patternName) => {
      const voteCount = voters.size
      if (voteCount > leadingVotes) {
        leadingName = patternName
        leadingVotes = voteCount
      }
    })

    const newLeading = leadingName ? { name: leadingName, votes: leadingVotes } : null
    setState(prev => ({ ...prev, leadingPattern: newLeading }))

    // Check if leading pattern has enough votes
    if (newLeading && newLeading.votes >= votesNeeded) {
      if (isMockMode) {
        // Mock auto-play - update state directly
        setState(prev => ({
          ...prev,
          oasis: {
            ...prev.oasis,
            currentPattern: newLeading.name,
            isPlaying: true,
            status: 'playing',
            progress: 0
          },
          voting: { votes: new Map(), userVote: null }
        }))
      } else {
        // Play the winning pattern
        oasisService.playPattern(newLeading.name).catch(err => {
          console.error('[SandTable] Auto-play failed:', err)
        })
      }
    }
  }, [state.voting.votes, votesNeeded, isMockMode])

  const playPattern = useCallback(async (patternName: string) => {
    if (isMockMode) {
      setState(prev => ({
        ...prev,
        oasis: {
          ...prev.oasis,
          currentPattern: patternName,
          isPlaying: true,
          status: 'playing',
          progress: 0
        },
        voting: { votes: new Map(), userVote: null }
      }))
      return
    }
    try {
      await oasisService.playPattern(patternName)
    } catch (err) {
      console.error('[SandTable] Play pattern failed:', err)
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to play pattern'
      }))
    }
  }, [isMockMode])

  const pause = useCallback(async () => {
    if (isMockMode) {
      setState(prev => ({
        ...prev,
        oasis: { ...prev.oasis, isPlaying: false, status: 'paused' }
      }))
      return
    }
    try {
      await oasisService.pause()
    } catch (err) {
      console.error('[SandTable] Pause failed:', err)
    }
  }, [isMockMode])

  const resume = useCallback(async () => {
    if (isMockMode) {
      setState(prev => ({
        ...prev,
        oasis: { ...prev.oasis, isPlaying: true, status: 'playing' }
      }))
      return
    }
    try {
      await oasisService.resume()
    } catch (err) {
      console.error('[SandTable] Resume failed:', err)
    }
  }, [isMockMode])

  const voteForPattern = useCallback((patternName: string) => {
    if (!currentUserId || !isCurrentUserPresent) {
      return
    }

    setState(prev => {
      const newVotes = new Map(prev.voting.votes)

      // Remove previous vote if exists
      if (prev.voting.userVote) {
        const prevVoters = newVotes.get(prev.voting.userVote)
        if (prevVoters) {
          prevVoters.delete(currentUserId)
          if (prevVoters.size === 0) {
            newVotes.delete(prev.voting.userVote)
          }
        }
      }

      // Add new vote
      if (!newVotes.has(patternName)) {
        newVotes.set(patternName, new Set())
      }
      newVotes.get(patternName)!.add(currentUserId)

      return {
        ...prev,
        voting: {
          votes: newVotes,
          userVote: patternName
        }
      }
    })
  }, [currentUserId, isCurrentUserPresent])

  const clearVote = useCallback(() => {
    if (!currentUserId) return

    setState(prev => {
      if (!prev.voting.userVote) return prev

      const newVotes = new Map(prev.voting.votes)
      const voters = newVotes.get(prev.voting.userVote)
      if (voters) {
        voters.delete(currentUserId)
        if (voters.size === 0) {
          newVotes.delete(prev.voting.userVote)
        }
      }

      return {
        ...prev,
        voting: {
          votes: newVotes,
          userVote: null
        }
      }
    })
  }, [currentUserId])

  const getVotesForPattern = useCallback((patternName: string): number => {
    return state.voting.votes.get(patternName)?.size || 0
  }, [state.voting.votes])

  const canControl = isCurrentUserPresent

  return (
    <SandTableContext.Provider
      value={{
        ...state,
        votesNeeded,
        playPattern,
        pause,
        resume,
        voteForPattern,
        clearVote,
        getVotesForPattern,
        canControl
      }}
    >
      {children}
    </SandTableContext.Provider>
  )
}

export function useSandTable() {
  const context = useContext(SandTableContext)
  if (!context) {
    throw new Error('useSandTable must be used within SandTableProvider')
  }
  return context
}
