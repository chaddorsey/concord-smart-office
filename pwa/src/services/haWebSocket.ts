import type { HAMessage, HAResultMessage, HAEventMessage, HAState, ConnectionStatus } from './types'

type MessageHandler = (message: HAResultMessage | HAEventMessage) => void
type StatusHandler = (status: ConnectionStatus) => void

export class HAWebSocketService {
  private ws: WebSocket | null = null
  private url: string = ''
  private accessToken: string = ''
  private messageId: number = 1
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map()
  private eventSubscribers: Map<number, MessageHandler> = new Map()
  private statusListeners: Set<StatusHandler> = new Set()
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 1000
  private _status: ConnectionStatus = 'disconnected'

  get status(): ConnectionStatus {
    return this._status
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status
    this.statusListeners.forEach(listener => listener(status))
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusListeners.add(handler)
    return () => this.statusListeners.delete(handler)
  }

  async connect(url: string, accessToken: string): Promise<void> {
    this.url = url.replace(/^http/, 'ws') + '/api/websocket'
    this.accessToken = accessToken

    return new Promise((resolve, reject) => {
      this.setStatus('connecting')

      try {
        this.ws = new WebSocket(this.url)
      } catch (error) {
        this.setStatus('error')
        reject(new Error('Failed to create WebSocket connection'))
        return
      }

      this.ws.onopen = () => {
        console.log('[HA WS] Connection opened')
      }

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as HAMessage

        switch (message.type) {
          case 'auth_required':
            this.sendAuth()
            break

          case 'auth_ok':
            console.log('[HA WS] Authenticated successfully')
            this.setStatus('authenticated')
            this.reconnectAttempts = 0
            resolve()
            break

          case 'auth_invalid':
            console.error('[HA WS] Authentication failed')
            this.setStatus('error')
            reject(new Error('Invalid access token'))
            break

          case 'result':
            this.handleResult(message as unknown as HAResultMessage)
            break

          case 'event':
            this.handleEvent(message as unknown as HAEventMessage)
            break

          default:
            console.log('[HA WS] Unknown message type:', message.type)
        }
      }

      this.ws.onerror = (error) => {
        console.error('[HA WS] WebSocket error:', error)
        this.setStatus('error')
      }

      this.ws.onclose = () => {
        console.log('[HA WS] Connection closed')
        this.setStatus('disconnected')
        this.attemptReconnect()
      }
    })
  }

  private sendAuth() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'auth',
        access_token: this.accessToken
      }))
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[HA WS] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`[HA WS] Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      if (this.url && this.accessToken) {
        this.connect(this.url.replace('/api/websocket', '').replace(/^ws/, 'http'), this.accessToken)
          .catch(err => console.error('[HA WS] Reconnect failed:', err))
      }
    }, delay)
  }

  private handleResult(message: HAResultMessage) {
    const pending = this.pendingRequests.get(message.id)
    if (pending) {
      this.pendingRequests.delete(message.id)
      if (message.success) {
        pending.resolve(message.result)
      } else {
        pending.reject(new Error(message.error?.message || 'Unknown error'))
      }
    }
  }

  private handleEvent(message: HAEventMessage) {
    const handler = this.eventSubscribers.get(message.id)
    if (handler) {
      handler(message)
    }
  }

  async sendCommand<T = unknown>(message: Omit<HAMessage, 'id'>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

      const id = this.messageId++
      const fullMessage = { ...message, id }

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject
      })

      this.ws.send(JSON.stringify(fullMessage))
    })
  }

  async getStates(): Promise<HAState[]> {
    return this.sendCommand<HAState[]>({ type: 'get_states' })
  }

  async getState(entityId: string): Promise<HAState | undefined> {
    const states = await this.getStates()
    return states.find(s => s.entity_id === entityId)
  }

  async callService(domain: string, service: string, data?: Record<string, unknown>, target?: { entity_id: string | string[] }): Promise<void> {
    await this.sendCommand({
      type: 'call_service',
      domain,
      service,
      service_data: data,
      target
    })
  }

  async subscribeEvents(eventType: string, handler: MessageHandler): Promise<number> {
    const id = this.messageId++

    await this.sendCommand({
      type: 'subscribe_events',
      event_type: eventType
    })

    this.eventSubscribers.set(id, handler)
    return id
  }

  async subscribeStateChanges(handler: (entityId: string, newState: HAState, oldState: HAState) => void): Promise<number> {
    return this.subscribeEvents('state_changed', (message) => {
      if (message.type === 'event') {
        const { entity_id, new_state, old_state } = message.event.data as {
          entity_id: string
          new_state: HAState
          old_state: HAState
        }
        handler(entity_id, new_state, old_state)
      }
    })
  }

  unsubscribeEvents(subscriptionId: number) {
    this.eventSubscribers.delete(subscriptionId)
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.pendingRequests.clear()
    this.eventSubscribers.clear()
    this.setStatus('disconnected')
  }
}

// Singleton instance
export const haWebSocket = new HAWebSocketService()
