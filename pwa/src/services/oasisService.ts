import { haWebSocket } from './haWebSocket'
import type { HAState } from './types'

// Oasis Mini entity IDs - configure based on your HA setup
const OASIS_SELECT_ENTITY = 'select.oasis_mini_track'
const OASIS_SWITCH_ENTITY = 'switch.oasis_mini'
const OASIS_SENSOR_ENTITY = 'sensor.oasis_mini_status'

export interface SandPattern {
  id: string
  name: string
  thumbnail?: string
}

export interface OasisState {
  isPlaying: boolean
  currentPattern: string | null
  availablePatterns: SandPattern[]
  status: 'idle' | 'playing' | 'paused' | 'busy' | 'unknown'
  progress: number
}

export class OasisService {
  private stateChangeSubscription: number | null = null

  // Parse available patterns from select entity options
  private parsePatterns(state: HAState): SandPattern[] {
    const options = (state.attributes?.options as string[]) || []
    return options.map((name, index) => ({
      id: `pattern_${index}`,
      name,
      thumbnail: undefined // Could map to actual thumbnails if available
    }))
  }

  // Parse current state from entities
  private parseOasisState(
    selectState: HAState | undefined,
    switchState: HAState | undefined,
    sensorState: HAState | undefined
  ): OasisState {
    const currentPattern = selectState?.state || null
    const isPlaying = switchState?.state === 'on'
    const availablePatterns = selectState ? this.parsePatterns(selectState) : []

    let status: OasisState['status'] = 'unknown'
    if (sensorState) {
      const sensorValue = sensorState.state?.toLowerCase()
      if (sensorValue === 'playing' || sensorValue === 'drawing') {
        status = 'playing'
      } else if (sensorValue === 'paused') {
        status = 'paused'
      } else if (sensorValue === 'idle' || sensorValue === 'ready') {
        status = 'idle'
      } else if (sensorValue === 'busy') {
        status = 'busy'
      }
    } else {
      status = isPlaying ? 'playing' : 'idle'
    }

    // Progress could come from a sensor attribute
    const progress = (sensorState?.attributes?.progress as number) || 0

    return {
      isPlaying,
      currentPattern,
      availablePatterns,
      status,
      progress
    }
  }

  // Get current state
  async getState(): Promise<OasisState> {
    try {
      const states = await haWebSocket.getStates()
      const selectState = states.find(s => s.entity_id === OASIS_SELECT_ENTITY)
      const switchState = states.find(s => s.entity_id === OASIS_SWITCH_ENTITY)
      const sensorState = states.find(s => s.entity_id === OASIS_SENSOR_ENTITY)

      return this.parseOasisState(selectState, switchState, sensorState)
    } catch (err) {
      console.error('[Oasis] Failed to get state:', err)
      return {
        isPlaying: false,
        currentPattern: null,
        availablePatterns: [],
        status: 'unknown',
        progress: 0
      }
    }
  }

  // Subscribe to state changes
  async subscribeToChanges(
    onUpdate: (state: OasisState) => void
  ): Promise<() => void> {
    // Get initial state
    const initial = await this.getState()
    onUpdate(initial)

    // Subscribe to state changes
    this.stateChangeSubscription = await haWebSocket.subscribeStateChanges(
      async (entityId) => {
        if (
          entityId === OASIS_SELECT_ENTITY ||
          entityId === OASIS_SWITCH_ENTITY ||
          entityId === OASIS_SENSOR_ENTITY
        ) {
          const updated = await this.getState()
          onUpdate(updated)
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

  // Select and play a pattern
  async playPattern(patternName: string): Promise<void> {
    // First select the pattern
    await haWebSocket.callService('select', 'select_option', {
      option: patternName
    }, {
      entity_id: OASIS_SELECT_ENTITY
    })

    // Then turn on the device to start playing
    await haWebSocket.callService('switch', 'turn_on', undefined, {
      entity_id: OASIS_SWITCH_ENTITY
    })
  }

  // Pause playback
  async pause(): Promise<void> {
    await haWebSocket.callService('switch', 'turn_off', undefined, {
      entity_id: OASIS_SWITCH_ENTITY
    })
  }

  // Resume playback
  async resume(): Promise<void> {
    await haWebSocket.callService('switch', 'turn_on', undefined, {
      entity_id: OASIS_SWITCH_ENTITY
    })
  }

  // Toggle playback
  async toggle(): Promise<void> {
    await haWebSocket.callService('switch', 'toggle', undefined, {
      entity_id: OASIS_SWITCH_ENTITY
    })
  }

  // Set LED brightness (if supported)
  async setLedBrightness(brightness: number): Promise<void> {
    // Some Oasis Mini setups have a light entity for LED control
    await haWebSocket.callService('light', 'turn_on', {
      brightness: Math.round((brightness / 100) * 255)
    }, {
      entity_id: 'light.oasis_mini_led'
    })
  }
}

// Singleton instance
export const oasisService = new OasisService()
