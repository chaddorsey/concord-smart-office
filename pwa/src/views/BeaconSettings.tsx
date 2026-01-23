/**
 * Beacon Settings View
 *
 * Allows users to:
 * - View their current beacon status
 * - Claim a new beacon via QR code scan
 * - Select from available unclaimed beacons
 * - Remove/unclaim their beacon
 * - Configure entrance detection profile
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBeacon } from '../stores/BeaconContext'
import BeaconStatus from '../components/BeaconStatus'
import QRScanner from '../components/QRScanner'

export default function BeaconSettings() {
  const navigate = useNavigate()
  const {
    myBeacon,
    availableBeacons,
    entranceProfiles,
    isLoading,
    error,
    fetchAvailableBeacons,
    claimBeacon,
    claimBeaconByMac,
    unclaimBeacon,
    setEntranceProfile
  } = useBeacon()

  const [showScanner, setShowScanner] = useState(false)
  const [showAvailable, setShowAvailable] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [confirmUnclaim, setConfirmUnclaim] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState(false)

  // Fetch available beacons when section is expanded
  useEffect(() => {
    if (showAvailable) {
      fetchAvailableBeacons()
    }
  }, [showAvailable, fetchAvailableBeacons])

  // Handle QR scan result
  const handleScan = useCallback(async (data: string) => {
    setShowScanner(false)
    setScanError(null)

    // Parse QR data - expected format: MAC address or "concord://beacon/{mac}"
    let macAddress = data

    // Handle URL format
    if (data.startsWith('concord://beacon/')) {
      macAddress = data.replace('concord://beacon/', '')
    }

    // Validate MAC address format (rough check)
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    if (!macRegex.test(macAddress)) {
      setScanError('Invalid QR code. Expected beacon MAC address.')
      return
    }

    try {
      await claimBeaconByMac(macAddress)
      setClaimSuccess(true)
      setTimeout(() => setClaimSuccess(false), 3000)
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to claim beacon')
    }
  }, [claimBeaconByMac])

  // Handle claim from list
  const handleClaimFromList = async (beaconId: number) => {
    setScanError(null)
    try {
      await claimBeacon(beaconId)
      setShowAvailable(false)
      setClaimSuccess(true)
      setTimeout(() => setClaimSuccess(false), 3000)
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to claim beacon')
    }
  }

  // Handle unclaim
  const handleUnclaim = async () => {
    try {
      await unclaimBeacon()
      setConfirmUnclaim(false)
    } catch {
      // Error is shown from context
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">BLE Beacon Settings</h1>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Success message */}
        {claimSuccess && (
          <div className="p-4 bg-green-100 text-green-800 rounded-xl flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">Beacon claimed successfully!</span>
          </div>
        )}

        {/* Error message */}
        {(error || scanError) && (
          <div className="p-4 bg-red-100 text-red-800 rounded-xl flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error || scanError}</span>
          </div>
        )}

        {/* Current beacon status */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Your Beacon
          </h2>
          <BeaconStatus />
        </section>

        {/* Claim beacon section */}
        {!myBeacon && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Claim a Beacon
            </h2>

            {/* QR Scanner */}
            {showScanner ? (
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Scan Beacon QR Code</h3>
                <QRScanner
                  isActive={showScanner}
                  onScan={handleScan}
                  onError={(err) => setScanError(err)}
                  onStop={() => setShowScanner(false)}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowScanner(true)}
                className="w-full p-4 bg-yellow-500 text-white rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-yellow-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Scan Beacon QR Code
              </button>
            )}

            {/* Available beacons list */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setShowAvailable(!showAvailable)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
              >
                <span className="font-medium text-gray-900">Select from available beacons</span>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${showAvailable ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAvailable && (
                <div className="border-t border-gray-100">
                  {isLoading ? (
                    <div className="p-4 text-center text-gray-500">Loading...</div>
                  ) : availableBeacons.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">No available beacons</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {availableBeacons.map(beacon => (
                        <button
                          key={beacon.id}
                          onClick={() => handleClaimFromList(beacon.id)}
                          disabled={isLoading}
                          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition disabled:opacity-50"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {beacon.friendly_name || `Beacon #${beacon.id}`}
                            </p>
                            <p className="text-sm text-gray-500">
                              {beacon.mac_address || 'No MAC address'}
                            </p>
                          </div>
                          <span className="text-sm text-yellow-600 font-medium">Claim</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Beacon settings (when claimed) */}
        {myBeacon && (
          <>
            {/* Entrance detection profile */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Entrance Detection
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-600 mb-3">
                  Choose how sensitive the entrance detection should be for your beacon.
                </p>
                <div className="space-y-2">
                  {entranceProfiles.map(profile => (
                    <label
                      key={profile.id}
                      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition ${
                        myBeacon.entrance_profile === profile.id
                          ? 'bg-yellow-50 border-2 border-yellow-300'
                          : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="entrance_profile"
                        value={profile.id}
                        checked={myBeacon.entrance_profile === profile.id}
                        onChange={() => setEntranceProfile(profile.id)}
                        className="mt-1 w-4 h-4 text-yellow-500 focus:ring-yellow-500"
                      />
                      <div>
                        <p className="font-medium text-gray-900">{profile.name}</p>
                        <p className="text-sm text-gray-500">{profile.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </section>

            {/* Remove beacon */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Danger Zone
              </h2>
              {confirmUnclaim ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-red-800 mb-4">
                    Are you sure you want to remove this beacon? You will no longer be tracked automatically.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleUnclaim}
                      disabled={isLoading}
                      className="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50"
                    >
                      Yes, Remove
                    </button>
                    <button
                      onClick={() => setConfirmUnclaim(false)}
                      className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmUnclaim(true)}
                  className="w-full p-4 bg-white border border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 transition"
                >
                  Remove Beacon
                </button>
              )}
            </section>
          </>
        )}

        {/* Help text */}
        <section className="text-center text-sm text-gray-500 py-4">
          <p>
            BLE beacons allow automatic check-in/out based on your location in the office.
          </p>
          <p className="mt-1">
            Scan the QR code on your beacon tag to link it to your account.
          </p>
        </section>
      </div>
    </div>
  )
}
