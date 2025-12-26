import type { Client, ClientChannel } from 'ssh2'
import type { DeviceInfo, InterfaceInfo, NeighborInfo, Driver, LogLevel } from './types'

// Strip ANSI escape codes and terminal control characters from Ruckus output
function stripControlChars(str: string): string {
  return str
    // Remove ANSI escape sequences (CSI sequences)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Remove other escape sequences
    .replace(/\x1b[^[]/g, '')
    // Remove carriage returns
    .replace(/\r/g, '')
    // Remove null bytes
    .replace(/\x00/g, '')
}

// Parse Ruckus banner for model and serial
// Format: "** Ruckus H550 Multimedia Hotzone Wireless AP: 162229002488"
// Or: "** Ruckus R510 Multimedia Hotzone Wireless AP: 123456789012"
function parseRuckusBanner(banner: string): { model: string | null; serialNumber: string | null } {
  let model: string | null = null
  let serialNumber: string | null = null

  // Match: Ruckus <model> ... AP: <serial>
  const match = banner.match(/Ruckus\s+(\w+).*?:\s*(\d+)/i)
  if (match) {
    model = `Ruckus ${match[1]}`
    serialNumber = match[2]
  }

  return { model, serialNumber }
}

// Ruckus rkscli shell executor (for SmartZone-managed APs and standalone APs)
// The rkscli shell uses "rkscli:" prompt and may require shell-based login
async function ruckusRkscliExecMultiple(
  client: Client,
  commands: string[],
  credentials: { username: string; password: string },
  timeout = 30000,
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (log) log('warn', `Shell timeout after ${timeout}ms`)
      reject(new Error('Shell command timeout'))
    }, timeout)

    client.shell({ term: 'xterm', rows: 200, cols: 120 }, (err, stream: ClientChannel) => {
      if (err) {
        clearTimeout(timer)
        if (log) log('error', `Shell error: ${err.message}`)
        reject(err)
        return
      }

      if (log) log('info', `Shell opened, running ${commands.length} commands`)

      let buffer = ''
      let currentCommandIndex = -1  // -1 = waiting for initial prompt
      let currentOutput = ''
      const results: string[] = []
      let loginSent = false
      let passwordSent = false

      const sendNextCommand = () => {
        currentCommandIndex++
        if (currentCommandIndex < commands.length) {
          currentOutput = ''
          const cmd = commands[currentCommandIndex]
          if (log) log('info', `Sending command ${currentCommandIndex + 1}/${commands.length}: ${cmd}`)
          stream.write(cmd + '\n')
        } else {
          // All commands done, exit
          if (log) log('info', `All commands complete, exiting shell`)
          stream.write('exit\n')
        }
      }

      stream.on('data', (data: Buffer) => {
        const chunk = data.toString()
        buffer += chunk

        // Handle shell-based login (rkscli style)
        if (currentCommandIndex === -1) {
          // Check for login prompt
          if (!loginSent && buffer.includes('Please login:')) {
            if (log) log('info', `Login prompt detected, sending username`)
            loginSent = true
            stream.write(credentials.username + '\n')
            return
          }
          // Check for password prompt
          if (loginSent && !passwordSent && buffer.toLowerCase().includes('password')) {
            if (log) log('info', `Password prompt detected, sending password`)
            passwordSent = true
            stream.write(credentials.password + '\n')
            return
          }
          // Check for rkscli prompt
          if (buffer.includes('rkscli:')) {
            if (log) log('info', `rkscli prompt detected, starting commands`)
            sendNextCommand()
          }
          return
        }

        // Collecting output from current command
        currentOutput += chunk

        // Check if we got the prompt back (command finished)
        // rkscli commands end with "OK" or "Error" followed by "rkscli:"
        const lines = currentOutput.split('\n')
        const lastLine = lines[lines.length - 1] || ''
        if (lastLine.includes('rkscli:')) {
          // Command complete - parse output
          // Remove first line (echoed command) and last line (prompt)
          const outputLines = currentOutput.split('\n')
          const resultLines = outputLines.slice(1, -1)
          const result = resultLines.join('\n')
          results.push(result)

          if (log) log('info', `Command ${currentCommandIndex + 1} complete: ${result.length} bytes`)

          // Send next command
          sendNextCommand()
        }
      })

      stream.on('close', () => {
        clearTimeout(timer)
        if (log) log('info', `Shell closed with ${results.length} results`)

        // Fill in any missing results with empty strings
        while (results.length < commands.length) {
          results.push('')
        }
        resolve(results)
      })

      stream.on('error', (streamErr: Error) => {
        clearTimeout(timer)
        if (log) log('error', `Shell stream error: ${streamErr.message}`)
        reject(streamErr)
      })
    })
  })
}

