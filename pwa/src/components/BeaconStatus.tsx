/**
 * Beacon Status Component
 *
 * Displays the user's BLE beacon status including:
 * - Connection status indicator
 * - Signal strength
 * - Last detected room
 * - Entrance state
 */

import { useBeacon } from '../stores/BeaconContext'

interface BeaconStatusProps {
  compact?: boolean
  onClick?: () => void
}

export default function BeaconStatus({ compact = false, onClick }: BeaconStatusProps) {
  const { myBeacon } = useBeacon()

  // No beacon claimed
  if (!myBeacon) {
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-2 ${
          compact
            ? 'p-2 bg-gray-100 rounded-lg'
            : 'p-3 bg-gray-50 border border-gray-200 rounded-xl w-full'
        } hover:bg-gray-100 transition`}
      >
        <div className="w-3 h-3 rounded-full bg-gray-300" />
        <span className="text-sm text-gray-500">No beacon linked</span>
        {!compact && (
          <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>
    )
  }

  // Calculate signal strength category
  const getSignalStrength = () => {
    if (!myBeacon.last_rssi || !myBeacon.last_seen_at) return 'offline'

    const ageMs = Date.now() - new Date(myBeacon.last_seen_at).getTime()
    if (ageMs > 5 * 60 * 1000) return 'offline' // > 5 min = offline

    const rssi = myBeacon.last_rssi
    if (rssi >= -50) return 'strong'
    if (rssi >= -65) return 'good'
    if (rssi >= -80) return 'weak'
    return 'poor'
  }

  const signalStrength = getSignalStrength()

  // Signal indicator color
  const getSignalColor = () => {
    switch (signalStrength) {
      case 'strong': return 'bg-green-500'
      case 'good': return 'bg-yellow-500'
      case 'weak': return 'bg-orange-500'
      case 'poor': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  // Entrance state display
  const getEntranceStateDisplay = () => {
    switch (myBeacon.entrance_state) {
      case 'inside': return { text: 'Inside', color: 'text-green-600' }
      case 'outside': return { text: 'Outside', color: 'text-gray-500' }
      case 'transitioning': return { text: 'At door', color: 'text-amber-600' }
      default: return { text: 'Unknown', color: 'text-gray-400' }
    }
  }

  const entranceState = getEntranceStateDisplay()

  // Format last seen time
  const formatLastSeen = () => {
    if (!myBeacon.last_seen_at) return 'Never'

    const ageMs = Date.now() - new Date(myBeacon.last_seen_at).getTime()
    const seconds = Math.floor(ageMs / 1000)

    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return 'Over a day ago'
  }

  // Compact view (for header/nav)
  if (compact) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
        title={`Beacon: ${myBeacon.friendly_name || myBeacon.mac_address}`}
      >
        {/* Signal bars */}
        <div className="flex items-end gap-0.5 h-4">
          <div className={`w-1 h-1 rounded-sm ${signalStrength !== 'offline' ? getSignalColor() : 'bg-gray-300'}`} />
          <div className={`w-1 h-2 rounded-sm ${['strong', 'good', 'weak'].includes(signalStrength) ? getSignalColor() : 'bg-gray-300'}`} />
          <div className={`w-1 h-3 rounded-sm ${['strong', 'good'].includes(signalStrength) ? getSignalColor() : 'bg-gray-300'}`} />
          <div className={`w-1 h-4 rounded-sm ${signalStrength === 'strong' ? getSignalColor() : 'bg-gray-300'}`} />
        </div>
        <span className={`text-xs font-medium ${entranceState.color}`}>
          {entranceState.text}
        </span>
      </button>
    )
  }

  // Full view
  return (
    <button
      onClick={onClick}
      className="p-4 bg-white border border-gray-200 rounded-xl w-full text-left hover:border-gray-300 transition"
    >
      <div className="flex items-center gap-3">
        {/* Beacon icon with signal indicator */}
        <div className="relative">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          {/* Status dot */}
          <div className={`absolute bottom-0 right-0 w-4 h-4 ${getSignalColor()} rounded-full border-2 border-white`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">
            {myBeacon.friendly_name || `Beacon ${myBeacon.mac_address?.slice(-5)}`}
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span className={entranceState.color}>{entranceState.text}</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{formatLastSeen()}</span>
          </div>
          {myBeacon.last_room_id && (
            <p className="text-xs text-gray-500 mt-1">
              Last seen in: <span className="font-medium">{myBeacon.last_room_id}</span>
            </p>
          )}
        </div>

        {/* Chevron */}
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {/* Signal strength indicator */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-gray-500">Signal:</span>
        <div className="flex items-end gap-0.5 h-3">
          <div className={`w-1.5 h-1 rounded-sm ${signalStrength !== 'offline' ? getSignalColor() : 'bg-gray-300'}`} />
          <div className={`w-1.5 h-1.5 rounded-sm ${['strong', 'good', 'weak'].includes(signalStrength) ? getSignalColor() : 'bg-gray-300'}`} />
          <div className={`w-1.5 h-2 rounded-sm ${['strong', 'good'].includes(signalStrength) ? getSignalColor() : 'bg-gray-300'}`} />
          <div className={`w-1.5 h-3 rounded-sm ${signalStrength === 'strong' ? getSignalColor() : 'bg-gray-300'}`} />
        </div>
        <span className="text-xs text-gray-500 capitalize">{signalStrength}</span>
        {myBeacon.last_rssi && signalStrength !== 'offline' && (
          <span className="text-xs text-gray-400">({myBeacon.last_rssi} dBm)</span>
        )}
      </div>
    </button>
  )
}
