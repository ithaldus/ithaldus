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
        if (log) {
          log('info', `Shell closed with ${results.length} results`)
          // Debug: dump final buffer if no results
          if (results.length === 0 && buffer.length > 0) {
            const escaped = buffer.replace(/\x1b/g, '\\x1b').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
            log('warn', `No results! Final buffer (${buffer.length}b): ${escaped.substring(0, 500)}`)
          }
        }

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

// Helper to check if line ends with a Ruckus prompt
function isRuckusPrompt(line: string): { isPrompt: boolean; isEnable: boolean } {
  const trimmed = line.trim()
  // Ruckus prompts: "hostname>" (user mode) or "hostname#" (enable mode)
  // Also matches: "ruckus>", "ruckus#", "AP-Name>", "AP-Name#"
  const enableMatch = /^[\w-]+#\s*$/.test(trimmed)
  const userMatch = /^[\w-]+>\s*$/.test(trimmed)
  return { isPrompt: enableMatch || userMatch, isEnable: enableMatch }
}

// Ruckus Unleashed shell executor (Cisco-like CLI with enable mode)
// Also handles rkscli-style login if detected
// Accepts array of credentials to try for CLI login (Ruckus often has different SSH vs CLI auth)
async function ruckusUnleashedExecMultiple(
  client: Client,
  commands: string[],
  credentialsList: Array<{ username: string; password: string }>,
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
      let enableSent = false
      // For rkscli-style login detection
      let isRkscliMode = false
      let credentialIndex = 0
      let loginPhase: 'waiting' | 'waiting_for_prompt' | 'username_sent' | 'password_sent' | 'authenticated' = 'waiting'

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

      const tryNextCredential = () => {
        if (credentialIndex < credentialsList.length) {
          const cred = credentialsList[credentialIndex]
          if (log) log('info', `Trying CLI credential ${credentialIndex + 1}/${credentialsList.length}: ${cred.username}`)
          loginPhase = 'username_sent'
          stream.write(cred.username + '\n')
        } else {
          if (log) log('warn', `All ${credentialsList.length} CLI credentials failed`)
          stream.end()
        }
      }

      stream.on('data', (data: Buffer) => {
        const chunk = data.toString()
        buffer += chunk

        // Waiting for initial prompt
        if (currentCommandIndex === -1) {
          // Check for rkscli prompt first (login succeeded!)
          if (isRkscliMode && buffer.includes('rkscli:')) {
            const cred = credentialsList[credentialIndex]
            if (log) log('info', `rkscli prompt detected! CLI login successful with ${cred.username}`)
            loginPhase = 'authenticated'
            buffer = ''  // Clear buffer for command output
            sendNextCommand()
            return
          }

          // Check for account lockout - stop immediately
          // "Login failure" (without "incorrect") means the device has locked out after too many attempts
          if (isRkscliMode && buffer.includes('Login failure') && !buffer.includes('Login incorrect')) {
            if (log) log('warn', `Account lockout detected - device has locked out after failed attempts`)
            stream.end()
            return
          }

          // Check for login failed - prepare for retry
          if (isRkscliMode && loginPhase === 'password_sent' && buffer.includes('Login incorrect')) {
            if (log) log('info', `Login failed for ${credentialsList[credentialIndex].username}`)
            credentialIndex++
            loginPhase = 'waiting_for_prompt'  // Wait for next "Please login:"
            buffer = ''  // Clear buffer to avoid re-triggering on old data
            return
          }

          // Check for rkscli-style login prompt
          if (buffer.includes('Please login:')) {
            if (!isRkscliMode) {
              if (log) log('info', `Detected rkscli-style login prompt, switching modes`)
              isRkscliMode = true
            }
            if (loginPhase === 'waiting' || loginPhase === 'waiting_for_prompt') {
              buffer = ''  // Clear buffer before sending credentials
              tryNextCredential()
            }
            return
          }

          // Check for password prompt (rkscli mode)
          if (isRkscliMode && loginPhase === 'username_sent' && buffer.toLowerCase().includes('password')) {
            const cred = credentialsList[credentialIndex]
            if (log) log('info', `Password prompt detected, sending password for ${cred.username}`)
            loginPhase = 'password_sent'
            buffer = ''  // Clear buffer
            stream.write(cred.password + '\n')
            return
          }

          // Check for Cisco-like prompts (Unleashed mode)
          if (!isRkscliMode) {
            const lines = buffer.split('\n')
            const lastLine = lines[lines.length - 1] || ''
            const { isPrompt, isEnable } = isRuckusPrompt(lastLine)

            if (isPrompt) {
              if (isEnable) {
                // Already in enable mode
                if (log) log('info', `Already in enable mode (prompt: "${lastLine.trim()}"), starting commands`)
                inEnableMode = true
                buffer = ''  // Clear buffer for command output
                sendNextCommand()
              } else if (!enableSent) {
                // In user mode, need to enter enable mode
                if (log) log('info', `User mode prompt detected (prompt: "${lastLine.trim()}"), entering enable mode`)
                enableSent = true
                stream.write('enable\n')
              }
            }
          }
          return
        }

        // Collecting output from current command
        currentOutput += chunk

        // Check if we got the prompt back (command finished)
        const lines = currentOutput.split('\n')
        const lastLine = lines[lines.length - 1] || ''

        // Different prompt detection based on mode
        let commandComplete = false
        if (isRkscliMode) {
          commandComplete = lastLine.includes('rkscli:')
        } else {
          const { isPrompt } = isRuckusPrompt(lastLine)
          commandComplete = isPrompt
        }

        if (commandComplete) {
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
        if (log) {
          log('info', `Shell closed with ${results.length} results`)
          // Debug: dump final buffer if no results
          if (results.length === 0 && buffer.length > 0) {
            const escaped = buffer.replace(/\x1b/g, '\\x1b').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
            log('warn', `No results! Final buffer (${buffer.length}b): ${escaped.substring(0, 500)}`)
          }
        }

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
// Also handles rkscli devices that don't match banner detection
// Accepts array of credentials to try for CLI login
// Banner is used as fallback for model/serial when CLI commands fail
async function getRuckusUnleashedInfo(
  client: Client,
  banner: string,
  credentialsList: Array<{ username: string; password: string }>,
  log?: (level: LogLevel, message: string) => void
): Promise<DeviceInfo> {
  const shellLog = log ? (level: 'info' | 'warn' | 'error', msg: string) => log(level, msg) : undefined

  // Parse banner for fallback model/serial info
  const bannerInfo = parseRuckusBanner(banner)

  // Commands to gather device information
  // Note: These are Unleashed-style commands; if rkscli mode is detected at runtime,
  // we should use different commands, but for now we try these
  const commands = [
    'show sysinfo',                    // System info: Name, IP, MAC, Model, Serial, Version
    'show current-active-clients all', // Connected clients with MAC addresses
  ]

  let sysInfoRaw = ''
  let clientsRaw = ''

  try {
    const results = await ruckusUnleashedExecMultiple(client, commands, credentialsList, 30000, shellLog)
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

  // Parse system information from CLI
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

  // Use banner info as fallback if CLI didn't provide model/serial
  if (!model && bannerInfo.model) {
    model = bannerInfo.model
    if (log) log('info', `Using model from SSH banner: ${model}`)
  }
  if (!serialNumber && bannerInfo.serialNumber) {
    serialNumber = bannerInfo.serialNumber
    if (log) log('info', `Using serial from SSH banner: ${serialNumber}`)
  }

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
// Accepts array of credentials - Ruckus often has different SSH vs CLI auth
// Banner is parsed for model/serial as fallback when CLI commands fail
export async function getRuckusInfo(
  client: Client,
  banner: string,
  credentialsList: Array<{ username: string; password: string }>,
  log?: (level: LogLevel, message: string) => void
): Promise<DeviceInfo> {
  if (isRkscliDevice(banner)) {
    if (log) log('info', `Detected rkscli CLI mode from banner`)
    // For rkscli with banner, use first credential (SSH credential) for the shell login
    return getRuckusRkscliInfo(client, banner, credentialsList[0], log)
  } else {
    // Try Unleashed mode, which will auto-detect rkscli at runtime if needed
    // Pass banner for fallback model/serial extraction
    if (log) log('info', `Using Unleashed CLI mode (will auto-detect rkscli if needed)`)
    return getRuckusUnleashedInfo(client, banner, credentialsList, log)
  }
}

// Note: Ruckus drivers are not used directly via the Driver interface because
// they require credentials and banner parsing. Use getRuckusInfo() instead,
// which auto-detects CLI mode and handles authentication.
//
// Export driver definitions for reference/documentation only.
export const ruckusUnleashedDriver = {
  name: 'ruckus-unleashed',
  description: 'Ruckus Unleashed APs with Cisco-like CLI',
}

export const ruckusSmartZoneDriver = {
  name: 'ruckus-smartzone',
  description: 'Ruckus SmartZone/rkscli APs with shell-based login',
}

// Export the banner parser for use in scanner
export { parseRuckusBanner }
