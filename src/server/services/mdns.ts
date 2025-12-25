import mdns from 'multicast-dns'

export interface MdnsDevice {
  ip: string
  hostname: string
  services: string[]
}

/**
 * Scan for mDNS/Bonjour devices on the network
 * Returns a map of IP -> hostname/services
 */
export async function scanMdns(timeoutMs: number = 5000): Promise<Map<string, MdnsDevice>> {
  const devices = new Map<string, MdnsDevice>()
  const hostnames = new Map<string, string>() // hostname.local -> IP

  return new Promise((resolve) => {
    const browser = mdns()

    // Track pending hostname resolutions
    const pendingHostnames = new Set<string>()

    browser.on('response', (response) => {
      // Process answers
      for (const answer of response.answers) {
        // A record: hostname -> IP
        if (answer.type === 'A' && answer.name && answer.data) {
          const hostname = answer.name.replace(/\.local\.?$/, '')
          const ip = answer.data as string
          hostnames.set(answer.name, ip)

          if (!devices.has(ip)) {
            devices.set(ip, { ip, hostname, services: [] })
          } else {
            devices.get(ip)!.hostname = hostname
          }
        }

        // PTR record: service discovery
        if (answer.type === 'PTR' && answer.data) {
          const serviceName = answer.data as string
          // Extract service type from the query name (e.g., _http._tcp.local)
          const serviceType = answer.name?.match(/_([^.]+)\._tcp/)?.[1] || ''

          // Look for the corresponding SRV record in additionals
          for (const additional of response.additionals || []) {
            if (additional.type === 'SRV' && additional.name === serviceName) {
              const target = (additional.data as any)?.target
              if (target) {
                pendingHostnames.add(target)
                // Query for A record of this host
                browser.query({ questions: [{ name: target, type: 'A' }] })
              }
            }

            // A record in additionals
            if (additional.type === 'A' && additional.data) {
              const hostname = additional.name?.replace(/\.local\.?$/, '') || ''
              const ip = additional.data as string
              hostnames.set(additional.name || '', ip)

              if (!devices.has(ip)) {
                devices.set(ip, { ip, hostname, services: serviceType ? [serviceType] : [] })
              } else {
                const device = devices.get(ip)!
                if (!device.hostname) device.hostname = hostname
                if (serviceType && !device.services.includes(serviceType)) {
                  device.services.push(serviceType)
                }
              }
            }
          }
        }

        // SRV record: points to hostname
        if (answer.type === 'SRV' && answer.data) {
          const target = (answer.data as any)?.target
          if (target && !hostnames.has(target)) {
            pendingHostnames.add(target)
            browser.query({ questions: [{ name: target, type: 'A' }] })
          }
        }
      }
    })

    browser.on('error', (err) => {
      console.error('mDNS error:', err)
    })

    // Query for common services
    const serviceQueries = [
      '_http._tcp.local',      // Web servers
      '_https._tcp.local',     // HTTPS servers
      '_printer._tcp.local',   // Printers
      '_ipp._tcp.local',       // Internet Printing Protocol
      '_ipps._tcp.local',      // IPP Secure
      '_pdl-datastream._tcp.local', // Printer data stream
      '_scanner._tcp.local',   // Scanners
      '_smb._tcp.local',       // Windows shares
      '_afpovertcp._tcp.local', // Apple File Protocol
      '_ssh._tcp.local',       // SSH servers
      '_workstation._tcp.local', // Workstations
      '_device-info._tcp.local', // Device info
    ]

    // Send queries
    browser.query({
      questions: serviceQueries.map(name => ({ name, type: 'PTR' }))
    })

    // Also query for all services
    browser.query({
      questions: [{ name: '_services._dns-sd._udp.local', type: 'PTR' }]
    })

    // Resolve after timeout
    setTimeout(() => {
      browser.destroy()
      resolve(devices)
    }, timeoutMs)
  })
}

/**
 * Query mDNS for a specific IP's hostname (reverse lookup)
 */
export async function mdnsReverseLookup(ip: string, timeoutMs: number = 2000): Promise<string | null> {
  return new Promise((resolve) => {
    const browser = mdns()
    let resolved = false

    browser.on('response', (response) => {
      if (resolved) return

      for (const answer of response.answers) {
        if (answer.type === 'A' && answer.data === ip) {
          resolved = true
          browser.destroy()
          resolve(answer.name?.replace(/\.local\.?$/, '') || null)
          return
        }
      }
    })

    // Construct reverse lookup name
    const parts = ip.split('.').reverse()
    const ptrName = `${parts.join('.')}.in-addr.arpa`

    browser.query({
      questions: [{ name: ptrName, type: 'PTR' }]
    })

    setTimeout(() => {
      if (!resolved) {
        browser.destroy()
        resolve(null)
      }
    }, timeoutMs)
  })
}
