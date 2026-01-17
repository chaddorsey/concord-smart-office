import { useEffect, useRef, useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner, BarcodeFormat, type BarcodesScannedEvent } from '@capacitor-mlkit/barcode-scanning'

interface QRScannerProps {
  onScan: (data: string) => void
  onError?: (error: string) => void
  isActive: boolean
}

export default function QRScanner({ onScan, onError, isActive }: QRScannerProps) {
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
        BarcodeScanner.stopScan().catch(() => {})
        if (scanListenerRef.current) {
          scanListenerRef.current.remove().catch(() => {})
          scanListenerRef.current = null
        }
      }
    }
  }, [isActive, isNative, onError, handleBarcodesScanned])

  // Native scanner uses fullscreen camera view, so we show minimal UI
  if (isNative && isActive && hasPermission) {
    return (
      <div className="relative aspect-square bg-black rounded-xl overflow-hidden">
        {/* The native camera view is rendered behind the webview */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white">
            <p className="text-lg font-medium">Point camera at QR code</p>
            <p className="text-sm text-gray-300 mt-2">Scanning...</p>
          </div>
        </div>

        {/* Scanning overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 overflow-hidden">
            <div className="w-full h-1 bg-blue-500 opacity-75 animate-scan" />
          </div>
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
