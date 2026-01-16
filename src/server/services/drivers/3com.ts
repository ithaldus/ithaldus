import type { Client, ClientChannel } from 'ssh2'
import type { DeviceInfo, InterfaceInfo, NeighborInfo, Driver, LogLevel } from './types'
import { query3ComSnmp } from './3com-snmp'

// Strip ANSI escape codes and control characters from 3Com output
function stripControlChars(str: string): string {
  return str
    // Remove ANSI escape sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Remove VT100 escape sequences
    .replace(/\x1b./g, '')
    // Remove carriage returns
    .replace(/\r/g, '')
    // Remove null bytes
    .replace(/\x00/g, '')
    // Remove "---- More ----" and surrounding cursor movement codes
    .replace(/---- More ----\[\d+D\s*\[\d+D/g, '')
    // Remove backspace characters
    .replace(/\x08/g, '')
}

// Quick strip for prompt detection
function stripForPromptDetection(str: string): string {
  return str
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b./g, '')
    .replace(/\r/g, '')
}

// 3Com switches require interactive shell mode
// This function opens a PTY shell and runs commands sequentially
async function threeComShellExecMultiple(
  client: Client,
  commands: string[],
  timeout = 30000,
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (log) log('info', `Opening shell for ${commands.length} commands...`)

    let finished = false

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        if (log) log('warn', `Shell timeout after ${timeout}ms`)
        reject(new Error('Shell command timeout'))
      }
    }, timeout)

    const onClientError = (err: Error) => {
      if (!finished && log) log('error', `Client error during shell: ${err.message}`)
    }
    const onClientClose = () => {
      if (!finished && log) log('warn', `Client closed unexpectedly during shell operation`)
    }
    client.on('error', onClientError)
    client.on('close', onClientClose)

    // Small delay to let connection stabilize
    setTimeout(() => {
      if (finished) return
      if (log) log('info', `Requesting shell with PTY...`)

      // Request shell with PTY
      client.shell({ term: 'vt100', rows: 24, cols: 132 }, (err, stream: ClientChannel) => {
        if (finished) return

        if (err) {
          finished = true
          clearTimeout(timer)
          client.removeListener('error', onClientError)
          client.removeListener('close', onClientClose)
          if (log) log('error', `Shell error: ${err.message}`)
          reject(err)
          return
        }

        if (log) log('info', `Shell channel opened, waiting for prompt...`)

        let buffer = ''
        let currentCommandIndex = -1  // -1 = waiting for initial prompt
        let currentOutput = ''
        let waitingForMoreClear = false  // Track if we're waiting for "More" to clear
        const results: string[] = []

        const sendNextCommand = () => {
          currentCommandIndex++
          if (currentCommandIndex < commands.length) {
            currentOutput = ''
            waitingForMoreClear = false
            const cmd = commands[currentCommandIndex]
            if (log) log('info', `Sending command ${currentCommandIndex + 1}/${commands.length}: ${cmd}`)
            stream.write(cmd + '\n')
          } else {
            // All commands done, exit
            if (log) log('info', `All commands complete, exiting shell`)
            stream.write('quit\n')
          }
        }

        stream.on('data', (data: Buffer) => {
          const chunk = data.toString()
          buffer += chunk

          // Strip escape sequences for prompt detection
          const cleanBuffer = stripForPromptDetection(buffer)

          // Waiting for initial prompt - 3Com prompt format: <hostname>
          if (currentCommandIndex === -1) {
            if (buffer.length === chunk.length && log) {
              log('info', `First data received (${chunk.length} bytes)`)
            }
            // Look for <hostname> pattern (3Com prompt format)
            if (/<[^>]+>\s*$/.test(cleanBuffer)) {
              if (log) log('info', `Initial prompt detected`)
              sendNextCommand()
            }
            return
          }

          // Collecting output from current command
          currentOutput += chunk

          // If we sent a space for pagination, wait for the escape sequence that clears it
          // The switch sends escape sequences like \x1b[16D to clear "---- More ----"
          if (waitingForMoreClear) {
            // Check if the escape sequence has cleared the More prompt
            // Once we see the cursor movement escape, we can continue
            if (/\x1b\[\d+D/.test(chunk)) {
              // Clear the "---- More ----" from output since it's been visually cleared
              currentOutput = currentOutput.replace(/---- More ----.*$/s, '')
              waitingForMoreClear = false
              if (log) log('info', `Pagination cleared, continuing...`)
            }
            return
          }

          // Handle "More" pagination - send space to continue
          if (/---- More ----$/.test(currentOutput.trimEnd())) {
            if (log) log('info', `Pagination detected, sending space...`)
            stream.write(' ')
            waitingForMoreClear = true
            return
          }

          // Check if we got the prompt back (command finished)
          const cleanOutput = stripForPromptDetection(currentOutput)
          // 3Com prompt: <hostname>
          if (/<[^>]+>\s*$/.test(cleanOutput)) {
            // Command complete - parse output
            const resultLines = cleanOutput.split('\n')
            // Remove first line (echoed command) and last line (prompt)
            const result = resultLines.slice(1, -1).join('\n')
            results.push(result)

            if (log) log('info', `Command ${currentCommandIndex + 1} complete: ${result.length} bytes`)

            // Send next command
            sendNextCommand()
          }
        })

        stream.on('close', () => {
          if (log) log('info', `Shell closed with ${results.length} results`)
          finished = true
          clearTimeout(timer)
          client.removeListener('error', onClientError)
          client.removeListener('close', onClientClose)
          resolve(results)
        })

        stream.on('error', (err) => {
          if (!finished && log) log('error', `Shell stream error: ${err.message}`)
        })
      })
    }, 500)
  })
}

