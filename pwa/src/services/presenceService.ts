import { haWebSocket } from './haWebSocket'
import type { StaffMember, HAState } from './types'

// Entity ID patterns for presence tracking
// In HA, presence can be tracked via:
// - input_boolean.staff_<name>_present
// - person.<name>
// - binary_sensor.staff_<name>_present
const PRESENCE_ENTITY_PREFIX = 'input_boolean.staff_'
const PRESENCE_ENTITY_SUFFIX = '_present'

export class PresenceService {
  private stateChangeSubscription: number | null = null

  // Get initials from a name
  private getInitials(name: string): string {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Convert entity_id to display name
  private entityIdToName(entityId: string): string {
    // input_boolean.staff_john_doe_present -> John Doe
    const match = entityId.match(/staff_(.+)_present$/)
    if (match) {
      return match[1]
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    }
    return entityId
  }

  // Convert name to entity_id
  private nameToEntityId(name: string): string {
    const slug = name.toLowerCase().replace(/\s+/g, '_')
    return `${PRESENCE_ENTITY_PREFIX}${slug}${PRESENCE_ENTITY_SUFFIX}`
  }

  // Parse HA state to StaffMember
  private stateToStaffMember(state: HAState): StaffMember | null {
    if (!state.entity_id.startsWith(PRESENCE_ENTITY_PREFIX)) {
      return null
    }

    const name = this.entityIdToName(state.entity_id)
    const isPresent = state.state === 'on'

    return {
      id: state.entity_id,
      name,
      entityId: state.entity_id,
      isPresent,
      arrivedAt: isPresent ? state.last_changed : null,
      avatarInitials: this.getInitials(name)
    }
  }

  // Get all staff members with their presence status
  async getStaffPresence(): Promise<StaffMember[]> {
    const states = await haWebSocket.getStates()

    return states
      .filter(state => state.entity_id.startsWith(PRESENCE_ENTITY_PREFIX))
      .map(state => this.stateToStaffMember(state))
      .filter((member): member is StaffMember => member !== null)
      .sort((a, b) => {
        // Sort: present first, then by arrival time
        if (a.isPresent && !b.isPresent) return -1
        if (!a.isPresent && b.isPresent) return 1
        if (a.arrivedAt && b.arrivedAt) {
          return new Date(b.arrivedAt).getTime() - new Date(a.arrivedAt).getTime()
        }
        return a.name.localeCompare(b.name)
      })
  }

  // Get only present staff
  async getPresentStaff(): Promise<StaffMember[]> {
    const staff = await this.getStaffPresence()
    return staff.filter(s => s.isPresent)
  }

  // Scan in a staff member
  async scanIn(staffId: string): Promise<void> {
    await haWebSocket.callService('input_boolean', 'turn_on', undefined, {
      entity_id: staffId
    })
  }

  // Scan out a staff member
  async scanOut(staffId: string): Promise<void> {
    await haWebSocket.callService('input_boolean', 'turn_off', undefined, {
      entity_id: staffId
    })
  }

  // Toggle presence
  async togglePresence(staffId: string): Promise<void> {
    await haWebSocket.callService('input_boolean', 'toggle', undefined, {
      entity_id: staffId
    })
  }

  // Fire a custom event for scan actions (can trigger HA automations)
  async fireScanEvent(staffId: string, action: 'scan_in' | 'scan_out'): Promise<void> {
    await haWebSocket.callService('script', 'turn_on', {
      entity_id: 'script.staff_scan_event',
      variables: {
        staff_id: staffId,
        action,
        timestamp: new Date().toISOString()
      }
    })
  }

  // Subscribe to presence changes
  async subscribeToPresenceChanges(
    onUpdate: (staff: StaffMember[]) => void
  ): Promise<() => void> {
    // Get initial state
    const initialStaff = await this.getStaffPresence()
    onUpdate(initialStaff)

    // Subscribe to state changes
    this.stateChangeSubscription = await haWebSocket.subscribeStateChanges(
      async (entityId, _newState, _oldState) => {
        if (entityId.startsWith(PRESENCE_ENTITY_PREFIX)) {
          // Refresh the full list on any presence change
          const updatedStaff = await this.getStaffPresence()
          onUpdate(updatedStaff)
        }
      }
    )

    return () => {
      if (this.stateChangeSubscription !== null) {
        haWebSocket.unsubscribeEvents(this.stateChangeSubscription)
        this.stateChangeSubscription = null
      }
    }
  }

  // Create a new staff member entity (requires HA to be set up appropriately)
  async createStaffMember(name: string): Promise<string> {
    const entityId = this.nameToEntityId(name)

    // This would typically be done via the HA config, but we can try via service
    // Note: This requires the input_boolean integration to be configured in HA
    console.log(`[Presence] Would create entity: ${entityId}`)

    // In practice, staff entities should be pre-configured in HA's configuration.yaml:
    // input_boolean:
    //   staff_john_doe_present:
    //     name: John Doe Present
    //     icon: mdi:account

    return entityId
  }
}

// Singleton instance
export const presenceService = new PresenceService()
