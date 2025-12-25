/**
 * Migration script to fix device types based on vendor
 * Run with: bun run src/server/db/fix-device-types.ts
 */

import { db } from './client'
import { devices } from './schema'
import { eq } from 'drizzle-orm'

type ExtendedDeviceType = 'router' | 'switch' | 'access-point' | 'end-device' | 'iot' | 'printer' | 'camera' | 'tv' | 'phone' | 'desktop-phone' | 'server' | 'computer' | 'tablet'

// Same logic as in scanner.ts
function detectTypeFromVendor(vendor: string | null, hostname: string | null): ExtendedDeviceType | null {
  if (!vendor) return null

  const vendorLower = vendor.toLowerCase()
  const hostnameLower = (hostname || '').toLowerCase()

  // IoT devices
  if (vendorLower.includes('tuya') || vendorLower.includes('espressif') || vendorLower.includes('shenzhen')) {
    return 'iot'
  }

  // Network equipment
  if (vendorLower.includes('ubiquiti')) return 'access-point'
  if (vendorLower.includes('ruckus')) return 'access-point'
  if (vendorLower.includes('mikrotik')) return 'router'
  if (vendorLower.includes('zyxel')) return 'switch'
  if (vendorLower.includes('tp-link') || vendorLower.includes('tplink')) return 'router'
  if (vendorLower.includes('netgear')) return 'router'
  if (vendorLower.includes('d-link') || vendorLower.includes('dlink')) return 'router'

  // Cisco - check hostname for SPA phones
  if (vendorLower.includes('cisco')) {
    if (hostnameLower.startsWith('spa')) return 'desktop-phone'
    return 'switch'
  }

  // Printers
  if (vendorLower.includes('kyocera')) return 'printer'
  if (vendorLower.includes('canon')) return 'printer'
  if (vendorLower.includes('epson')) return 'printer'
  if (vendorLower.includes('brother')) return 'printer'
  if (vendorLower.includes('xerox')) return 'printer'
  if (vendorLower.includes('lexmark')) return 'printer'
  if (vendorLower.includes('ricoh')) return 'printer'
  if (vendorLower.includes('hp') || vendorLower.includes('hewlett')) {
    if (hostnameLower.startsWith('hp') || hostnameLower.includes('printer') || hostnameLower.includes('laserjet') || hostnameLower.includes('officejet')) {
      return 'printer'
    }
  }

  // TVs and displays
  if (vendorLower.includes('samsung') && hostnameLower === 'samsung') return 'tv'
  if (vendorLower.includes('lg') && (hostnameLower.includes('tv') || hostnameLower.includes('webos'))) return 'tv'
  if (vendorLower.includes('sony') && hostnameLower.includes('bravia')) return 'tv'

  // Phones
  if (vendorLower.includes('apple')) {
    if (hostnameLower.includes('iphone')) return 'phone'
    if (hostnameLower.includes('ipad')) return 'tablet'
  }
  if (vendorLower.includes('samsung') && hostnameLower.includes('galaxy')) return 'phone'

  // Computers
  if (vendorLower.includes('dell') || vendorLower.includes('lenovo') || vendorLower.includes('asus') || vendorLower.includes('acer')) {
    return 'computer'
  }

  return null
}

async function fixDeviceTypes() {
  console.log('Fixing device types based on vendor...\n')

  // Get all devices that are currently 'end-device' and don't have userType set
  const allDevices = await db.select().from(devices)

  let updated = 0
  let skipped = 0

  for (const device of allDevices) {
    // Only fix end-device types
    if (device.type !== 'end-device') {
      skipped++
      continue
    }

    const newType = detectTypeFromVendor(device.vendor, device.hostname)

    if (newType && newType !== 'end-device') {
      await db.update(devices)
        .set({ type: newType })
        .where(eq(devices.id, device.id))

      console.log(`Updated: ${device.hostname || device.ip || device.mac} (${device.vendor}) -> ${newType}`)
      updated++
    } else {
      skipped++
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`)
}

fixDeviceTypes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
