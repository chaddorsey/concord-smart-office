import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, usePresence } from '../stores'
import BottomNav from '../components/BottomNav'

type ScanMode = 'qr' | 'nfc' | 'manual'

export default function ScanIn() {
  const navigate = useNavigate()
  const { isAuthenticated, connectionStatus } = useAuth()
  const { staff, currentUserId, isCurrentUserPresent, scanIn, scanOut, setCurrentUser } = usePresence()

  const [scanMode, setScanMode] = useState<ScanMode>('manual')
  const [isScanning, setIsScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [selectedStaffId, setSelectedStaffId] = useState<string>(currentUserId || '')
  const [error, setError] = useState<string | null>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && connectionStatus !== 'connecting') {
      navigate('/login')
    }
  }, [isAuthenticated, connectionStatus, navigate])

  // Update selected staff when current user changes
  useEffect(() => {
    if (currentUserId && !selectedStaffId) {
      setSelectedStaffId(currentUserId)
    }
  }, [currentUserId, selectedStaffId])

  const handleScan = async () => {
    if (!selectedStaffId) {
      setError('Please select a staff member')
      return
    }

    setIsScanning(true)
    setScanStatus('idle')
    setError(null)

    try {
      // Set this as the current user
      setCurrentUser(selectedStaffId)

      // Determine if scanning in or out
      const staffMember = staff.find(s => s.id === selectedStaffId)
      const isPresent = staffMember?.isPresent ?? false

      if (isPresent) {
        await scanOut(selectedStaffId)
      } else {
        await scanIn(selectedStaffId)
      }

      setScanStatus('success')

      // Redirect to dashboard after successful scan
      setTimeout(() => {
        navigate('/dashboard')
      }, 1500)
    } catch (err) {
      console.error('Scan failed:', err)
      setScanStatus('error')
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setIsScanning(false)
    }
  }

  const handleStartQRScan = async () => {
    setIsScanning(true)
    setScanStatus('idle')
    setError(null)

    // TODO: Implement actual QR camera scanning
    // For now, simulate after a delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Simulated: QR code would contain staff ID
    if (selectedStaffId) {
      await handleScan()
    } else {
      setIsScanning(false)
      setError('No QR code detected')
    }
  }

  const handleStartNFCScan = async () => {
    setIsScanning(true)
    setScanStatus('idle')
    setError(null)

    // TODO: Implement actual NFC scanning using Web NFC API
    // For now, simulate after a delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    if (selectedStaffId) {
      await handleScan()
    } else {
      setIsScanning(false)
      setError('No NFC tag detected')
    }
  }

  const currentStaffMember = staff.find(s => s.id === selectedStaffId)
  const actionLabel = currentStaffMember?.isPresent ? 'Scan Out' : 'Scan In'

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
          <h1 className="text-xl font-bold">Scan In / Out</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto p-4 space-y-6">
        {/* Mode Toggle */}
        <div className="bg-white rounded-xl shadow-sm p-2 flex">
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
            onClick={() => setScanMode('nfc')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
              scanMode === 'nfc'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            NFC
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Scan Area */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {scanMode === 'manual' ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="staff-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Select Staff Member
                </label>
                <select
                  id="staff-select"
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                  disabled={isScanning}
                >
                  <option value="">Choose a person...</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} {person.isPresent ? '(In Office)' : '(Not In)'}
                    </option>
                  ))}
                </select>
              </div>

              {selectedStaffId && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium">
                      {currentStaffMember?.avatarInitials}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{currentStaffMember?.name}</p>
                      <p className={`text-sm ${currentStaffMember?.isPresent ? 'text-green-600' : 'text-gray-500'}`}>
                        {currentStaffMember?.isPresent ? 'Currently in office' : 'Not in office'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {scanStatus === 'success' ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-green-600 font-medium">
                    {isCurrentUserPresent ? 'Scanned In!' : 'Scanned Out!'}
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleScan}
                  disabled={isScanning || !selectedStaffId}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isScanning && (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {isScanning ? 'Processing...' : actionLabel}
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
                ) : scanStatus === 'success' ? (
                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-green-600 font-medium">Success!</p>
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
                disabled={isScanning || scanStatus === 'success'}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isScanning ? 'Scanning...' : 'Start Camera'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl flex items-center justify-center">
                {isScanning ? (
                  <div className="text-center">
                    <div className="w-24 h-24 border-4 border-blue-600 rounded-full animate-pulse mx-auto mb-4 flex items-center justify-center">
                      <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                      </svg>
                    </div>
                    <p className="text-blue-600 font-medium">Waiting for NFC tag...</p>
                  </div>
                ) : scanStatus === 'success' ? (
                  <div className="text-center">
                    <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-green-600 font-medium">Success!</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-24 h-24 border-4 border-dashed border-blue-300 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                      </svg>
                    </div>
                    <p className="text-gray-500">Tap your phone on the NFC tag</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleStartNFCScan}
                disabled={isScanning || scanStatus === 'success'}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isScanning ? 'Listening...' : 'Enable NFC'}
              </button>
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="text-center text-sm text-gray-500 space-y-1">
          <p>Having trouble scanning?</p>
          <p>Try manual mode or check camera/NFC permissions.</p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
