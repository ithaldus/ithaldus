import type { ServerWebSocket } from 'bun'
import type { LogMessage, TopologyResponse } from './types'

interface WebSocketData {
  networkId: string
  type: 'scan'
}

export type ScanWebSocket = ServerWebSocket<WebSocketData>

// Store active WebSocket connections per network
const scanConnections = new Map<string, Set<ScanWebSocket>>()

export interface ChannelInfo {
  id: string
  ip: string
  action: string  // e.g., "scanning ports", "testing credentials", "fetching device info"
}

export interface ScanUpdate {
  type: 'log' | 'topology' | 'status' | 'channels'
  data: LogMessage | TopologyResponse | { status: string; error?: string } | ChannelInfo[]
}

export const wsManager = {
  // Add a connection for a network
  addConnection(networkId: string, ws: ScanWebSocket) {
    if (!scanConnections.has(networkId)) {
      scanConnections.set(networkId, new Set())
    }
    scanConnections.get(networkId)!.add(ws)
    console.log(`[WS] Client connected to network ${networkId} (${scanConnections.get(networkId)!.size} total)`)
  },

  // Remove a connection
  removeConnection(networkId: string, ws: ScanWebSocket) {
    const connections = scanConnections.get(networkId)
    if (connections) {
      connections.delete(ws)
      console.log(`[WS] Client disconnected from network ${networkId} (${connections.size} remaining)`)
      if (connections.size === 0) {
        scanConnections.delete(networkId)
      }
    }
  },

  // Broadcast an update to all connections for a network
  broadcast(networkId: string, update: ScanUpdate) {
    const connections = scanConnections.get(networkId)
    if (!connections || connections.size === 0) return

    const message = JSON.stringify(update)
    for (const ws of connections) {
      try {
        ws.send(message)
      } catch (err) {
        console.error('[WS] Failed to send message:', err)
      }
    }
  },

  // Broadcast a log message
  broadcastLog(networkId: string, log: LogMessage) {
    console.log(`[WS] Broadcasting log to ${networkId}: ${log.message}`)
    this.broadcast(networkId, { type: 'log', data: log })
  },

  // Broadcast full topology update
  broadcastTopology(networkId: string, topology: TopologyResponse) {
    this.broadcast(networkId, { type: 'topology', data: topology })
  },

  // Broadcast status change
  broadcastStatus(networkId: string, status: string, error?: string) {
    this.broadcast(networkId, { type: 'status', data: { status, error } })
  },

  // Broadcast active channels
  broadcastChannels(networkId: string, channels: ChannelInfo[]) {
    this.broadcast(networkId, { type: 'channels', data: channels })
  },

  // Get connection count for a network
  getConnectionCount(networkId: string): number {
    return scanConnections.get(networkId)?.size || 0
  },
}
