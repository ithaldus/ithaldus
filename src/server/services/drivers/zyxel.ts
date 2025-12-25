import type { Client, ClientChannel } from 'ssh2'
import type { DeviceInfo, InterfaceInfo, NeighborInfo, Driver, LogLevel } from './types'
import https from 'https'

// Fetch serial number from Zyxel web interface (CLI doesn't expose it)
async function fetchSerialFromWeb(
  ip: string,
  webPassword: string,
  log?: (level: LogLevel, message: string) => void
): Promise<string | null> {
  return new Promise((resolve) => {
    const auth = Buffer.from(`admin:${webPassword}`).toString('base64')

    const req = https.request({
      hostname: ip,
      port: 443,
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
          if (log) log('info', `Got serial from web: ${match[0]}`)
          resolve(match[0])
        } else {
          if (log) log('info', `Serial not found in web response`)
          resolve(null)
        }
      })
    })

    req.on('error', (err) => {
      if (log) log('warn', `Web serial fetch failed: ${err.message}`)
      resolve(null)
    })

    req.on('timeout', () => {
      if (log) log('warn', `Web serial fetch timeout`)
      req.destroy()
      resolve(null)
    })

    req.end()
  })
}

// Strip ANSI escape codes and other terminal control characters from Zyxel output
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
    // Remove the weird 7777... pattern (appears to be terminal init codes)
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
    const timer = setTimeout(() => {
      if (log) log('warn', `Shell timeout after ${timeout}ms`)
      reject(new Error('Shell command timeout'))
    }, timeout)

    // Request PTY with xterm emulation (similar to Go implementation)
    client.shell({ term: 'xterm', rows: 200, cols: 80 }, (err, stream: ClientChannel) => {
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

        // Waiting for initial prompt
        if (currentCommandIndex === -1) {
          if (buffer.includes('#')) {
            if (log) log('info', `Initial prompt detected`)
            sendNextCommand()
          }
          return
        }

        // Collecting output from current command
        currentOutput += chunk

        // Check if we got the prompt back (command finished)
        // Look for hostname# pattern at end of current output
        const lines = currentOutput.split('\n')
        const lastLine = lines[lines.length - 1] || ''
        if (/\w+#\s*/.test(lastLine)) {
          // Command complete - parse output
          // Remove first line (echoed command) and last line (prompt)
          const outputLines = currentOutput.split('\n')
          const resultLines = outputLines.slice(1, -1)
          const result = resultLines.map(l => l.replace(/\r/g, '')).join('\n')
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

// Get device info from Zyxel switches (GS1920 series, etc.)
async function getZyxelInfo(client: Client, log?: (level: LogLevel, message: string) => void): Promise<DeviceInfo> {
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
  const adminPasswordMatch = runningConfig.match(/admin-password\s+(\S+)/)
  const webPassword = adminPasswordMatch ? adminPasswordMatch[1] : null

  // Get device IP from SSH client connection
  const clientConfig = (client as any)._sock?._host || (client as any).config?.host
  const deviceIp = typeof clientConfig === 'string' ? clientConfig : null

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
  if (!serialNumber && webPassword && deviceIp) {
    if (log) log('info', `Serial not in CLI, trying web interface at ${deviceIp}`)
    serialNumber = await fetchSerialFromWeb(deviceIp, webPassword, log)
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

  if (log) {
    log('info', `Parsed: hostname=${hostname}, model=${model}, interfaces=${interfaces.length}, neighbors=${neighbors.length}`)
  }

  return {
    hostname,
    model,
    serialNumber,
    version,
    interfaces,
    neighbors,
    dhcpLeases: [],  // Zyxel switches typically don't run DHCP server
    ownUpstreamInterface: null,  // Would need different detection for Zyxel
  }
}

// Zyxel switch driver
export const zyxelDriver: Driver = {
  name: 'zyxel',
  getDeviceInfo: getZyxelInfo,
}
