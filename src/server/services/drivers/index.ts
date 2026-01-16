// Driver registry - exports all drivers and shared types

export * from './types'
export { mikrotikRouterOsDriver, mikrotikSwosDriver } from './mikrotik'
export { zyxelDriver, getZyxelInfo } from './zyxel'
export { ruckusUnleashedDriver, ruckusSmartZoneDriver, getRuckusInfo, isRkscliDevice } from './ruckus'
export { threeComDriver, get3ComInfo } from './3com'

import type { Driver } from './types'
import { mikrotikRouterOsDriver, mikrotikSwosDriver } from './mikrotik'
import { zyxelDriver } from './zyxel'
import { ruckusUnleashedDriver, ruckusSmartZoneDriver } from './ruckus'
import { threeComDriver } from './3com'

// Registry of all available drivers by name
export const drivers: Record<string, Driver> = {
  'mikrotik-routeros': mikrotikRouterOsDriver,
  'mikrotik-swos': mikrotikSwosDriver,
  'zyxel': zyxelDriver,
  'ruckus-unleashed': ruckusUnleashedDriver,
  'ruckus-smartzone': ruckusSmartZoneDriver,
  '3com': threeComDriver,
}

// Get driver by name
export function getDriver(name: string): Driver | undefined {
  return drivers[name]
}
