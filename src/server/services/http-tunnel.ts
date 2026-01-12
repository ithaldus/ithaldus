/**
 * HTTP tunneling through SSH jump host
 *
 * Uses SSH forwardOut() to create TCP tunnels for HTTP/HTTPS requests
 * when direct connectivity is not available (L3-only via VPN).
 */

import type { Client } from 'ssh2'
import * as tls from 'tls'

export interface HttpTunnelResponse {
  status: number
  headers: Record<string, string>
  data: string
}

export interface HttpTunnelOptions {
  path: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
  https?: boolean
}

/**
 * Make an HTTP request through an SSH tunnel
 *
 * @param jumpHost - SSH client connection to use as tunnel
 * @param targetIp - Target device IP address
 * @param port - Target port (80 for HTTP, 443 for HTTPS)
 * @param options - Request options
 */
export async function httpFetchViaJumpHost(
  jumpHost: Client,
  targetIp: string,
  port: number,
  options: HttpTunnelOptions
): Promise<HttpTunnelResponse> {
  const { path, method = 'GET', headers = {}, body, timeout = 10000, https: useHttps = false } = options

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`HTTP tunnel timeout after ${timeout}ms`))
    }, timeout)

    // Create TCP tunnel from jump host to target
    jumpHost.forwardOut(
      '127.0.0.1',  // srcIP - local bind address on jump host
      0,            // srcPort - any available port
      targetIp,     // dstIP - target device IP
      port,         // dstPort - target HTTP/HTTPS port
      (err, stream) => {
        if (err) {
          clearTimeout(timer)
          reject(new Error(`Failed to create tunnel: ${err.message}`))
          return
        }

        // For HTTPS, wrap the stream in TLS
        const socket = useHttps
          ? tls.connect({ socket: stream as any, rejectUnauthorized: false })
          : stream

        let responseData = ''
        let headersParsed = false
        let responseHeaders: Record<string, string> = {}
        let statusCode = 0
        let headerBuffer = ''

        // Build HTTP request
        const hostHeader = port === 80 || port === 443 ? targetIp : `${targetIp}:${port}`
        const requestHeaders = {
          'Host': hostHeader,
          'Connection': 'close',
          ...headers,
        }

        const headerLines = Object.entries(requestHeaders)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n')

        const request = `${method} ${path} HTTP/1.1\r\n${headerLines}\r\n\r\n${body || ''}`

        socket.on('data', (chunk: Buffer) => {
          const data = chunk.toString()

          if (!headersParsed) {
            headerBuffer += data
            const headerEnd = headerBuffer.indexOf('\r\n\r\n')

            if (headerEnd !== -1) {
              headersParsed = true
              const headerSection = headerBuffer.substring(0, headerEnd)
              responseData = headerBuffer.substring(headerEnd + 4)

              // Parse status line
              const lines = headerSection.split('\r\n')
              const statusLine = lines[0]
              const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/)
              statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0

              // Parse headers
              for (let i = 1; i < lines.length; i++) {
                const colonIndex = lines[i].indexOf(':')
                if (colonIndex > 0) {
                  const key = lines[i].substring(0, colonIndex).trim().toLowerCase()
                  const value = lines[i].substring(colonIndex + 1).trim()
                  responseHeaders[key] = value
                }
              }
            }
          } else {
            responseData += data
          }
        })

        socket.on('end', () => {
          clearTimeout(timer)
          stream.close()
          resolve({
            status: statusCode,
            headers: responseHeaders,
            data: responseData,
          })
        })

        socket.on('error', (err: Error) => {
          clearTimeout(timer)
          stream.close()
          reject(new Error(`HTTP tunnel error: ${err.message}`))
        })

        // Send the request
        socket.write(request)
      }
    )
  })
}

/**
 * Simple fetch-like interface for tunneled HTTP requests
 */
export async function tunnelFetch(
  jumpHost: Client,
  url: string,
  options: Omit<HttpTunnelOptions, 'path' | 'https'> = {}
): Promise<HttpTunnelResponse> {
  const urlObj = new URL(url)
  const isHttps = urlObj.protocol === 'https:'
  const port = urlObj.port ? parseInt(urlObj.port, 10) : (isHttps ? 443 : 80)
  const path = urlObj.pathname + urlObj.search

  return httpFetchViaJumpHost(jumpHost, urlObj.hostname, port, {
    ...options,
    path,
    https: isHttps,
  })
}
