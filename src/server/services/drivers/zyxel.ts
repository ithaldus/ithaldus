import type { Client, ClientChannel } from 'ssh2'
import type { DeviceInfo, InterfaceInfo, NeighborInfo, Driver, LogLevel } from './types'
import https from 'https'
import http from 'http'

// Try to fetch serial from web using a specific protocol (http or https)
function tryFetchSerial(
  ip: string,
  webPassword: string,
  useHttps: boolean,
  log?: (level: LogLevel, message: string) => void
): Promise<string | null> {
  return new Promise((resolve) => {
    const auth = Buffer.from(`admin:${webPassword}`).toString('base64')
    const protocol = useHttps ? https : http
    const port = useHttps ? 443 : 80

    const req = protocol.request({
      hostname: ip,
      port,
      path: '/FirstPage.html',
      method: 'GET',
      rejectUnauthorized: false, // Zyxel uses self-signed certs
      headers: {
        'Authorization': `Basic ${auth}`
      },
      timeout: 5000
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        // Extract serial number pattern: S + 3 digits + letter + numbers
        const match = data.match(/S\d{3}[A-Z]\d+/)
        if (match) {
          if (log) log('info', `Got serial from web (${useHttps ? 'HTTPS' : 'HTTP'}): ${match[0]}`)
          resolve(match[0])
        } else {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })

    req.end()
  })
}

// Fetch serial number from Zyxel web interface (CLI doesn't expose it)
// Tries HTTPS first, then falls back to HTTP
async function fetchSerialFromWeb(
  ip: string,
  webPassword: string,
  log?: (level: LogLevel, message: string) => void
): Promise<string | null> {
  // Try HTTPS first
  let serial = await tryFetchSerial(ip, webPassword, true, log)
  if (serial) return serial

  // Fall back to HTTP
  serial = await tryFetchSerial(ip, webPassword, false, log)
  if (serial) return serial

  if (log) log('info', `Web interface not reachable (HTTP/HTTPS) - serial number unavailable`)
  return null
}

// Strip ANSI escape codes and other terminal control characters from Zyxel output
function stripControlChars(str: string): string {
  return str
    // Remove ANSI escape sequences (CSI sequences like ESC[...)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Remove VT100 escape sequences (ESC followed by single char, e.g., ESC 7 = save cursor)
    .replace(/\x1b./g, '')
    // Remove carriage returns
    .replace(/\r/g, '')
    // Remove null bytes
    .replace(/\x00/g, '')
    // Remove the weird 7777... pattern (leftover from ESC 7 sequences not fully stripped)
    .replace(/^7+$/gm, '')
    // Remove trailing 7s from prompt lines (e.g., "hostname# 7" -> "hostname#")
    .replace(/^(\S+#)\s*7*\s*$/gm, '$1')
}

// Quick strip for prompt detection - handles the most common escape sequences
function stripForPromptDetection(str: string): string {
  return str
    // Remove all ESC sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b./g, '')
    // Remove carriage returns
    .replace(/\r/g, '')
    // Remove standalone 7s (leftover from ESC 7)
    .replace(/\s7+(\s|$)/g, '$1')
    .replace(/^7+/gm, '')
}

// Zyxel switches don't support SSH exec channel - they only work with interactive shell
// This function opens a SINGLE PTY shell and runs multiple commands sequentially
async function zyxelShellExecMultiple(
  client: Client,
  commands: string[],
  timeout = 30000,
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (log) log('info', `Opening shell for ${commands.length} commands...`)

    // Track if we've already resolved/rejected
    let finished = false

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        if (log) log('warn', `Shell timeout after ${timeout}ms`)
        reject(new Error('Shell command timeout'))
      }
    }, timeout)

    // Monitor client for unexpected closure
    const onClientError = (err: Error) => {
      if (!finished && log) log('error', `Client error during shell: ${err.message}`)
    }
    const onClientClose = () => {
      if (!finished && log) log('warn', `Client closed unexpectedly during shell operation`)
    }
    client.on('error', onClientError)
    client.on('close', onClientClose)

    // Check if client is still connected before requesting shell
    // @ts-ignore - accessing internal property for debugging
    const isConnected = client._sock && !client._sock.destroyed
    if (log) log('info', `Client connected: ${isConnected}, waiting 500ms then requesting shell...`)

    // Track channel events on the client for debugging
    let channelCount = 0
    const onChannel = (info: any, accept: any, reject: any) => {
      channelCount++
      if (log) log('info', `Channel event: type=${info.type}, channelCount=${channelCount}`)
    }
    // @ts-ignore
    client.on('channel', onChannel)

    // Also track outgoing channel requests
    // @ts-ignore - accessing internal for debugging
    const protocol = client._protocol
    if (protocol && log) {
      const origChannelOpen = protocol.channelOpenSession?.bind(protocol)
      if (origChannelOpen) {
        // @ts-ignore
        protocol.channelOpenSession = function(...args: any[]) {
          log('info', `Opening SSH session channel...`)
          return origChannelOpen(...args)
        }
      }
    }

    // Small delay to let tunneled connection stabilize
    setTimeout(() => {
      if (finished) return
      if (log) log('info', `Requesting shell with PTY...`)

      // Set a shorter timeout for shell channel open - if it doesn't respond in 10s, try without PTY
      // If that also fails after another 10s, give up and return empty results (will use web fallback)
      let shellResponded = false
      let noPtyAttempted = false
      const shellTimeout = setTimeout(() => {
        if (!shellResponded && !finished && log) {
          log('warn', `Shell with PTY not responding after 10s, trying without PTY...`)
          noPtyAttempted = true
          // Try again without PTY
          client.shell((err2, stream2: ClientChannel) => {
            if (finished) return
            if (err2) {
              log('error', `Shell without PTY also failed: ${err2.message}`)
              return
            }
            shellResponded = true
            log('info', `Shell without PTY opened! Processing commands...`)
            handleShellStream(stream2)
          })
        }
      }, 10000)

      // Second timeout - if no-PTY attempt also fails, give up
      const giveUpTimeout = setTimeout(() => {
        if (!shellResponded && noPtyAttempted && !finished && log) {
          log('warn', `Shell not responding after 20s total - giving up on CLI, will try web-only`)
          finished = true
          clearTimeout(timer)
          client.removeListener('error', onClientError)
          client.removeListener('close', onClientClose)
          client.removeListener('channel', onChannel)
          // Return empty results - caller will use web fallback
          resolve([])
        }
      }, 20000)

      // Helper function to handle the shell stream (reusable for both PTY and non-PTY)
      const handleShellStream = (stream: ClientChannel) => {
        clearTimeout(shellTimeout)
        clearTimeout(giveUpTimeout)
        // Clean up channel listener
        client.removeListener('channel', onChannel)

        // @ts-ignore - accessing internal channel info
        const channelId = stream._channel?.outgoing?.id || stream._channel?.id || 'unknown'
        if (log) log('info', `Shell channel opened (id=${channelId}), waiting for prompt...`)

        let buffer = ''
        let currentCommandIndex = -1  // -1 = waiting for initial prompt
        let currentOutput = ''
        const results: string[] = []

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

          // Strip escape sequences for prompt detection
          const cleanBuffer = stripForPromptDetection(buffer)

          // Waiting for initial prompt
          if (currentCommandIndex === -1) {
            // Debug: log first data received
            if (buffer.length === chunk.length && log) {
              log('info', `First data received (${chunk.length} bytes)`)
            }
            // Look for hostname# pattern (Zyxel prompt format)
            if (/\w+#/.test(cleanBuffer)) {
              if (log) log('info', `Initial prompt detected in: ${cleanBuffer.slice(-50)}`)
              sendNextCommand()
            }
            return
          }

          // Collecting output from current command
          currentOutput += chunk

          // Check if we got the prompt back (command finished)
          // Strip escape sequences and look for hostname# pattern at end
          const cleanOutput = stripForPromptDetection(currentOutput)
          const lines = cleanOutput.split('\n')
          const lastLine = lines[lines.length - 1] || ''
          if (/\w+#\s*$/.test(lastLine)) {
            // Command complete - parse output
            // Remove first line (echoed command) and last line (prompt)
            const outputLines = cleanOutput.split('\n')
            const resultLines = outputLines.slice(1, -1)
            const result = resultLines.join('\n')
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
      }

      // Request shell with explicit PTY - Zyxel requires PTY for interactive shell
      client.shell({ term: 'vt100', rows: 24, cols: 80 }, (err, stream: ClientChannel) => {
        if (finished) return
        shellResponded = true
        clearTimeout(shellTimeout)
        clearTimeout(giveUpTimeout)

        if (err) {
          client.removeListener('channel', onChannel)
          finished = true
          clearTimeout(timer)
          client.removeListener('error', onClientError)
          client.removeListener('close', onClientClose)
          if (log) log('error', `Shell error: ${err.message}`)
          reject(err)
          return
        }

        handleShellStream(stream)
      })
    }, 500) // End setTimeout
  })
}

