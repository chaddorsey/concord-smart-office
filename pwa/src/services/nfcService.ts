// Web NFC Service for staff check-in/check-out
// Note: Web NFC only works on Chrome Android 89+ with HTTPS

export interface NFCScanResult {
  staffId: string
  serialNumber: string
  rawData?: string
}

export type NFCStatus =
  | 'unavailable'      // Browser doesn't support Web NFC
  | 'requires-https'   // Need HTTPS (except localhost)
  | 'available'        // Ready to use
  | 'permission-denied'// User denied permission
  | 'scanning'         // Currently scanning
  | 'error'            // Other error

export interface NFCError {
  status: NFCStatus
  message: string
}

/**
 * Check if Web NFC is available in this browser
 */
export function isNFCSupported(): boolean {
  return 'NDEFReader' in window
}

/**
 * Check if we're in a secure context (HTTPS or localhost)
 */
export function isSecureContext(): boolean {
  return window.isSecureContext
}

/**
 * Get the current NFC availability status
 */
export function getNFCStatus(): NFCStatus {
  if (!isSecureContext()) {
    return 'requires-https'
  }
  if (!isNFCSupported()) {
    return 'unavailable'
  }
  return 'available'
}

/**
 * Parse staff ID from NFC tag data
 * Supports multiple formats:
 * - Plain text: "alice" or "staff:alice"
 * - URL: "https://office.example.com/scan?id=alice"
 * - JSON: {"staffId": "alice"}
 */
function parseStaffId(data: string): string | null {
  const trimmed = data.trim()

  // Try URL format
  try {
    const url = new URL(trimmed)
    const id = url.searchParams.get('id') || url.searchParams.get('staffId')
    if (id) return id

    // Check path for /scan/alice format
    const pathMatch = url.pathname.match(/\/scan\/([^/]+)/)
    if (pathMatch) return pathMatch[1]
  } catch {
    // Not a URL, continue
  }

  // Try JSON format
  try {
    const json = JSON.parse(trimmed)
    if (json.staffId) return json.staffId
    if (json.id) return json.id
  } catch {
    // Not JSON, continue
  }

  // Try "staff:alice" prefix format
  if (trimmed.startsWith('staff:')) {
    return trimmed.slice(6)
  }

  // Plain text - assume the whole thing is the staff ID
  // Only if it looks like an ID (alphanumeric, underscores, hyphens)
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed
  }

  return null
}

/**
 * Read text content from an NFC record
 */
function readRecordText(record: NDEFRecord): string | null {
  if (!record.data) return null

  const decoder = new TextDecoder(record.encoding || 'utf-8')
  return decoder.decode(record.data)
}

export class NFCService {
  private reader: NDEFReader | null = null
  private abortController: AbortController | null = null
  private isScanning = false

  /**
   * Start scanning for NFC tags
   * Returns a promise that resolves with the scan result or rejects with an error
   */
  async startScan(
    onTagRead: (result: NFCScanResult) => void,
    onError?: (error: NFCError) => void
  ): Promise<() => void> {
    const status = getNFCStatus()

    if (status === 'requires-https') {
      const error: NFCError = {
        status: 'requires-https',
        message: 'NFC requires HTTPS. Please access this app via HTTPS.'
      }
      onError?.(error)
      throw error
    }

    if (status === 'unavailable') {
      const error: NFCError = {
        status: 'unavailable',
        message: 'Web NFC is not supported in this browser. Try Chrome on Android.'
      }
      onError?.(error)
      throw error
    }

    if (this.isScanning) {
      this.stopScan()
    }

    try {
      this.reader = new NDEFReader()
      this.abortController = new AbortController()
      this.isScanning = true

      // Set up reading handler
      this.reader.onreading = (event: NDEFReadingEvent) => {
        const { serialNumber, message } = event
        let staffId: string | null = null
        let rawData: string | undefined

        // Try to find staff ID in the message records
        for (const record of message.records) {
          if (record.recordType === 'text' || record.recordType === 'url') {
            const text = readRecordText(record)
            if (text) {
              rawData = text
              staffId = parseStaffId(text)
              if (staffId) break
            }
          }
        }

        // If no staff ID found in records, try using serial number as fallback
        // (This would require a mapping table in a real implementation)
        if (!staffId && serialNumber) {
          console.log('[NFC] No staff ID in tag data, serial:', serialNumber)
        }

        if (staffId) {
          onTagRead({
            staffId,
            serialNumber,
            rawData
          })
        } else {
          onError?.({
            status: 'error',
            message: 'Could not read staff ID from NFC tag. Tag data: ' + (rawData || 'empty')
          })
        }
      }

      this.reader.onreadingerror = (event: NDEFErrorEvent) => {
        console.error('[NFC] Reading error:', event.error)
        onError?.({
          status: 'error',
          message: 'Error reading NFC tag: ' + event.error.message
        })
      }

      // Start scanning
      await this.reader.scan({ signal: this.abortController.signal })
      console.log('[NFC] Scanning started')

      // Return stop function
      return () => this.stopScan()

    } catch (err) {
      this.isScanning = false

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          const error: NFCError = {
            status: 'permission-denied',
            message: 'NFC permission denied. Please allow NFC access and try again.'
          }
          onError?.(error)
          throw error
        }
        if (err.name === 'AbortError') {
          // Scan was intentionally stopped
          return () => {}
        }
      }

      const error: NFCError = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to start NFC scan'
      }
      onError?.(error)
      throw error
    }
  }

  /**
   * Stop scanning for NFC tags
   */
  stopScan(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.reader = null
    this.isScanning = false
    console.log('[NFC] Scanning stopped')
  }

  /**
   * Write data to an NFC tag (for provisioning tags)
   */
  async writeTag(staffId: string): Promise<void> {
    const status = getNFCStatus()

    if (status !== 'available') {
      throw new Error('NFC not available')
    }

    const writer = new NDEFReader()

    try {
      // Write staff ID as a text record
      await writer.write({
        records: [
          {
            recordType: 'text',
            data: `staff:${staffId}`
          }
        ]
      })
      console.log('[NFC] Tag written successfully')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        throw new Error('NFC permission denied')
      }
      throw err
    }
  }
}

// Singleton instance
export const nfcService = new NFCService()
