import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuth, usePresence } from '../stores'
import { presenceService } from '../services/presenceService'
import type { CheckInResult } from '../services/types'
import BottomNav from '../components/BottomNav'
import QRScanner from '../components/QRScanner'

type ScanMode = 'qr' | 'nfc' | 'manual'

// Parse location from QR code data
function parseQRLocation(data: string): { locationId: string; locationName?: string } | null {
  const trimmed = data.trim()

  // Try URL format: https://example.com/checkin?loc=lobby
  try {
    const url = new URL(trimmed)
    const loc = url.searchParams.get('loc') || url.searchParams.get('location') || url.searchParams.get('id')
    if (loc) return { locationId: loc }

    // Path format: /checkin/lobby
    const pathMatch = url.pathname.match(/\/checkin\/([^/]+)/)
    if (pathMatch) return { locationId: pathMatch[1] }
  } catch {
    // Not a URL
  }

  // Try JSON format: {"locationId": "lobby"}
  try {
    const json = JSON.parse(trimmed)
    if (json.locationId || json.location || json.loc) {
      return {
        locationId: json.locationId || json.location || json.loc,
        locationName: json.name || json.locationName
      }
    }
  } catch {
    // Not JSON
  }

  // Try prefix format: checkin:lobby
  if (trimmed.startsWith('checkin:')) {
    return { locationId: trimmed.slice(8) }
  }
  if (trimmed.startsWith('location:')) {
    return { locationId: trimmed.slice(9) }
  }

  // Plain text - assume it's the location ID if alphanumeric
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { locationId: trimmed }
  }

  return null
}

