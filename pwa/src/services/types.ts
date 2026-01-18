// Home Assistant WebSocket API Types

export interface HAAuthMessage {
  type: 'auth'
  access_token: string
}

export interface HAMessage {
  id?: number
  type: string
  [key: string]: unknown
}

export interface HAResultMessage {
  id: number
  type: 'result'
  success: boolean
  result?: unknown
  error?: {
    code: string
    message: string
  }
}

export interface HAEventMessage {
  id: number
  type: 'event'
  event: {
    event_type: string
    data: Record<string, unknown>
    origin: string
    time_fired: string
  }
}

export interface HAState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

// Presence-specific types
export interface StaffMember {
  id: string
  name: string
  entityId: string
  isPresent: boolean
  arrivedAt: string | null
  avatarInitials: string
  email?: string
  avatarUrl?: string
}

export interface PresenceState {
  staff: StaffMember[]
  currentUser: StaffMember | null
  isConnected: boolean
  isAuthenticated: boolean
  error: string | null
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'error'

// Check-in location types
export interface CheckInLocation {
  id: string
  name: string
  type: 'entrance' | 'exit' | 'general'
}

export interface CheckInResult {
  success: boolean
  userId: string
  locationId: string
  locationName: string
  action: 'check-in' | 'check-out'
  timestamp: string
  error?: string
}
