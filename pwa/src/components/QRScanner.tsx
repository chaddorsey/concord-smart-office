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
      onScan(barcode.rawValue)
    }
  }, [onScan])

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

        // Make WebView transparent so camera shows through
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

  // Native scanner - camera renders fullscreen behind webview
  // We show a transparent viewport with targeting overlay
  if (isNative && isActive && hasPermission) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col">
        {/* Transparent camera viewport */}
        <div className="flex-1 relative" style={{ background: 'transparent' }}>
          {/* Scanning frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-72 relative">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-lg" />
              {/* Scanning line */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="w-full h-1 bg-white opacity-75 animate-scan" />
              </div>
            </div>
          </div>
          {/* Instructions */}
          <div className="absolute bottom-8 left-0 right-0 text-center">
            <p className="text-white text-lg font-medium drop-shadow-lg">Point camera at QR code</p>
          </div>
        </div>
        {/* Stop button */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-8">
          <button
            onClick={onStop}
            className="w-full py-4 bg-white/90 text-gray-700 rounded-xl font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="w-full aspect-square bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center">
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
            <p className="text-gray-400">Camera preview</p>
          </div>
        )}
      </div>
    </div>
  )
}
