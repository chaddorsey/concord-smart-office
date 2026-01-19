import { useEffect, useRef, useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { BarcodeScanner, BarcodeFormat, type BarcodesScannedEvent } from '@capacitor-mlkit/barcode-scanning'
import { Html5Qrcode } from 'html5-qrcode'

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
  const [scannerReady, setScannerReady] = useState(false)
  const [isNative] = useState(() => Capacitor.isNativePlatform())
  const scanListenerRef = useRef<{ remove: () => Promise<void> } | null>(null)
  const hasScannedRef = useRef(false)
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)
  const scannerContainerId = 'qr-scanner-container'

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

  // Handle web QR scan success
  const handleWebScanSuccess = useCallback((decodedText: string) => {
    if (hasScannedRef.current) return
    hasScannedRef.current = true
    console.log('[QR] Web scanned:', decodedText)

    // Stop scanner
    if (html5QrCodeRef.current) {
      html5QrCodeRef.current.stop().catch(() => {})
      html5QrCodeRef.current = null
    }
    setScannerReady(false)

    onScan(decodedText)
    onStop?.()
  }, [onScan, onStop])

  useEffect(() => {
    if (!isActive) {
      // Stop scanner when not active
      hasScannedRef.current = false
      setScannerReady(false)
      if (isNative) {
        setScannerActive(false)
        BarcodeScanner.stopScan().catch(() => {})
        if (scanListenerRef.current) {
          scanListenerRef.current.remove().catch(() => {})
          scanListenerRef.current = null
        }
      } else {
        // Stop web scanner
        if (html5QrCodeRef.current) {
          html5QrCodeRef.current.stop().catch(() => {})
          html5QrCodeRef.current = null
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

    const startWebScanner = async () => {
      // Reset scan guard for new session
      hasScannedRef.current = false
      setIsStarting(true)
      setHasPermission(null)
      setScannerReady(false)

      try {
        // Clean up any existing scanner first
        if (html5QrCodeRef.current) {
          try {
            await html5QrCodeRef.current.stop()
          } catch {
            // Ignore stop errors
          }
          html5QrCodeRef.current = null
        }

        // Wait for the container to be in the DOM
        await new Promise(resolve => setTimeout(resolve, 100))

        const container = document.getElementById(scannerContainerId)
        if (!container) {
          throw new Error('Scanner container not found')
        }

        // Clear the container
        container.innerHTML = ''

        // Create scanner instance
        const html5QrCode = new Html5Qrcode(scannerContainerId, { verbose: false })
        html5QrCodeRef.current = html5QrCode

        // Use facingMode directly - simpler and works better on mobile Safari
        console.log('[QR] Starting html5QrCode.start()...')
        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 30,  // Higher FPS for faster detection
            qrbox: { width: 280, height: 280 },  // Larger scan area
            aspectRatio: 1,
            disableFlip: false,  // Allow mirrored QR codes
          },
          handleWebScanSuccess,
          () => {} // Ignore scan failures (no QR in frame)
        )
        console.log('[QR] html5QrCode.start() completed successfully')

        setHasPermission(true)
        setScannerReady(true)
        console.log('[QR] Scanner state: hasPermission=true, scannerReady=true')
      } catch (err) {
        console.error('[QR] Failed to start web scanner:', err)
        setHasPermission(false)
        setScannerReady(false)

        // Provide helpful error message
        const errorMessage = err instanceof Error ? err.message : 'Failed to start camera'
        if (errorMessage.includes('Permission') || errorMessage.includes('NotAllowed')) {
          onError?.('Camera permission denied. Please allow camera access in Safari settings.')
        } else if (errorMessage.includes('NotFound') || errorMessage.includes('No cameras') || errorMessage.includes('NotReadableError')) {
          onError?.('Could not access camera. Please check permissions.')
        } else {
          onError?.(errorMessage)
        }
      } finally {
        setIsStarting(false)
      }
    }

    if (isNative) {
      startNativeScanner()
    } else {
      startWebScanner()
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
      } else {
        if (html5QrCodeRef.current) {
          html5QrCodeRef.current.stop().catch(() => {})
          html5QrCodeRef.current = null
        }
      }
    }
  }, [isActive, isNative, onError, handleBarcodesScanned, handleWebScanSuccess])

  // Handle stop button
  const handleStop = () => {
    if (isNative) {
      setScannerActive(false)
      BarcodeScanner.stopScan().catch(() => {})
      if (scanListenerRef.current) {
        scanListenerRef.current.remove().catch(() => {})
        scanListenerRef.current = null
      }
    } else {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {})
        html5QrCodeRef.current = null
      }
      setScannerReady(false)
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

  // Web scanner - always render the container, show/hide based on state
  if (!isNative) {
    return (
      <div className="space-y-4">
        {/* Camera viewport */}
        <div className="relative bg-black rounded-xl overflow-hidden" style={{ minHeight: '280px', width: '100%' }}>
          {/* Loading overlay - shown FIRST to ensure visibility during camera init */}
          {isActive && isStarting && (
            <div
              className="absolute inset-0 bg-gray-900 rounded-xl flex items-center justify-center z-10"
              style={{ minHeight: '280px', minWidth: '100%' }}
            >
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-white">Starting camera...</p>
              </div>
            </div>
          )}

          {/* Scanner container - must stay in DOM and visible when active */}
          <div
            id={scannerContainerId}
            className={`bg-black rounded-xl overflow-hidden ${
              isActive ? '' : 'hidden'
            }`}
            style={{ minHeight: '280px', width: '100%', height: '280px' }}
          />

          {/* Scanning line animation - shown when scanner is ready */}
          {isActive && scannerReady && (
            <div className="absolute inset-x-0 top-0 h-full pointer-events-none z-10 overflow-hidden rounded-xl">
              <div
                className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-green-500 to-transparent shadow-lg animate-scan"
                style={{
                  boxShadow: '0 0 8px 2px rgba(34, 197, 94, 0.6)',
                  top: '0px'
                }}
              />
            </div>
          )}

          {/* Error overlay */}
          {isActive && !isStarting && hasPermission === false && (
            <div className="absolute inset-0 bg-gray-900 rounded-xl flex items-center justify-center z-10" style={{ minHeight: '280px' }}>
              <div className="text-center p-4">
                <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <p className="text-white font-medium">Camera access denied</p>
                <p className="text-gray-400 text-sm mt-2">Please allow camera access in Safari settings</p>
              </div>
            </div>
          )}

          {/* Placeholder when not active */}
          {!isActive && (
            <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300" style={{ minHeight: '280px' }}>
              <div className="text-center">
                <svg className="w-20 h-20 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <p className="text-gray-600 font-medium">Ready to scan QR code</p>
                <p className="text-gray-500 text-sm mt-1">Tap the button below to start camera</p>
              </div>
            </div>
          )}
        </div>

        {/* Cancel button - outside camera viewport */}
        {isActive && scannerReady && (
          <button
            onClick={handleStop}
            className="w-full py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition"
          >
            Cancel
          </button>
        )}
      </div>
    )
  }

  // Fallback (shouldn't reach here)
  return null
}
