import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, type Network, type Device } from '../lib/api'
import {
  ArrowLeft,
  Play,
  Loader2,
  FileDown,
} from 'lucide-react'

export function NetworkTopology() {
  const { networkId } = useParams<{ networkId: string }>()
  const navigate = useNavigate()
  const [network, setNetwork] = useState<Network | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (networkId) {
      loadNetworkData()
    }
  }, [networkId])

  async function loadNetworkData() {
    try {
      const [networkData, devicesData] = await Promise.all([
        api.networks.get(networkId!),
        api.devices.list(networkId!),
      ])
      setNetwork(networkData)
      setDevices(devicesData)
    } catch (err) {
      console.error('Failed to load network:', err)
    } finally {
      setLoading(false)
    }
  }

  async function startScan() {
    setScanning(true)
    // TODO: Implement WebSocket scan
    // For now, just simulate with a timeout
    setTimeout(() => {
      setScanning(false)
      loadNetworkData()
    }, 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (!network) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600 dark:text-slate-400">Network not found</p>
        <button
          onClick={() => navigate('/networks')}
          className="mt-4 text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          Back to Networks
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/networks')}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {network.name}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-mono">
              {network.rootIp}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {/* TODO: Export PDF */}}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={startScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Scan
              </>
            )}
          </button>
        </div>
      </div>

      {/* Topology View */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 min-h-[600px] p-6">
        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[500px] text-center">
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              No devices discovered yet.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500">
              Click "Start Scan" to discover network topology.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* TODO: Implement topology tree visualization */}
            <p className="text-slate-600 dark:text-slate-400">
              {devices.length} devices discovered
            </p>
            <div className="grid gap-3">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {device.hostname || device.mac}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                        {device.ip || 'No IP'}
                      </p>
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {device.type || 'Unknown'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
