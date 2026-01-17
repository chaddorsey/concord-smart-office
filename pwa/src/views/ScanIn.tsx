import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, usePresence } from '../stores'
import { nfcService, getNFCStatus, type NFCStatus, type NFCScanResult } from '../services/nfcService'
import { presenceService } from '../services/presenceService'
import type { CheckInResult } from '../services/types'
import BottomNav from '../components/BottomNav'

type ScanMode = 'nfc' | 'qr' | 'manual'

export default function ScanIn() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus, isMockMode } = useAuth()
  const { currentUserId, isCurrentUserPresent, staff } = usePresence()

  const [scanMode, setScanMode] = useState<ScanMode>('nfc')
  const [isScanning, setIsScanning] = useState(false)
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nfcStatus, setNfcStatus] = useState<NFCStatus>(() => getNFCStatus())
  const [manualLocationId, setManualLocationId] = useState<string>('')
  const stopNfcScanRef = useRef<(() => void) | null>(null)

  // Get current user info
  const currentUser = staff.find(s => s.id === currentUserId)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  // Cleanup NFC scanning on unmount or mode change
  useEffect(() => {
    return () => {
      if (stopNfcScanRef.current) {
        stopNfcScanRef.current()
        stopNfcScanRef.current = null
      }
    }
  }, [])

  // Stop NFC scan when switching away from NFC mode
  useEffect(() => {
    if (scanMode !== 'nfc' && stopNfcScanRef.current) {
      stopNfcScanRef.current()
      stopNfcScanRef.current = null
      setIsScanning(false)
    }
  }, [scanMode])

  // Handle check-in after scanning a location
  const handleCheckIn = useCallback(async (locationId: string, locationName?: string) => {
    if (!currentUserId) {
      setError('You must be logged in to check in')
      return
    }

    setIsScanning(true)
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
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 500))
      } else {
        // Real check-in via Home Assistant
        result = await presenceService.smartCheckIn(
          currentUserId,
          locationId,
          isCurrentUserPresent
        )
      }

      setCheckInResult(result)

      // Stop NFC scanning after successful scan
      if (stopNfcScanRef.current) {
        stopNfcScanRef.current()
        stopNfcScanRef.current = null
      }

      // Redirect to dashboard after successful check-in
      if (result.success && !result.error) {
        setTimeout(() => {
          navigate('/dashboard')
        }, 2000)
      }
    } catch (err) {
      console.error('Check-in failed:', err)
      setError(err instanceof Error ? err.message : 'Check-in failed')
    } finally {
      setIsScanning(false)
    }
  }, [currentUserId, isCurrentUserPresent, isMockMode, navigate])

  const handleStartQRScan = async () => {
    setIsScanning(true)
    setError(null)
    setCheckInResult(null)

    // TODO: Implement actual QR camera scanning
    // For now, simulate after a delay with a test location
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Simulated: QR code would contain location ID
    await handleCheckIn('lobby', 'Lobby')
  }

  const handleStartNFCScan = async () => {
    // Check NFC availability first
    const status = getNFCStatus()
    setNfcStatus(status)

    if (status === 'unavailable') {
      setError('NFC is not supported on this device. Try QR code or manual mode.')
      return
    }

    if (status === 'requires-https') {
      setError('NFC requires HTTPS. Please access this app via a secure connection.')
      return
    }

    setIsScanning(true)
    setError(null)
    setCheckInResult(null)

    try {
      const stopScan = await nfcService.startScan(
        // On successful tag read
        (result: NFCScanResult) => {
          console.log('[NFC] Location tag read:', result)
          handleCheckIn(result.locationId, result.locationName)
        },
        // On error
        (nfcError) => {
          console.error('[NFC] Error:', nfcError)
          setError(nfcError.message)
          setNfcStatus(nfcError.status)
          if (nfcError.status !== 'error') {
            // For permission denied or other fatal errors, stop scanning
            setIsScanning(false)
          }
        }
      )

      // Store stop function for cleanup
      stopNfcScanRef.current = stopScan

    } catch (err) {
      setIsScanning(false)
      if (err && typeof err === 'object' && 'message' in err) {
        setError((err as { message: string }).message)
      } else {
        setError('Failed to start NFC scan')
      }
    }
  }

  const handleStopNFCScan = () => {
    if (stopNfcScanRef.current) {
      stopNfcScanRef.current()
      stopNfcScanRef.current = null
    }
    setIsScanning(false)
  }

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
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-4 shadow-lg">
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
        {/* Current User Card */}
        {currentUser && (
          <div className="bg-white rounded-xl shadow-sm p-4">
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

        {/* Mode Toggle */}
        <div className="bg-white rounded-xl shadow-sm p-2 flex">
          <button
            onClick={() => setScanMode('nfc')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
              scanMode === 'nfc'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            NFC
          </button>
          <button
            onClick={() => setScanMode('qr')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
              scanMode === 'qr'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            QR Code
          </button>
          <button
            onClick={() => setScanMode('manual')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
              scanMode === 'manual'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Manual
          </button>
        </div>

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
          {scanMode === 'nfc' ? (
            <div className="space-y-4">
              {/* NFC Availability Warning */}
              {nfcStatus === 'unavailable' && (
                <div className="bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm">
                  <p className="font-medium">NFC not available</p>
                  <p className="mt-1">Try QR code or manual mode instead.</p>
                </div>
              )}

              {nfcStatus === 'requires-https' && (
                <div className="bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm">
                  <p className="font-medium">HTTPS Required</p>
                  <p className="mt-1">NFC requires a secure connection.</p>
                </div>
              )}

              <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl flex items-center justify-center">
                {isScanning ? (
                  <div className="text-center">
                    <div className="w-24 h-24 border-4 border-blue-600 rounded-full animate-pulse mx-auto mb-4 flex items-center justify-center">
                      <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                      </svg>
                    </div>
                    <p className="text-blue-600 font-medium">Ready to scan...</p>
                    <p className="text-blue-500 text-sm mt-1">Hold your phone near the check-in tag</p>
                  </div>
                ) : checkInResult?.success && !checkInResult.error ? (
                  <div className="text-center">
                    <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-green-600 font-medium">{successMessage}</p>
                    <p className="text-gray-500 text-sm mt-1">Redirecting to dashboard...</p>
                  </div>
                ) : nfcStatus === 'permission-denied' ? (
                  <div className="text-center">
                    <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </div>
                    <p className="text-red-600 font-medium">Permission Denied</p>
                    <p className="text-gray-500 text-sm mt-1">Allow NFC access and try again</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-24 h-24 border-4 border-dashed border-blue-300 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                      </svg>
                    </div>
                    <p className="text-gray-600 font-medium">Ready to {actionLabel.toLowerCase()}</p>
                    <p className="text-gray-500 text-sm mt-1">Tap the button to start scanning</p>
                  </div>
                )}
              </div>

              {isScanning ? (
                <button
                  onClick={handleStopNFCScan}
                  className="w-full bg-gray-200 text-gray-700 py-4 rounded-xl font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={handleStartNFCScan}
                  disabled={checkInResult?.success || nfcStatus === 'unavailable' || nfcStatus === 'requires-https'}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {nfcStatus === 'permission-denied' ? 'Try Again' : `Start ${actionLabel}`}
                </button>
              )}
            </div>
          ) : scanMode === 'qr' ? (
            <div className="space-y-4">
              <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                {isScanning ? (
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Scanning...</p>
                  </div>
                ) : checkInResult?.success && !checkInResult.error ? (
                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-green-600 font-medium">{successMessage}</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <svg className="w-20 h-20 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <p className="text-gray-500">Position QR code in frame</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleStartQRScan}
                disabled={isScanning || checkInResult?.success}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isScanning ? 'Scanning...' : 'Start Camera'}
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
                  disabled={isScanning}
                >
                  <option value="">Choose a location...</option>
                  <option value="main-entrance">Main Entrance</option>
                  <option value="lobby">Lobby</option>
                  <option value="back-door">Back Door</option>
                  <option value="front-exit">Front Exit</option>
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
                  disabled={isScanning || !manualLocationId}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isScanning && (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {isScanning ? 'Processing...' : actionLabel}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="text-center text-sm text-gray-500 space-y-1">
          <p>Tap your phone on an office check-in tag</p>
          <p className="text-xs">or use QR/manual mode if NFC isn't working</p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