// Ruckus Unleashed shell executor (Cisco-like CLI with enable mode)
async function ruckusUnleashedExecMultiple(
  client: Client,
  commands: string[],
  timeout = 30000,
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (log) log('warn', `Shell timeout after ${timeout}ms`)
      reject(new Error('Shell command timeout'))
    }, timeout)

    client.shell({ term: 'xterm', rows: 200, cols: 120 }, (err, stream: ClientChannel) => {
      if (err) {
        clearTimeout(timer)
        if (log) log('error', `Shell error: ${err.message}`)
        reject(err)
        return
      }

      if (log) log('info', `Shell opened, running ${commands.length} commands`)

      let buffer = ''
      let currentCommandIndex = -1  // -1 = waiting for initial prompt
      let currentOutput = ''
      const results: string[] = []
      let inEnableMode = false

      const sendNextCommand = () => {
        currentCommandIndex++
        if (currentCommandIndex < commands.length) {
          currentOutput = ''
          const cmd = commands[currentCommandIndex]
          if (log) log('info', `Sending command ${currentCommandIndex + 1}/${commands.length}: ${cmd}`)
          stream.write(cmd + '\n')
        } else {
          // All commands done, exit
          if (log) log('info', `All commands complete, exiting shell`)
          stream.write('exit\n')
        }
      }

      stream.on('data', (data: Buffer) => {
        const chunk = data.toString()
        buffer += chunk

        // Waiting for initial prompt (could be "ruckus>" or "ruckus#")
        if (currentCommandIndex === -1) {
          // First need to enter enable mode
          if (!inEnableMode && buffer.includes('>')) {
            if (log) log('info', `Initial prompt detected, entering enable mode`)
            inEnableMode = true
            stream.write('enable\n')
            return
          }
          // Now in enable mode (or already there), look for # prompt
          if (buffer.includes('#')) {
            if (log) log('info', `Enable mode prompt detected, starting commands`)
            sendNextCommand()
          }
          return
        }

        // Collecting output from current command
        currentOutput += chunk

        // Check if we got the prompt back (command finished)
        // Ruckus prompts: "hostname#" or "ruckus#"
        const lines = currentOutput.split('\n')
        const lastLine = lines[lines.length - 1] || ''
        if (/[\w-]+[>#]\s*$/.test(lastLine)) {
          // Command complete - parse output
          // Remove first line (echoed command) and last line (prompt)
          const outputLines = currentOutput.split('\n')
          const resultLines = outputLines.slice(1, -1)
          const result = resultLines.join('\n')
          results.push(result)

          if (log) log('info', `Command ${currentCommandIndex + 1} complete: ${result.length} bytes`)

          // Send next command
          sendNextCommand()
        }
      })

      stream.on('close', () => {
        clearTimeout(timer)
        if (log) log('info', `Shell closed with ${results.length} results`)

        // Fill in any missing results with empty strings
        while (results.length < commands.length) {
          results.push('')
        }
        resolve(results)
      })

      stream.on('error', (streamErr: Error) => {
        clearTimeout(timer)
        if (log) log('error', `Shell stream error: ${streamErr.message}`)
        reject(streamErr)
      })
    })
  })
}