// Get device info from 3Com switches
async function get3ComInfo(
  client: Client,
  log?: (level: LogLevel, message: string) => void,
  credentials?: { username: string; password: string },
  deviceIp?: string,
  parentMacs: string[] = [],
  jumpHost?: Client
): Promise<DeviceInfo> {
  const shellLog = log ? (level: 'info' | 'warn' | 'error', msg: string) => log(level, msg) : undefined

  // 3Com user view has limited commands available
  // Main useful command is 'summary' which gives device info
  const commands = [
    'summary',
  ]

  let summaryRaw = ''

  try {
    const results = await threeComShellExecMultiple(client, commands, 45000, shellLog)
    summaryRaw = results[0] || ''
  } catch (e) {
    if (log) log('error', `Shell commands failed: ${(e as Error).message}`)
  }

  // Strip control characters
  const summary = stripControlChars(summaryRaw)

  if (log) {
    log('info', `Summary output: ${summary.length} bytes`)
  }

  // Parse summary for hostname, model, version
  // Format from summary:
  // 3Com Baseline Switch 2928-SFP Plus Software Version 5.20 Release 1519P06
  // 3Com Baseline Switch 2928-SFP Plus uptime is 20 weeks, 0 day, 23 hours, 33 minutes
  // Hardware Version is REV.B

  let hostname: string | null = null
  let model: string | null = null
  let serialNumber: string | null = null
  let version: string | null = null

  // Extract model from "3Com Baseline Switch XXXX Software Version..."
  // Model name can have spaces (e.g., "2928-SFP Plus")
  const modelMatch = summary.match(/3Com\s+((?:Baseline\s+)?Switch\s+[^\n]+?)\s+Software/i)
  if (modelMatch) {
    model = modelMatch[1].trim()
  }

  // Use the model name as hostname since these switches often have default hostnames
  // The prompt shows "3Com Baseline Switch" but we want the full model identifier
  if (model) {
    // Create a short hostname from the model (e.g., "Switch 2928-SFP Plus" -> "2928-SFP-Plus")
    const modelParts = model.match(/Switch\s+(.+)/i)
    if (modelParts) {
      hostname = modelParts[1].replace(/\s+/g, '-')
    } else {
      hostname = model.replace(/\s+/g, '-')
    }
  }

  // Extract version
  const versionMatch = summary.match(/Software Version\s+(\S+(?:\s+Release\s+\S+)?)/i)
  if (versionMatch) {
    version = versionMatch[1]
  }

  // Extract hardware version as serial (since serial isn't available in user view)
  const hwVersionMatch = summary.match(/Hardware Version is\s+(\S+)/i)
  if (hwVersionMatch) {
    // Use hardware version as identifier (not a real serial number)
    serialNumber = `HW:${hwVersionMatch[1]}`
  }

  if (log) {
    log('info', `Parsed: hostname=${hostname}, model=${model}, version=${version}`)
  }

  // Query SNMP for interfaces and MAC table
  // SSH user view has limited access, but SNMP provides full data
  const interfaces: InterfaceInfo[] = []
  const neighbors: NeighborInfo[] = []

  if (deviceIp) {
    if (log) log('info', `Querying SNMP on ${deviceIp}...`)

    const snmpLog = log ? (level: 'info' | 'warn' | 'error', msg: string) => log(level, msg) : undefined
    const snmpResult = await query3ComSnmp(deviceIp, 'public', snmpLog)

    if (snmpResult) {
      // Use SNMP sysName if available and SSH didn't provide hostname
      if (snmpResult.sysName && !hostname) {
        hostname = snmpResult.sysName
      }

      // Convert SNMP interfaces to InterfaceInfo
      for (const snmpIf of snmpResult.interfaces) {
        // Filter to Ethernet interfaces (type 6 = ethernetCsmacd)
        if (snmpIf.type === 6 || snmpIf.name.includes('Ethernet')) {
          interfaces.push({
            name: snmpIf.name,
            mac: snmpIf.mac || null,
            ip: null,
            bridge: null,
            vlan: null,
            comment: null,
            linkUp: snmpIf.operStatus === 'up' ? true : snmpIf.operStatus === 'down' ? false : null,
          })
        }
      }

      if (log) log('info', `Found ${interfaces.length} Ethernet interfaces via SNMP`)

      // Convert SNMP MAC table to NeighborInfo
      // Filter out parent MACs (the device we came from) to avoid loops
      const parentMacSet = new Set(parentMacs.map(m => m.toLowerCase()))

      for (const macEntry of snmpResult.macTable) {
        const normalizedMac = macEntry.mac.toLowerCase()

        // Skip parent MACs
        if (parentMacSet.has(normalizedMac)) {
          continue
        }

        neighbors.push({
          mac: macEntry.mac,
          ip: null,
          hostname: null,
          interface: macEntry.ifName,
          type: 'bridge-host',
        })
      }

      if (log) log('info', `Found ${neighbors.length} neighbor MACs via SNMP`)
    } else {
      if (log) log('warn', 'SNMP query failed, returning empty interfaces/neighbors')
    }
  } else {
    if (log) log('warn', 'No device IP provided, cannot query SNMP')
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

// 3Com switch driver
export const threeComDriver: Driver = {
  name: '3com',
  getDeviceInfo: get3ComInfo,
}

// Export the function directly for use with credentials
export { get3ComInfo }
