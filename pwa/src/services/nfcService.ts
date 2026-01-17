// NFC Service for office check-in/check-out
// Scans location tags (not staff badges) - user identity comes from logged-in session
// Supports:
// - Web NFC (Chrome Android 89+ with HTTPS)
// - Capacitor NFC plugin (iOS/Android native apps)

import { Capacitor } from '@capacitor/core'
import type { CapacitorNfcPlugin, NfcTag } from '@capgo/capacitor-nfc'
import type { CheckInLocation } from './types'

// Dynamic import for Capacitor NFC plugin (only loaded when needed)
let capacitorNfcInstance: CapacitorNfcPlugin | null = null

export interface NFCScanResult {
  locationId: string
  locationName?: string
  locationType?: 'entrance' | 'exit' | 'general'
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
 * Known check-in locations (could be fetched from HA in production)
 */
const KNOWN_LOCATIONS: Record<string, CheckInLocation> = {
  'main-entrance': { id: 'main-entrance', name: 'Main Entrance', type: 'entrance' },
  'lobby': { id: 'lobby', name: 'Lobby', type: 'entrance' },
  'back-door': { id: 'back-door', name: 'Back Door', type: 'entrance' },
  'front-exit': { id: 'front-exit', name: 'Front Exit', type: 'exit' },
  'office': { id: 'office', name: 'Office', type: 'general' },
}

/**
 * Parse location info from NFC tag data
 * Supports multiple formats:
 * - Plain text: "lobby" or "checkin:lobby"
 * - URL: "https://office.example.com/checkin?loc=lobby"
 * - JSON: {"locationId": "lobby", "name": "Lobby"}
 */
function parseLocationData(data: string): { locationId: string; locationName?: string; locationType?: 'entrance' | 'exit' | 'general' } | null {
  const trimmed = data.trim()

  // Try URL format
  try {
    const url = new URL(trimmed)
    const loc = url.searchParams.get('loc') || url.searchParams.get('location') || url.searchParams.get('id')
    if (loc) {
      const known = KNOWN_LOCATIONS[loc]
      return {
        locationId: loc,
        locationName: known?.name,
        locationType: known?.type
      }
    }

    // Check path for /checkin/lobby format
    const pathMatch = url.pathname.match(/\/checkin\/([^/]+)/)
    if (pathMatch) {
      const loc = pathMatch[1]
      const known = KNOWN_LOCATIONS[loc]
      return {
        locationId: loc,
        locationName: known?.name,
        locationType: known?.type
      }
    }
  } catch {
    // Not a URL, continue
  }

  // Try JSON format
  try {
    const json = JSON.parse(trimmed)
    if (json.locationId || json.location || json.loc) {
      const loc = json.locationId || json.location || json.loc
      return {
        locationId: loc,
        locationName: json.name || json.locationName || KNOWN_LOCATIONS[loc]?.name,
        locationType: json.type || json.locationType || KNOWN_LOCATIONS[loc]?.type
      }
    }
  } catch {
    // Not JSON, continue
  }

  // Try "checkin:lobby" prefix format
  if (trimmed.startsWith('checkin:')) {
    const loc = trimmed.slice(8)
    const known = KNOWN_LOCATIONS[loc]
    return {
      locationId: loc,
      locationName: known?.name,
      locationType: known?.type
    }
  }

  // Try "location:lobby" prefix format
  if (trimmed.startsWith('location:')) {
    const loc = trimmed.slice(9)
    const known = KNOWN_LOCATIONS[loc]
    return {
      locationId: loc,
      locationName: known?.name,
      locationType: known?.type
    }
  }

  // Plain text - assume the whole thing is the location ID
  // Only if it looks like an ID (alphanumeric, underscores, hyphens)
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    const known = KNOWN_LOCATIONS[trimmed]
    return {
      locationId: trimmed,
      locationName: known?.name,
      locationType: known?.type
    }
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
   * Start scanning for NFC check-in tags
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
  private parseCapacitorNfcTag(tag: NfcTag): NFCScanResult | null {
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
            const locationData = parseLocationData(text)
            if (locationData) {
              return {
                ...locationData,
                serialNumber,
                rawData
              }
            }
          } catch (e) {
            console.warn('[NFC] Failed to decode payload:', e)
          }
        }
      }
    }

    return null
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

        const result = this.parseCapacitorNfcTag(event.tag)

        if (result) {
          onTagRead(result)
        } else {
          onError?.({
            status: 'error',
            message: 'Could not read location from NFC tag. Is this a valid check-in tag?'
          })
        }
      })

      this.capacitorListenerHandle = listenerResult.remove

      // Start the NFC scanning session
      await nfc.startScanning({
        alertMessage: 'Hold your phone near the check-in tag'
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
        let rawData: string | undefined

        // Try to find location in the message records
        for (const record of message.records) {
          if (record.recordType === 'text' || record.recordType === 'url') {
            const text = readRecordText(record)
            if (text) {
              rawData = text
              const locationData = parseLocationData(text)
              if (locationData) {
                onTagRead({
                  ...locationData,
                  serialNumber,
                  rawData
                })
                return
              }
            }
          }
        }

        // No valid location found
        console.log('[NFC] No location in tag data, serial:', serialNumber)
        onError?.({
          status: 'error',
          message: 'Could not read location from NFC tag. Tag data: ' + (rawData || 'empty')
        })
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
   * Write location data to an NFC tag (for provisioning check-in points)
   */
  async writeLocationTag(locationId: string, locationName?: string): Promise<void> {
    const status = getNFCStatus()

    if (status !== 'available') {
      throw new Error('NFC not available')
    }

    const payload = `checkin:${locationId}`

    // Use Capacitor NFC if available
    if (isCapacitorNative()) {
      const nfc = await this.initCapacitorNfc()
      if (!nfc) {
        throw new Error('NFC plugin not available')
      }

      try {
        // Create NDEF text record
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
        console.log('[NFC] Location tag written successfully via Capacitor:', locationId, locationName)
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to write NFC tag')
      }
      return
    }

    // Fall back to Web NFC
    const writer = new NDEFReader()

    try {
      // Write location as a text record
      await writer.write({
        records: [
          {
            recordType: 'text',
            data: payload
          }
        ]
      })
      console.log('[NFC] Location tag written successfully via Web NFC:', locationId, locationName)
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