// Get device info from Ruckus rkscli APs (SmartZone-managed or standalone with rkscli)
async function getRuckusRkscliInfo(
  client: Client,
  banner: string,
  credentials: { username: string; password: string },
  log?: (level: LogLevel, message: string) => void
): Promise<DeviceInfo> {
  const shellLog = log ? (level: 'info' | 'warn' | 'error', msg: string) => log(level, msg) : undefined

  // Parse model and serial from SSH banner first
  // Banner format: "** Ruckus H550 Multimedia Hotzone Wireless AP: 162229002488"
  const bannerInfo = parseRuckusBanner(banner)
  let model = bannerInfo.model
  let serialNumber = bannerInfo.serialNumber

  // Try to get more info from rkscli commands
  const commands = [
    'get devicename',
    'get version',
  ]

  let deviceNameRaw = ''
  let versionRaw = ''

  try {
    const results = await ruckusRkscliExecMultiple(client, commands, credentials, 30000, shellLog)
    deviceNameRaw = results[0] || ''
    versionRaw = results[1] || ''
  } catch (e) {
    if (log) log('warn', `rkscli commands failed: ${(e as Error).message} - using banner info only`)
  }

  // Parse device name
  const deviceName = stripControlChars(deviceNameRaw)
  let hostname: string | null = null
  // rkscli returns: "Device Name= AP-Name" or just the name
  const nameMatch = deviceName.match(/(?:Device\s*Name\s*[=:]\s*)?(\S+)/i)
  if (nameMatch && nameMatch[1] !== 'OK') {
    hostname = nameMatch[1]
  }

  // Parse version
  const versionStr = stripControlChars(versionRaw)
  let version: string | null = null
  const versionMatch = versionStr.match(/(\d+\.\d+[\d.]*)/i)
  if (versionMatch) {
    version = versionMatch[1]
  }

  if (log) {
    log('info', `Parsed: hostname=${hostname}, model=${model}, serial=${serialNumber}, version=${version}`)
  }

  // Create interfaces for the wireless AP
  const interfaces: InterfaceInfo[] = [
    {
      name: 'eth0',
      mac: null,
      ip: null,
      bridge: null,
      vlan: null,
      comment: 'LAN port',
      linkUp: true,
    },
    {
      name: 'wlan0',
      mac: null,
      ip: null,
      bridge: null,
      vlan: null,
      comment: '2.4GHz radio',
      linkUp: true,
    },
    {
      name: 'wlan1',
      mac: null,
      ip: null,
      bridge: null,
      vlan: null,
      comment: '5GHz radio',
      linkUp: true,
    },
  ]

  return {
    hostname,
    model,
    serialNumber,
    version,
    interfaces,
    neighbors: [],  // Would need 'get stainfo' to get connected clients
    dhcpLeases: [],
    ownUpstreamInterface: 'eth0',  // Ruckus APs use eth0 as uplink
  }
}

