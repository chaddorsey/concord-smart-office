import { useEffect, useRef, useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner, BarcodeFormat, type BarcodesScannedEvent } from '@capacitor-mlkit/barcode-scanning'

interface QRScannerProps {
  onScan: (data: string) => void
  onError?: (error: string) => void
  onStop?: () => void
  isActive: boolean
}

// Toggle scanner mode class on body for CSS targeting
function setScannerActive(active: boolean) {
  if (active) {
    document.body.classList.add('scanner-active')
  } else {
    document.body.classList.remove('scanner-active')
  }
}

export default function QRScanner({ onScan, onError, onStop, isActive }: QRScannerProps) {
  const [isStarting, setIsStarting] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [isNative] = useState(() => Capacitor.isNativePlatform())
  const scanListenerRef = useRef<{ remove: () => Promise<void> } | null>(null)
  const hasScannedRef = useRef(false)

  // Handle barcode scanned event for native
  const handleBarcodesScanned = useCallback((event: BarcodesScannedEvent) => {
    if (hasScannedRef.current) return // Prevent multiple scans

    const barcode = event.barcodes[0]
    if (barcode?.rawValue) {
      hasScannedRef.current = true
      console.log('[QR] Native scanned:', barcode.rawValue)

      // Stop scanning first, then notify
      setScannerActive(false)
      BarcodeScanner.stopScan().catch(() => {})
      if (scanListenerRef.current) {
        scanListenerRef.current.remove().catch(() => {})
        scanListenerRef.current = null
      }

      // Notify parent
      onScan(barcode.rawValue)
      onStop?.()
    }
  }, [onScan, onStop])

  useEffect(() => {
    if (!isActive) {
      // Stop scanner when not active
      hasScannedRef.current = false
      if (isNative) {
        setScannerActive(false)
        BarcodeScanner.stopScan().catch(() => {})
        if (scanListenerRef.current) {
          scanListenerRef.current.remove().catch(() => {})
          scanListenerRef.current = null
        }
      }
      return
    }

    const startNativeScanner = async () => {
      setIsStarting(true)
      hasScannedRef.current = false

      try {
        // Check/request permission
        const { camera } = await BarcodeScanner.checkPermissions()

        if (camera !== 'granted') {
          const result = await BarcodeScanner.requestPermissions()
          if (result.camera !== 'granted') {
            setHasPermission(false)
            onError?.('Camera permission denied')
            setIsStarting(false)
            return
          }
        }

        setHasPermission(true)

        // Make page transparent so camera shows through
        setScannerActive(true)

        // Add listener for barcodes
        const listener = await BarcodeScanner.addListener('barcodesScanned', handleBarcodesScanned)
        scanListenerRef.current = listener

        // Start scanning
        await BarcodeScanner.startScan({
          formats: [BarcodeFormat.QrCode],
        })

        setIsStarting(false)
      } catch (err) {
        console.error('[QR] Failed to start native scanner:', err)
        setHasPermission(false)
        setScannerActive(false)
        onError?.(err instanceof Error ? err.message : 'Failed to start camera')
        setIsStarting(false)
      }
    }

    if (isNative) {
      startNativeScanner()
    } else {
      // Web fallback - show message to use native app
      setHasPermission(false)
      onError?.('QR scanning requires the native app on iOS')
    }

    // Cleanup
    return () => {
      if (isNative) {
        setScannerActive(false)
        BarcodeScanner.stopScan().catch(() => {})
        if (scanListenerRef.current) {
          scanListenerRef.current.remove().catch(() => {})
          scanListenerRef.current = null
        }
      }
    }
  }, [isActive, isNative, onError, handleBarcodesScanned])

  // Handle stop button
  const handleStop = () => {
    setScannerActive(false)
    BarcodeScanner.stopScan().catch(() => {})
    if (scanListenerRef.current) {
      scanListenerRef.current.remove().catch(() => {})
      scanListenerRef.current = null
    }
    onStop?.()
  }

  // Native scanner - fullscreen modal with camera showing through center
  if (isNative && isActive && hasPermission) {
    return (
      <div className="fixed inset-0 z-50">
        {/* Dark overlay with transparent center cutout */}
        <div className="absolute inset-0">
          {/* Top dark area */}
          <div className="absolute top-0 left-0 right-0 h-[calc(50%-140px)] bg-black/70" />
          {/* Bottom dark area */}
          <div className="absolute bottom-0 left-0 right-0 h-[calc(50%-140px)] bg-black/70" />
          {/* Left dark area (middle row) */}
          <div className="absolute top-[calc(50%-140px)] left-0 w-[calc(50%-140px)] h-[280px] bg-black/70" />
          {/* Right dark area (middle row) */}
          <div className="absolute top-[calc(50%-140px)] right-0 w-[calc(50%-140px)] h-[280px] bg-black/70" />
        </div>

        {/* Scanning frame */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px]">
          {/* Corner brackets */}
          <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white rounded-br-lg" />
          {/* Scanning line */}
          <div className="absolute inset-4 overflow-hidden">
            <div className="w-full h-0.5 bg-green-400 animate-scan" />
          </div>
        </div>

        {/* Instructions at top */}
        <div className="absolute top-16 left-0 right-0 text-center">
          <p className="text-white text-xl font-semibold">Scan QR Code</p>
          <p className="text-white/70 text-sm mt-1">Position the code within the frame</p>
        </div>

        {/* Cancel button at bottom */}
        <div className="absolute bottom-12 left-4 right-4">
          <button
            onClick={handleStop}
            className="w-full py-4 bg-white text-gray-900 rounded-xl font-semibold text-lg shadow-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Loading or error state
  return (
    <div className="aspect-square bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center">
      {isStarting ? (
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">Starting camera...</p>
        </div>
      ) : hasPermission === false ? (
        <div className="text-center p-4">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <p className="text-white font-medium">Camera access denied</p>
          <p className="text-gray-400 text-sm mt-2">Please enable camera permissions in your device settings</p>
        </div>
      ) : (
        <div className="text-center p-4">
          <p className="text-gray-400">Initializing...</p>
        </div>
      )}
    </div>
  )
}
