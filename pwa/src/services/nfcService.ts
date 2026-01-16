// NFC Service for staff check-in/check-out
// Supports:
// - Web NFC (Chrome Android 89+ with HTTPS)
// - Capacitor NFC plugin (iOS/Android native apps)

import { Capacitor } from '@capacitor/core'
import type { CapacitorNfcPlugin, NfcTag } from '@capgo/capacitor-nfc'

// Dynamic import for Capacitor NFC plugin (only loaded when needed)
let capacitorNfcInstance: CapacitorNfcPlugin | null = null

export interface NFCScanResult {
  staffId: string
  serialNumber: string
  rawData?: string
}

export type NFCStatus =
  | 'unavailable'      // NFC not supported
  | 'requires-https'   // Need HTTPS (except localhost) - Web NFC only
  | 'available'        // Ready to use
  | 'permission-denied'// User denied permission
  | 'scanning'         // Currently scanning
  | 'error'            // Other error

export interface NFCError {
  status: NFCStatus
  message: string
}

/**
 * Check if running in Capacitor native context
 */
export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Check if Web NFC is available in this browser
 */
export function isWebNFCSupported(): boolean {
  return 'NDEFReader' in window
}

/**
 * Legacy alias for isWebNFCSupported
 */
export function isNFCSupported(): boolean {
  return isCapacitorNative() || isWebNFCSupported()
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
  // In Capacitor native context, NFC is available via plugin
  if (isCapacitorNative()) {
    return 'available'
  }

  // Web NFC requires HTTPS
  if (!isSecureContext()) {
    return 'requires-https'
  }
  if (!isWebNFCSupported()) {
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
  private capacitorListenerHandle: (() => Promise<void>) | null = null

  /**
   * Initialize Capacitor NFC plugin if running natively
   */
  private async initCapacitorNfc(): Promise<CapacitorNfcPlugin | null> {
    if (!isCapacitorNative()) {
      return null
    }

    if (!capacitorNfcInstance) {
      try {
        const module = await import('@capgo/capacitor-nfc')
        capacitorNfcInstance = module.CapacitorNfc
      } catch (err) {
        console.error('[NFC] Failed to load Capacitor NFC plugin:', err)
        return null
      }
    }

    return capacitorNfcInstance
  }

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
        message: 'NFC is not supported on this device.'
      }
      onError?.(error)
      throw error
    }

    if (this.isScanning) {
      this.stopScan()
    }

    // Use Capacitor NFC if available
    if (isCapacitorNative()) {
      return this.startCapacitorScan(onTagRead, onError)
    }

    // Fall back to Web NFC
    return this.startWebNFCScan(onTagRead, onError)
  }

  /**
   * Parse NDEF payload from Capacitor NFC tag
   */
  private parseCapacitorNfcTag(tag: NfcTag): { staffId: string | null; serialNumber: string; rawData?: string } {
    let staffId: string | null = null
    let rawData: string | undefined
    const serialNumber = tag.id ? tag.id.map(b => b.toString(16).padStart(2, '0')).join(':') : ''

    // Parse NDEF message if available
    if (tag.ndefMessage && tag.ndefMessage.length > 0) {
      for (const record of tag.ndefMessage) {
        if (record.payload && record.payload.length > 0) {
          // Decode payload - typically UTF-8 text with language code prefix
          try {
            // For text records, first byte is language code length
            // Skip the language code prefix for text records (TNF 1, type 'T')
            let payloadBytes = record.payload
            if (record.tnf === 1 && record.type.length === 1 && record.type[0] === 0x54) {
              // Text record - skip language code
              const langLength = payloadBytes[0] & 0x3F
              payloadBytes = payloadBytes.slice(1 + langLength)
            }
            const text = new TextDecoder().decode(new Uint8Array(payloadBytes))
            rawData = text
            staffId = parseStaffId(text)
            if (staffId) break
          } catch (e) {
            console.warn('[NFC] Failed to decode payload:', e)
          }
        }
      }
    }

    return { staffId, serialNumber, rawData }
  }

  /**
   * Start scanning using Capacitor NFC plugin (iOS/Android native)
   */
  private async startCapacitorScan(
    onTagRead: (result: NFCScanResult) => void,
    onError?: (error: NFCError) => void
  ): Promise<() => void> {
    const nfc = await this.initCapacitorNfc()

    if (!nfc) {
      const error: NFCError = {
        status: 'unavailable',
        message: 'NFC plugin not available'
      }
      onError?.(error)
      throw error
    }

    try {
      this.isScanning = true

      // Add listener for NDEF tag discoveries
      const listenerResult = await nfc.addListener('ndefDiscovered', (event) => {
        console.log('[NFC] Capacitor tag read:', event)

        const { staffId, serialNumber, rawData } = this.parseCapacitorNfcTag(event.tag)

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
      })

      this.capacitorListenerHandle = listenerResult.remove

      // Start the NFC scanning session
      await nfc.startScanning({
        alertMessage: 'Hold your badge near the phone to scan in'
      })

      console.log('[NFC] Capacitor scanning started')
      return () => this.stopScan()

    } catch (err) {
      this.isScanning = false

      const error: NFCError = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to start NFC scan'
      }
      onError?.(error)
      throw error
    }
  }

  /**
   * Start scanning using Web NFC API (Chrome Android)
   */
  private async startWebNFCScan(
    onTagRead: (result: NFCScanResult) => void,
    onError?: (error: NFCError) => void
  ): Promise<() => void> {
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
      console.log('[NFC] Web NFC scanning started')

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
  async stopScan(): Promise<void> {
    // Stop Web NFC
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.reader = null

    // Stop Capacitor NFC
    if (this.capacitorListenerHandle) {
      await this.capacitorListenerHandle()
      this.capacitorListenerHandle = null
    }

    if (isCapacitorNative() && capacitorNfcInstance) {
      try {
        await capacitorNfcInstance.stopScanning()
      } catch (err) {
        console.warn('[NFC] Error stopping Capacitor scan session:', err)
      }
    }

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

    // Use Capacitor NFC if available
    if (isCapacitorNative()) {
      const nfc = await this.initCapacitorNfc()
      if (!nfc) {
        throw new Error('NFC plugin not available')
      }

      try {
        // Create NDEF text record
        const payload = `staff:${staffId}`
        const encoder = new TextEncoder()
        const textBytes = encoder.encode(payload)
        // Text record format: [language code length] [language code bytes] [text bytes]
        // Using 'en' as language code
        const langBytes = encoder.encode('en')
        const payloadArray = [langBytes.length, ...langBytes, ...textBytes]

        await nfc.write({
          records: [
            {
              tnf: 1, // TNF_WELL_KNOWN
              type: [0x54], // 'T' for Text record
              id: [],
              payload: payloadArray
            }
          ]
        })
        console.log('[NFC] Tag written successfully via Capacitor')
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to write NFC tag')
      }
      return
    }

    // Fall back to Web NFC
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
      console.log('[NFC] Tag written successfully via Web NFC')
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