// Get device info from Ruckus Unleashed access points
async function getRuckusUnleashedInfo(client: Client, log?: (level: LogLevel, message: string) => void): Promise<DeviceInfo> {
  const shellLog = log ? (level: 'info' | 'warn' | 'error', msg: string) => log(level, msg) : undefined

  // Commands to gather device information
  const commands = [
    'show sysinfo',                    // System info: Name, IP, MAC, Model, Serial, Version
    'show current-active-clients all', // Connected clients with MAC addresses
  ]

  let sysInfoRaw = ''
  let clientsRaw = ''

  try {
    const results = await ruckusUnleashedExecMultiple(client, commands, 30000, shellLog)
    sysInfoRaw = results[0] || ''
    clientsRaw = results[1] || ''
  } catch (e) {
    if (log) log('error', `Shell commands failed: ${(e as Error).message}`)
  }

  // Debug: log raw output lengths
  if (log) {
    log('info', `Raw output lengths: sysInfo=${sysInfoRaw.length}, clients=${clientsRaw.length}`)
  }

  // Strip control characters from terminal output
  const sysInfo = stripControlChars(sysInfoRaw)
  const clientsInfo = stripControlChars(clientsRaw)

  // Parse system information
  let hostname: string | null = null
  let model: string | null = null
  let serialNumber: string | null = null
  let version: string | null = null

  const nameMatch = sysInfo.match(/Name\s*[=:]\s*(\S+)/i)
  const modelMatch = sysInfo.match(/Model\s*[=:]\s*(\S+)/i)
  const serialMatch = sysInfo.match(/Serial#?\s*[=:]\s*(\S+)/i)
  const versionMatch = sysInfo.match(/Version\s*[=:]\s*(\S+)/i)

  if (nameMatch) hostname = nameMatch[1]
  if (modelMatch) model = `Ruckus ${modelMatch[1]}`
  if (serialMatch) serialNumber = serialMatch[1]
  if (versionMatch) version = versionMatch[1]

  // Create interface for the wireless AP
  const interfaces: InterfaceInfo[] = [
    {
      name: 'wlan0',
      mac: null,
      ip: null,
      bridge: null,
      vlan: null,
      comment: null,
      linkUp: true,
    },
    {
      name: 'wlan1',
      mac: null,
      ip: null,
      bridge: null,
      vlan: null,
      comment: null,
      linkUp: true,
    },
  ]

  // Parse connected clients
  const neighbors: NeighborInfo[] = []
  const clientLines = clientsInfo.split('\n')

  for (const line of clientLines) {
    if (line.includes('MAC Address') || line.includes('---') || !line.trim()) {
      continue
    }

    const macMatch = line.match(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/i)
    const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/)

    if (macMatch) {
      const mac = macMatch[1].toUpperCase()
      const ip = ipMatch ? ipMatch[1] : null

      const parts = line.trim().split(/\s+/)
      const clientHostname = parts.length > 2 && parts[2] !== '-' ? parts[2] : null

      neighbors.push({
        mac,
        ip,
        hostname: clientHostname,
        interface: 'wlan0',
        type: 'bridge-host',
      })
    }
  }

  if (log) {
    log('info', `Parsed: hostname=${hostname}, model=${model}, serial=${serialNumber}, neighbors=${neighbors.length}`)
  }

  return {
    hostname,
    model,
    serialNumber,
    version,
    interfaces,
    neighbors,
    dhcpLeases: [],
    ownUpstreamInterface: null,
  }
}

// Detect which Ruckus CLI mode is in use based on banner
export function isRkscliDevice(banner: string): boolean {
  // rkscli devices have this banner format:
  // "** Ruckus H550 Multimedia Hotzone Wireless AP: 162229002488"
  return banner.includes('Ruckus') && banner.includes('Wireless AP:')
}

// Ruckus driver that auto-detects CLI mode
export async function getRuckusInfo(
  client: Client,
  banner: string,
  credentials: { username: string; password: string },
  log?: (level: LogLevel, message: string) => void
): Promise<DeviceInfo> {
  if (isRkscliDevice(banner)) {
    if (log) log('info', `Detected rkscli CLI mode from banner`)
    return getRuckusRkscliInfo(client, banner, credentials, log)
  } else {
    if (log) log('info', `Using Unleashed CLI mode`)
    return getRuckusUnleashedInfo(client, log)
  }
}

// Ruckus Unleashed driver (for standalone/master mode APs)
export const ruckusUnleashedDriver: Driver = {
  name: 'ruckus-unleashed',
  getDeviceInfo: getRuckusUnleashedInfo,
}

// Ruckus SmartZone driver (for APs managed by SmartZone controller or rkscli)
// Note: This driver needs banner and credentials, so it's used differently in the scanner
export const ruckusSmartZoneDriver: Driver = {
  name: 'ruckus-smartzone',
  getDeviceInfo: getRuckusUnleashedInfo,  // Fallback - actual usage is via getRuckusInfo()
}

// Export the banner parser for use in scanner
export { parseRuckusBanner }
