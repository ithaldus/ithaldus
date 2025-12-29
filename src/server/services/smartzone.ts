/**
 * SmartZone API client for enriching Ruckus AP metadata
 *
 * Uses the SmartZone REST API to fetch AP information that is difficult
 * to obtain via direct SSH/CLI access to managed APs.
 */

// For self-signed certificates, we use process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
// This is set before the fetch calls in the methods below

export interface SmartZoneConfig {
  host: string
  port: number
  username: string
  password: string
}

export interface SmartZoneAP {
  mac: string           // AP MAC address (normalized to uppercase with colons)
  ip: string
  name: string          // deviceName from SmartZone
  serial: string
  model: string
  firmware: string
  status: 'Online' | 'Offline' | 'Flagged'
}

interface SmartZoneAPRaw {
  apMac: string
  ip: string
  deviceName: string
  serial: string
  model?: string
  firmwareVersion: string
  status: 'Online' | 'Offline' | 'Flagged'
}

interface ServiceTicketResponse {
  serviceTicket: string
}

interface APQueryResponse {
  totalCount: number
  hasMore: boolean
  firstIndex: number
  list: SmartZoneAPRaw[]
}

// Normalize MAC address to uppercase with colons (AA:BB:CC:DD:EE:FF)
function normalizeMac(mac: string): string {
  // Remove any separators and convert to uppercase
  const clean = mac.replace(/[:-]/g, '').toUpperCase()
  // Insert colons every 2 characters
  return clean.match(/.{2}/g)?.join(':') || mac.toUpperCase()
}

export class SmartZoneService {
  private baseUrl: string
  private config: SmartZoneConfig

  constructor(config: SmartZoneConfig) {
    this.config = config
    this.baseUrl = `https://${config.host}:${config.port}/wsg/api/public/v9_1`
  }

  /**
   * Authenticate with SmartZone and get a service ticket
   */
  async authenticate(): Promise<string> {
    // Allow self-signed certificates
    const originalTLS = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

    try {
      const response = await fetch(`${this.baseUrl}/serviceTicket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.config.username,
          password: this.config.password,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`SmartZone authentication failed: ${response.status} ${response.statusText} - ${text}`)
      }

      const data = await response.json() as ServiceTicketResponse
      return data.serviceTicket
    } finally {
      // Restore original TLS setting
      if (originalTLS !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTLS
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      }
    }
  }

  /**
   * Query all APs from SmartZone
   */
  async getAPs(serviceTicket: string): Promise<SmartZoneAP[]> {
    // Allow self-signed certificates
    const originalTLS = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

    try {
      const response = await fetch(`${this.baseUrl}/query/ap?serviceTicket=${serviceTicket}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Empty query = all APs
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`SmartZone AP query failed: ${response.status} ${response.statusText} - ${text}`)
      }

      const data = await response.json() as APQueryResponse

      return data.list.map((ap): SmartZoneAP => ({
        mac: normalizeMac(ap.apMac),
        ip: ap.ip || '',
        name: ap.deviceName || '',
        serial: ap.serial || '',
        model: ap.model || '',
        firmware: ap.firmwareVersion || '',
        status: ap.status,
      }))
    } finally {
      // Restore original TLS setting
      if (originalTLS !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTLS
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      }
    }
  }

  /**
   * Test connection to SmartZone and return AP count
   */
  async testConnection(): Promise<{ success: boolean; apCount: number; error?: string }> {
    try {
      const ticket = await this.authenticate()
      const aps = await this.getAPs(ticket)
      return { success: true, apCount: aps.length }
    } catch (err) {
      return {
        success: false,
        apCount: 0,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }

  /**
   * Fetch all APs and return as a Map keyed by normalized MAC address
   */
  async fetchAPsByMac(): Promise<Map<string, SmartZoneAP>> {
    const ticket = await this.authenticate()
    const aps = await this.getAPs(ticket)

    const map = new Map<string, SmartZoneAP>()
    for (const ap of aps) {
      map.set(ap.mac, ap)
    }
    return map
  }
}

/**
 * Create a SmartZone service instance from network config
 */
export function createSmartZoneService(config: SmartZoneConfig): SmartZoneService {
  return new SmartZoneService(config)
}