// Get device info from Zyxel switches (GS1920 series, etc.)
async function getZyxelInfo(
  client: Client,
  log?: (level: LogLevel, message: string) => void,
  credentials?: { username: string; password: string },
  deviceIp?: string,  // Pass IP explicitly for jump host connections
  parentMacs: string[] = []  // Parent device's MACs for reliable uplink detection (may have multiple: bridge, port, vlan)
): Promise<DeviceInfo> {
  // Zyxel switches use a Cisco-like CLI and only support interactive shell (not exec)
  // Run ALL commands in a SINGLE shell session (connection closes after shell exits)
  const shellLog = log ? (level: 'info' | 'warn' | 'error', msg: string) => log(level, msg) : undefined

  const commands = [
    'show system-information',
    'show mac address-table all',
    'show interfaces status',
    'show running-config',  // Need this to get web admin-password for serial number
    'show vlan'  // VLAN configuration per port
  ]

  let sysInfoRaw = ''
  let macTableRaw = ''
  let ifStatusRaw = ''
  let runningConfigRaw = ''
  let vlanInfoRaw = ''

  try {
    const results = await zyxelShellExecMultiple(client, commands, 45000, shellLog)
    sysInfoRaw = results[0] || ''
    macTableRaw = results[1] || ''
    ifStatusRaw = results[2] || ''
    runningConfigRaw = results[3] || ''
    vlanInfoRaw = results[4] || ''
  } catch (e) {
    if (log) log('error', `Shell commands failed: ${(e as Error).message}`)
  }

  // Debug: log raw output lengths
  if (log) {
    log('info', `Raw output lengths: sysInfo=${sysInfoRaw.length}, macTable=${macTableRaw.length}, ifStatus=${ifStatusRaw.length}, runningConfig=${runningConfigRaw.length}, vlanInfo=${vlanInfoRaw.length}`)
  }

  // Strip control characters from Zyxel terminal output
  const sysInfo = stripControlChars(sysInfoRaw)
  const macTable = stripControlChars(macTableRaw)
  const ifStatus = stripControlChars(ifStatusRaw)
  const runningConfig = stripControlChars(runningConfigRaw)
  const vlanInfo = stripControlChars(vlanInfoRaw)

  if (log) {
    log('info', `Stripped output lengths: sysInfo=${sysInfo.length}, macTable=${macTable.length}, ifStatus=${ifStatus.length}`)
  }

  // Extract web admin-password from running config for fetching serial number
  // Try multiple patterns as Zyxel config format varies
  const adminPasswordMatch = runningConfig.match(/admin-password\s+(\S+)/)
  // Fallback to SSH credentials if no web password in config (Zyxel often uses same password)
  const webPassword = adminPasswordMatch ? adminPasswordMatch[1] : credentials?.password || null

  // Use passed deviceIp, or try to get it from SSH client connection (may not work with jump hosts)
  let targetIp = deviceIp
  if (!targetIp) {
    const clientConfig = (client as any)._sock?._host || (client as any).config?.host
    targetIp = typeof clientConfig === 'string' ? clientConfig : null
  }

  // Parse system information for hostname, model, version, serial number
  // Actual format from GS1920:
  // Product Model		: GS1920-24
  // System Name		: C0-GS1920
  // Serial Number		: S150Z45000123
  // Ethernet Address	: 90:ef:68:be:bd:b7
  // ZyNOS F/W Version	: V4.50(AAOB.2) | 02/27/2018
  let hostname: string | null = null
  let model: string | null = null
  let serialNumber: string | null = null
  let version: string | null = null

  const sysNameMatch = sysInfo.match(/System Name\s*:\s*(\S+)/i)
  const modelMatch = sysInfo.match(/Product Model\s*:\s*(\S+)/i)
  const serialMatch = sysInfo.match(/Serial Number\s*:\s*(\S+)/i)
  const versionMatch = sysInfo.match(/ZyNOS F\/W Version\s*:\s*(\S+)/i)

  if (sysNameMatch) hostname = sysNameMatch[1]
  if (modelMatch) model = modelMatch[1]
  if (serialMatch) serialNumber = serialMatch[1]
  if (versionMatch) version = versionMatch[1]

  // If serial not in CLI output, try fetching from web interface
  // The web interface at /FirstPage.html shows the serial number
  if (!serialNumber && webPassword && targetIp) {
    if (log) log('info', `Serial not in CLI, trying web interface at ${targetIp}`)
    serialNumber = await fetchSerialFromWeb(targetIp, webPassword, log)
  }

  // Parse VLAN configuration from "show vlan" output
  // Format varies, but typically shows which ports are in which VLAN
  // Example output format:
  //   VLAN  Name                 Status   Tagged Ports        Untagged Ports
  //   1     default              Active   25-28               1-24
  //   100   VLAN100              Active   25-28               1-8
  const portVlans: Map<string, string[]> = new Map()  // port -> list of VLANs
  const portTaggedVlans: Map<string, string[]> = new Map()  // port -> tagged VLANs

  // Parse VLAN entries
  const vlanLines = vlanInfo.split('\n')
  for (const line of vlanLines) {
    // Skip headers
    if (line.includes('VLAN') && (line.includes('Name') || line.includes('Status'))) continue
    if (line.includes('----')) continue

    // Match: VLAN_ID  Name  Status  Tagged  Untagged
    // Example: "  100   VLAN100    Active   25-28    1-8"
    const vlanMatch = line.match(/^\s*(\d+)\s+\S+\s+\S+\s+([^\s]*)\s+([^\s]*)/)
    if (vlanMatch) {
      const vlanId = vlanMatch[1]
      const taggedPortsStr = vlanMatch[2] || ''
      const untaggedPortsStr = vlanMatch[3] || ''

      // Parse port ranges (e.g., "1-8,25-28" or "1,2,3")
      const parsePortRange = (rangeStr: string): string[] => {
        if (!rangeStr || rangeStr === '-') return []
        const ports: string[] = []
        const parts = rangeStr.split(',')
        for (const part of parts) {
          if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()))
            if (!isNaN(start) && !isNaN(end)) {
              for (let i = start; i <= end; i++) {
                ports.push(`Port ${i}`)
              }
            }
          } else {
            const num = parseInt(part.trim())
            if (!isNaN(num)) {
              ports.push(`Port ${num}`)
            }
          }
        }
        return ports
      }

      // Add untagged VLANs (access VLAN)
      for (const port of parsePortRange(untaggedPortsStr)) {
        const existing = portVlans.get(port) || []
        if (!existing.includes(vlanId)) {
          existing.push(vlanId)
          portVlans.set(port, existing)
        }
      }

      // Add tagged VLANs (trunk)
      for (const port of parsePortRange(taggedPortsStr)) {
        const existing = portTaggedVlans.get(port) || []
        if (!existing.includes(vlanId)) {
          existing.push(vlanId)
          portTaggedVlans.set(port, existing)
        }
      }
    }
  }

  // Parse interfaces from "show interfaces status" output
  // Actual format from GS1920:
  //   Port      Name           Link          State         Type       Up Time
  //      1                          Down        STOP    10/100/1000M    0:00:00
  //     11                        100M/F  FORWARDING    10/100/1000M  286:32:34
  //     28                1000M/F    SFP  FORWARDING    10/100/1000M  286:43:55
  const interfaces: InterfaceInfo[] = []
  const ifLines = ifStatus.split('\n')

  for (const line of ifLines) {
    // Match port number at start of line (with leading spaces)
    // Skip header lines that contain "Port" as a header
    if (line.includes('Port') && line.includes('Name') && line.includes('Link')) {
      continue  // Skip header line
    }
    if (line.includes('----')) {
      continue  // Skip separator line
    }

    const portMatch = line.match(/^\s*(\d+)\s+/)
    if (portMatch) {
      const portNum = portMatch[1]
      const portName = `Port ${portNum}`

      // Parse link status: "Down" means no link, speed like "100M/F" or "1000M/F" means link up
      // The link column typically shows: Down, 10M/H, 10M/F, 100M/H, 100M/F, 1000M/F, etc.
      const linkUp = !line.includes('Down') && /\d+M\/[HF]/.test(line)

      // Build VLAN string: access VLAN + tagged VLANs
      let vlan: string | null = null
      const accessVlans = portVlans.get(portName) || []
      const taggedVlans = portTaggedVlans.get(portName) || []

      // Filter out default VLAN 1 from display (unless it's the only one)
      const nonDefaultAccess = accessVlans.filter(v => v !== '1')
      const nonDefaultTagged = taggedVlans.filter(v => v !== '1')

      if (nonDefaultAccess.length > 0 && nonDefaultTagged.length > 0) {
        // Port has both access and tagged VLANs
        vlan = `${nonDefaultAccess[0]}+T:${nonDefaultTagged.join(',')}`
      } else if (nonDefaultTagged.length > 0) {
        // Trunk port
        vlan = `T:${nonDefaultTagged.join(',')}`
      } else if (nonDefaultAccess.length > 0) {
        // Access port with non-default VLAN
        vlan = nonDefaultAccess[0]
      }

      interfaces.push({
        name: portName,
        mac: null,  // Zyxel doesn't show per-port MAC in this command
        ip: null,
        bridge: null,
        vlan,
        comment: null,
        linkUp,
      })
    }
  }

  // Parse MAC address table for neighbors
  // Actual format from GS1920:
  //   Port      VLAN ID        MAC Address         Type
  //   28        1              00:0c:42:57:5f:79   Dynamic
  //   11        1              60:8a:10:96:31:fb   Dynamic
  const neighbors: NeighborInfo[] = []
  const macLines = macTable.split('\n')

  for (const line of macLines) {
    // Skip header line
    if (line.includes('Port') && line.includes('VLAN') && line.includes('MAC')) {
      continue
    }

    // Parse: "  28        1              00:0c:42:57:5f:79   Dynamic"
    // Format: Port (number), VLAN ID (number), MAC Address, Type
    const macLineMatch = line.match(/^\s*(\d+)\s+\d+\s+([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})\s+/i)

    if (macLineMatch) {
      const portNum = macLineMatch[1]
      const mac = macLineMatch[2].toUpperCase()
      const portName = `Port ${portNum}`

      neighbors.push({
        mac,
        ip: null,
        hostname: null,
        interface: portName,
        type: 'bridge-host',
      })
    }
  }

  // Detect uplink interface - prefer finding the port with any of the parent's MACs
  // This is more reliable than counting MACs (which fails when sub-switches have more devices)
  // Parent may have multiple MACs: bridge MAC, physical port MAC, VLAN interface MAC, etc.
  let ownUpstreamInterface: string | null = null

  if (parentMacs.length > 0) {
    // Find the port where we see any of the parent device's MACs
    const parentMacsUpper = new Set(parentMacs.map(m => m.toUpperCase()))
    const parentNeighbor = neighbors.find(n => parentMacsUpper.has(n.mac.toUpperCase()))
    if (parentNeighbor) {
      ownUpstreamInterface = parentNeighbor.interface
      if (log) log('info', `Uplink detected via parent MAC ${parentNeighbor.mac} on ${ownUpstreamInterface}`)
    }
  }

  // Fallback: detect by finding the port with the most MAC addresses
  // The uplink port typically sees all devices from the rest of the network
  if (!ownUpstreamInterface) {
    const macCountByPort: Map<string, number> = new Map()
    for (const neighbor of neighbors) {
      const count = macCountByPort.get(neighbor.interface) || 0
      macCountByPort.set(neighbor.interface, count + 1)
    }

    let maxMacs = 0
    for (const [port, count] of macCountByPort) {
      if (count > maxMacs) {
        maxMacs = count
        ownUpstreamInterface = port
      }
    }

    // Only consider it an uplink if it has significantly more MACs than other ports
    // (at least 3 MACs and more than twice the average of other ports)
    if (ownUpstreamInterface && maxMacs >= 3) {
      const otherPorts = [...macCountByPort.entries()].filter(([p]) => p !== ownUpstreamInterface)
      const avgOther = otherPorts.length > 0
        ? otherPorts.reduce((sum, [, c]) => sum + c, 0) / otherPorts.length
        : 0
      if (maxMacs <= avgOther * 2) {
        ownUpstreamInterface = null  // Not clearly an uplink
      } else if (log) {
        log('info', `Uplink detected via MAC count (${maxMacs} MACs) on ${ownUpstreamInterface}`)
      }
    }
  }

  if (log) {
    log('info', `Parsed: hostname=${hostname}, model=${model}, interfaces=${interfaces.length}, neighbors=${neighbors.length}, uplink=${ownUpstreamInterface || 'unknown'}`)
  }

  // Filter out neighbors seen on upstream interface (they belong to parent device)
  const filteredNeighbors = ownUpstreamInterface
    ? neighbors.filter(n => n.interface !== ownUpstreamInterface)
    : neighbors

  return {
    hostname,
    model,
    serialNumber,
    version,
    interfaces,
    neighbors: filteredNeighbors,
    dhcpLeases: [],  // Zyxel switches typically don't run DHCP server
    ownUpstreamInterface,
  }
}

// Zyxel switch driver
export const zyxelDriver: Driver = {
  name: 'zyxel',
  getDeviceInfo: getZyxelInfo,
}

// Export the function directly for use with credentials
export { getZyxelInfo }
