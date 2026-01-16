// Web NFC API Type Definitions
// https://w3c.github.io/web-nfc/

interface NDEFReadingEvent extends Event {
  serialNumber: string
  message: NDEFMessage
}

interface NDEFErrorEvent extends Event {
  error: DOMException
}

interface NDEFMessage {
  records: NDEFRecord[]
}

interface NDEFRecord {
  recordType: string
  mediaType?: string
  id?: string
  data?: DataView
  encoding?: string
  lang?: string
  toRecords?: () => NDEFRecord[]
}

interface NDEFScanOptions {
  signal?: AbortSignal
}

interface NDEFWriteOptions {
  overwrite?: boolean
  signal?: AbortSignal
}

declare class NDEFReader extends EventTarget {
  constructor()
  scan(options?: NDEFScanOptions): Promise<void>
  write(message: string | NDEFMessageInit, options?: NDEFWriteOptions): Promise<void>
  onreading: ((event: NDEFReadingEvent) => void) | null
  onreadingerror: ((event: NDEFErrorEvent) => void) | null
}

interface NDEFMessageInit {
  records: NDEFRecordInit[]
}

interface NDEFRecordInit {
  recordType: string
  mediaType?: string
  id?: string
  encoding?: string
  lang?: string
  data?: string | BufferSource | NDEFMessageInit
}

interface Window {
  NDEFReader?: typeof NDEFReader
}
