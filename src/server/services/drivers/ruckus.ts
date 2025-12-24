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

// Ruckus Unleashed uses an interactive shell (like Cisco IOS)
// This function opens a PTY shell and runs multiple commands sequentially
async function ruckusShellExecMultiple(
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
          if (buffer.includes('#') || buffer.includes('Please login:')) {
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
    const results = await ruckusShellExecMultiple(client, commands, 30000, shellLog)
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
  // Example output from "show sysinfo":
  // System Overview:
  //   Name= R510-Master
  //   IP Address= 192.168.1.1
  //   MAC Address= B4:79:C8:XX:XX:XX
  //   Uptime= 30 days, 5 hours
  //   Model= R510
  //   Serial#= 12345678901
  //   Version= 200.13.6.0.4
  let hostname: string | null = null
  let model: string | null = null
  let serialNumber: string | null = null
  let version: string | null = null

  const nameMatch = sysInfo.match(/Name\s*[=:]\s*(\S+)/i)
  const modelMatch = sysInfo.match(/Model\s*[=:]\s*(\S+)/i)
  const serialMatch = sysInfo.match(/Serial#?\s*[=:]\s*(\S+)/i)
  const versionMatch = sysInfo.match(/Version\s*[=:]\s*(\S+)/i)

  if (nameMatch) hostname = nameMatch[1]
  if (modelMatch) model = modelMatch[1]
  if (serialMatch) serialNumber = serialMatch[1]
  if (versionMatch) version = versionMatch[1]

  // Create interface for the wireless AP
  // Ruckus APs typically have one LAN interface and multiple wireless radios
  const interfaces: InterfaceInfo[] = [
    {
      name: 'wlan0',
      mac: null,
      ip: null,
      bridge: null,
      vlan: null,
    },
    {
      name: 'wlan1',
      mac: null,
      ip: null,
      bridge: null,
      vlan: null,
    },
  ]

  // Parse connected clients from "show current-active-clients all"
  // Example output:
  // MAC Address        IP Address       User Name       WLAN     AP Name      ...
  // 00:11:22:33:44:55  192.168.1.100    user1          SSID1    R510-Master  ...
  const neighbors: NeighborInfo[] = []
  const clientLines = clientsInfo.split('\n')

  for (const line of clientLines) {
    // Skip header lines
    if (line.includes('MAC Address') || line.includes('---') || !line.trim()) {
      continue
    }

    // Parse client entry - MAC is first column
    const macMatch = line.match(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/i)
    const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/)

    if (macMatch) {
      const mac = macMatch[1].toUpperCase()
      const ip = ipMatch ? ipMatch[1] : null

      // Extract hostname from user name column if available
      const parts = line.trim().split(/\s+/)
      // Typically: MAC, IP, UserName, WLAN, AP, etc.
      const hostname = parts.length > 2 && parts[2] !== '-' ? parts[2] : null

      neighbors.push({
        mac,
        ip,
        hostname,
        interface: 'wlan0',  // Default to wlan0, could parse WLAN column for more accuracy
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
    dhcpLeases: [],  // Ruckus APs don't typically run DHCP server
    ownUpstreamInterface: null,  // Would need LLDP/CDP to detect
  }
}

// Ruckus Unleashed driver (for standalone/master mode APs)
export const ruckusUnleashedDriver: Driver = {
  name: 'ruckus-unleashed',
  getDeviceInfo: getRuckusUnleashedInfo,
}

// Ruckus SmartZone driver (for APs managed by SmartZone controller)
// For now, uses same implementation - SmartZone controller access would be different
export const ruckusSmartZoneDriver: Driver = {
  name: 'ruckus-smartzone',
  getDeviceInfo: getRuckusUnleashedInfo,  // TODO: Implement SmartZone-specific API
}
