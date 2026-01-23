/**
 * Beacon Context
 *
 * Manages BLE beacon state, claiming, and entrance profiles.
 * Provides access to the user's claimed beacon and available beacons.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

const BACKEND_URL = ''

const getHeaders = (extra?: Record<string, string>) => ({
  'ngrok-skip-browser-warning': 'true',
  ...extra
})

export interface Beacon {
  id: number
  mac_address: string | null
  beacon_uuid: string | null
  major: number | null
  minor: number | null
  friendly_name: string | null
  claimed_by_user_id: number | null
  claimed_by_name: string | null
  claimed_by_email: string | null
  last_room_id: string | null
  last_proxy_id: string | null
  last_rssi: number | null
  last_seen_at: string | null
  entrance_profile: string
  entrance_state: string
  created_at: string
}

export interface EntranceProfile {
  id: string
  name: string
  description: string
}

interface BeaconState {
  myBeacon: Beacon | null
  availableBeacons: Beacon[]
  entranceProfiles: EntranceProfile[]
  isLoading: boolean
  error: string | null
}

interface BeaconContextValue extends BeaconState {
  fetchMyBeacon: () => Promise<void>
  fetchAvailableBeacons: () => Promise<void>
  fetchEntranceProfiles: () => Promise<void>
  claimBeacon: (beaconId: number) => Promise<void>
  claimBeaconByMac: (macAddress: string) => Promise<void>
  unclaimBeacon: () => Promise<void>
  setEntranceProfile: (profile: string) => Promise<void>
}

const BeaconContext = createContext<BeaconContextValue | null>(null)

export function BeaconProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()

  const [state, setState] = useState<BeaconState>({
    myBeacon: null,
    availableBeacons: [],
    entranceProfiles: [],
    isLoading: false,
    error: null
  })

  // Fetch user's claimed beacon
  const fetchMyBeacon = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      const response = await fetch(`${BACKEND_URL}/api/beacons/mine`, {
        credentials: 'include',
        headers: getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setState(prev => ({
          ...prev,
          myBeacon: data.beacon || null,
          error: null
        }))
      }
    } catch (err) {
      console.error('[Beacon] Failed to fetch my beacon:', err)
    }
  }, [isAuthenticated])

  // Fetch available (unclaimed) beacons
  const fetchAvailableBeacons = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      const response = await fetch(`${BACKEND_URL}/api/beacons/available`, {
        credentials: 'include',
        headers: getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setState(prev => ({
          ...prev,
          availableBeacons: data.beacons || [],
          error: null
        }))
      }
    } catch (err) {
      console.error('[Beacon] Failed to fetch available beacons:', err)
    }
  }, [isAuthenticated])

  // Fetch entrance profiles
  const fetchEntranceProfiles = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/entrance-profiles`, {
        headers: getHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setState(prev => ({
          ...prev,
          entranceProfiles: data.profiles || []
        }))
      }
    } catch (err) {
      console.error('[Beacon] Failed to fetch entrance profiles:', err)
    }
  }, [])

  // Claim a beacon by ID
  const claimBeacon = useCallback(async (beaconId: number) => {
    if (!isAuthenticated) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch(`${BACKEND_URL}/api/beacons/claim`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ beaconId })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to claim beacon')
      }

      const data = await response.json()
      setState(prev => ({
        ...prev,
        myBeacon: data.beacon,
        availableBeacons: prev.availableBeacons.filter(b => b.id !== beaconId),
        isLoading: false
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim beacon'
      setState(prev => ({ ...prev, isLoading: false, error: message }))
      throw err
    }
  }, [isAuthenticated])

  // Claim a beacon by MAC address (from QR scan)
  const claimBeaconByMac = useCallback(async (macAddress: string) => {
    if (!isAuthenticated) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch(`${BACKEND_URL}/api/beacons/claim`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ mac_address: macAddress })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to claim beacon')
      }

      const data = await response.json()
      setState(prev => ({
        ...prev,
        myBeacon: data.beacon,
        isLoading: false
      }))

      // Refresh available beacons
      fetchAvailableBeacons()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim beacon'
      setState(prev => ({ ...prev, isLoading: false, error: message }))
      throw err
    }
  }, [isAuthenticated, fetchAvailableBeacons])

  // Unclaim current beacon
  const unclaimBeacon = useCallback(async () => {
    if (!isAuthenticated || !state.myBeacon) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch(`${BACKEND_URL}/api/beacons/unclaim`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders()
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to unclaim beacon')
      }

      setState(prev => ({
        ...prev,
        myBeacon: null,
        isLoading: false
      }))

      // Refresh available beacons
      fetchAvailableBeacons()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unclaim beacon'
      setState(prev => ({ ...prev, isLoading: false, error: message }))
      throw err
    }
  }, [isAuthenticated, state.myBeacon, fetchAvailableBeacons])

  // Set entrance profile for current beacon
  const setEntranceProfile = useCallback(async (profile: string) => {
    if (!isAuthenticated || !state.myBeacon) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch(`${BACKEND_URL}/api/beacons/${state.myBeacon.id}/entrance-profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ profile })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to set entrance profile')
      }

      const data = await response.json()
      setState(prev => ({
        ...prev,
        myBeacon: data.beacon,
        isLoading: false
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set entrance profile'
      setState(prev => ({ ...prev, isLoading: false, error: message }))
      throw err
    }
  }, [isAuthenticated, state.myBeacon])

  // Initial fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchMyBeacon()
      fetchEntranceProfiles()
    }
  }, [isAuthenticated, fetchMyBeacon, fetchEntranceProfiles])

  return (
    <BeaconContext.Provider value={{
      ...state,
      fetchMyBeacon,
      fetchAvailableBeacons,
      fetchEntranceProfiles,
      claimBeacon,
      claimBeaconByMac,
      unclaimBeacon,
      setEntranceProfile
    }}>
      {children}
    </BeaconContext.Provider>
  )
}

export function useBeacon() {
  const context = useContext(BeaconContext)
  if (!context) {
    throw new Error('useBeacon must be used within BeaconProvider')
  }
  return context
}