export default function ScanIn() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus, isMockMode, connectMock } = useAuth()
  const { currentUserId, isCurrentUserPresent, staff, togglePresence } = usePresence()

  // Default to QR mode since NFC requires paid developer account
  const [scanMode, setScanMode] = useState<ScanMode>('qr')
  const [isScanning, setIsScanning] = useState(false)
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualLocationId, setManualLocationId] = useState<string>('')

  // Get current user info
  const currentUser = staff.find(s => s.id === currentUserId)

  // Auto-enable demo mode on native, or redirect to login
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      if (Capacitor.isNativePlatform()) {
        // Auto-enable demo mode on native app for easier testing
        connectMock()
      } else {
        navigate('/login')
      }
    }
  }, [isAuthenticated, connectionStatus, navigate, connectMock])

  // Handle check-in after scanning a location
  const handleCheckIn = useCallback(async (locationId: string, locationName?: string) => {
    if (!currentUserId) {
      setError('You must be logged in to check in')
      return
    }

    setIsScanning(false) // Stop scanning
    setError(null)
    setCheckInResult(null)

    try {
      let result: CheckInResult

      if (isMockMode) {
        // In mock mode, simulate the check-in
        result = {
          success: true,
          userId: currentUserId,
          locationId,
          locationName: locationName || locationId,
          action: isCurrentUserPresent ? 'check-out' : 'check-in',
          timestamp: new Date().toISOString()
        }
        // Actually toggle the presence state
        await togglePresence(currentUserId)
        // Simulate delay for UX
        await new Promise(resolve => setTimeout(resolve, 300))
      } else {
        // Real check-in via Home Assistant
        result = await presenceService.smartCheckIn(
          currentUserId,
          locationId,
          isCurrentUserPresent
        )
      }

      setCheckInResult(result)

      // Redirect to dashboard after successful check-in
      if (result.success && !result.error) {
        setTimeout(() => {
          navigate('/dashboard')
        }, 2000)
      }
    } catch (err) {
      console.error('Check-in failed:', err)
      setError(err instanceof Error ? err.message : 'Check-in failed')
    }
  }, [currentUserId, isCurrentUserPresent, isMockMode, navigate, togglePresence])

  // Handle QR code scan
  const handleQRScan = useCallback((data: string) => {
    const location = parseQRLocation(data)
    if (location) {
      handleCheckIn(location.locationId, location.locationName)
    } else {
      setError(`Invalid QR code: ${data}`)
    }
  }, [handleCheckIn])

  const handleManualCheckIn = () => {
    if (manualLocationId) {
      handleCheckIn(manualLocationId)
    }
  }

  const actionLabel = isCurrentUserPresent ? 'Check Out' : 'Check In'
  const successMessage = checkInResult?.action === 'check-out'
    ? `Checked out from ${checkInResult.locationName}!`
    : `Checked in at ${checkInResult?.locationName}!`

  return (
    <div className={`min-h-screen pb-20 scan-page ${isScanning ? '' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className="scan-header bg-blue-600 text-white px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/dashboard" className="p-2 -ml-2 hover:bg-blue-500 rounded-lg transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">{actionLabel}</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto p-4 space-y-6">
        {/* Current User Card - hide during scanning */}
        {currentUser && !isScanning && (
          <div className="scan-controls bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium text-lg">
                {currentUser.avatarInitials}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{currentUser.name}</p>
                <p className={`text-sm ${currentUser.isPresent ? 'text-green-600' : 'text-gray-500'}`}>
                  {currentUser.isPresent ? 'Currently in office' : 'Not in office'}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                currentUser.isPresent
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {currentUser.isPresent ? 'In' : 'Out'}
              </div>
            </div>
          </div>
        )}

        {/* Mode Toggle - hide during scanning */}
        {!isScanning && (
        <div className="scan-controls bg-white rounded-xl shadow-sm p-2 flex">
          <button
            onClick={() => { setScanMode('qr'); setIsScanning(false); setError(null); setCheckInResult(null); }}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
              scanMode === 'qr'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            QR Code
          </button>
          <button
            onClick={() => { setScanMode('nfc'); setIsScanning(false); setError(null); setCheckInResult(null); }}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
              scanMode === 'nfc'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            NFC
          </button>
          <button
            onClick={() => { setScanMode('manual'); setIsScanning(false); setError(null); setCheckInResult(null); }}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
              scanMode === 'manual'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Manual
          </button>
        </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Already Checked In Warning */}
        {checkInResult?.error === 'Already checked in' && (
          <div className="bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm">
            You're already checked in! Scan an exit tag to check out.
          </div>
        )}

        {/* Scan Area */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {scanMode === 'qr' ? (
            <div className="space-y-4">
              {checkInResult?.success && !checkInResult.error ? (
                <div className="aspect-square bg-green-50 rounded-xl flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-green-600 font-medium text-lg">{successMessage}</p>
                    <p className="text-gray-500 text-sm mt-2">Redirecting to dashboard...</p>
                  </div>
                </div>
              ) : (
                <>
                  {isScanning ? (
                    <QRScanner
                      isActive={isScanning}
                      onScan={handleQRScan}
                      onError={(err) => setError(err)}
                      onStop={() => setIsScanning(false)}
                    />
                  ) : (
                    <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                      <div className="text-center">
                        <svg className="w-20 h-20 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        <p className="text-gray-600 font-medium">Ready to scan QR code</p>
                        <p className="text-gray-500 text-sm mt-1">Tap below to start camera</p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setIsScanning(!isScanning)}
                    className={`w-full py-4 rounded-xl font-medium transition ${
                      isScanning
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isScanning ? 'Stop Camera' : `Start ${actionLabel}`}
                  </button>
                </>
              )}
            </div>
          ) : scanMode === 'nfc' ? (
            <div className="space-y-4">
              {/* NFC Notice for iOS */}
              <div className="bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm">
                <p className="font-medium">NFC requires paid Apple Developer account</p>
                <p className="mt-1">Use QR code mode instead for testing.</p>
              </div>

              <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 border-4 border-dashed border-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                  </div>
                  <p className="text-gray-500 font-medium">NFC unavailable</p>
                  <p className="text-gray-400 text-sm mt-1">Switch to QR code mode</p>
                </div>
              </div>

              <button
                disabled
                className="w-full bg-gray-300 text-gray-500 py-4 rounded-xl font-medium cursor-not-allowed"
              >
                NFC Not Available
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Select a check-in location to manually {actionLabel.toLowerCase()}:
              </p>

              <div>
                <label htmlFor="location-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Location
                </label>
                <select
                  id="location-select"
                  value={manualLocationId}
                  onChange={(e) => setManualLocationId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                  disabled={!!checkInResult?.success}
                >
                  <option value="">Choose a location...</option>
                  <option value="office">Office</option>
                </select>
              </div>

              {checkInResult?.success && !checkInResult.error ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-green-600 font-medium">{successMessage}</p>
                </div>
              ) : (
                <button
                  onClick={handleManualCheckIn}
                  disabled={!manualLocationId}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLabel}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="text-center text-sm text-gray-500 space-y-1">
          <p>Scan a check-in QR code at the office entrance</p>
          <p className="text-xs">or use manual mode to select a location</p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
