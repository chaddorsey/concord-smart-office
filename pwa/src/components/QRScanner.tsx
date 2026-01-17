import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  onScan: (data: string) => void
  onError?: (error: string) => void
  isActive: boolean
}

export default function QRScanner({ onScan, onError, isActive }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isActive) {
      // Stop scanner when not active
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {
          // Ignore errors when stopping
        })
        scannerRef.current = null
      }
      return
    }

    // Start scanner
    const startScanner = async () => {
      if (!containerRef.current || scannerRef.current) return

      setIsStarting(true)

      try {
        const scanner = new Html5Qrcode('qr-reader')
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' }, // Use back camera
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            // Successfully scanned
            console.log('[QR] Scanned:', decodedText)
            onScan(decodedText)
          },
          () => {
            // Ignore scan errors (no QR found in frame)
            // These happen constantly while scanning
          }
        )

        setHasPermission(true)
      } catch (err) {
        console.error('[QR] Failed to start scanner:', err)
        setHasPermission(false)

        if (err instanceof Error) {
          if (err.message.includes('Permission')) {
            onError?.('Camera permission denied. Please allow camera access.')
          } else {
            onError?.(err.message)
          }
        } else {
          onError?.('Failed to start camera')
        }
      } finally {
        setIsStarting(false)
      }
    }

    startScanner()

    // Cleanup on unmount
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [isActive, onScan, onError])

  return (
    <div className="relative">
      <div
        id="qr-reader"
        ref={containerRef}
        className="w-full aspect-square bg-black rounded-xl overflow-hidden"
      />

      {isStarting && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-xl">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white">Starting camera...</p>
          </div>
        </div>
      )}

      {hasPermission === false && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-xl">
          <div className="text-center p-4">
            <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <p className="text-white font-medium">Camera access denied</p>
            <p className="text-gray-400 text-sm mt-2">Please enable camera permissions in your device settings</p>
          </div>
        </div>
      )}

      {/* Scanning overlay */}
      {isActive && hasPermission && !isStarting && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Corner brackets */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
          </div>

          {/* Scanning line animation */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 overflow-hidden">
            <div className="w-full h-1 bg-blue-500 opacity-75 animate-scan" />
          </div>
        </div>
      )}
    </div>
  )
}
