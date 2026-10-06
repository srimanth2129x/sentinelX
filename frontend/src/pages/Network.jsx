import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Radio,
  Play,
  Square,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import {
  getNetworkInterfaces,
  getDiscoveredDevices,
  triggerDiscovery,
  streamDiscovery,
  startMonitoring,
  stopMonitoring,
  clearDiscoveredDevices,
} from '../api/client'
import { Card, SectionHeader, Spinner, StatusBadge, RiskBadge, EmptyState } from '../components/ui/Card'

const AUTH_STORAGE_KEY = 'sentinel_network_discovery_consent'

// Helper function to check if an IP belongs to an interface's subnet/network
function isIpInSubnet(deviceIp, iface) {
  if (!deviceIp || !iface || !iface.ip) return false
  if (deviceIp === iface.ip) return true

  const ifaceParts = iface.ip.split('.')
  const devParts = deviceIp.split('.')
  if (ifaceParts.length === 4 && devParts.length === 4) {
    if (ifaceParts[0] === devParts[0] && ifaceParts[1] === devParts[1] && ifaceParts[2] === devParts[2]) {
      return true
    }
  }

  const ifacePrefix = iface.ip.split('.').slice(0, 2).join('.')
  const devPrefix = deviceIp.split('.').slice(0, 2).join('.')
  return ifacePrefix === devPrefix
}

export function Network({ onDiscoveryChange }) {
  const [interfaces, setInterfaces] = useState([])
  const [selectedIface, setSelectedIface] = useState(null)
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [streamCount, setStreamCount] = useState(0)
  const [recentlyAddedId, setRecentlyAddedId] = useState(null)
  const [monitoring, setMonitoring] = useState(false)

  // Initialize authorization state from localStorage
  const [authorized, setAuthorized] = useState(() => {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
  })

  const handleAuthorize = () => {
    localStorage.setItem(AUTH_STORAGE_KEY, 'true')
    setAuthorized(true)
  }

  const handleRevokeAuthorization = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setAuthorized(false)
  }

  const fetchData = useCallback(async () => {
    try {
      const [ifaceRes, devRes] = await Promise.all([
        getNetworkInterfaces().catch(() => ({ data: [] })),
        getDiscoveredDevices().catch(() => ({ data: [] })),
      ])
      const ifaceList = Array.isArray(ifaceRes.data) ? ifaceRes.data : []
      const devList = Array.isArray(devRes.data) ? devRes.data : []

      setInterfaces(ifaceList)
      setDevices(devList)

      if (ifaceList.length > 0 && !selectedIface) {
        const preferred = ifaceList.find(
          (i) =>
            i?.ip &&
            !i.ip.startsWith('169.254.') &&
            !i.ip.startsWith('127.') &&
            (i?.name?.toLowerCase().includes('wi-fi') ||
              i?.name?.toLowerCase().includes('wireless') ||
              i?.name?.toLowerCase().includes('wlan') ||
              i?.ip.startsWith('192.168.') ||
              i?.ip.startsWith('10.'))
        ) || ifaceList.find(
          (i) => i?.ip && !i.ip.startsWith('169.254.') && !i.ip.startsWith('127.')
        )
        setSelectedIface(preferred || ifaceList[0])
      }
    } catch (err) {
      console.error('Failed to load network data:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedIface])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const notifyChange = () => {
    if (typeof onDiscoveryChange === 'function') {
      onDiscoveryChange()
    }
  }

  const filteredDevices = useMemo(() => {
    if (!selectedIface) return devices
    const matched = devices.filter((dev) => isIpInSubnet(dev.ip_address, selectedIface))
    return matched.length > 0 ? matched : devices
  }, [devices, selectedIface])

  const handleRunDiscovery = () => {
    if (!selectedIface) return
    setScanning(true)
    setStreamCount(0)

    streamDiscovery({
      interface_ip: selectedIface.ip,
      subnet: selectedIface.subnet || selectedIface.netmask,
      onDevice: (newDevice, count) => {
        setStreamCount(count)
        setRecentlyAddedId(newDevice.id || newDevice.ip_address)
        setDevices((prev) => {
          const existingIdx = prev.findIndex(
            (d) => d.id === newDevice.id || d.ip_address === newDevice.ip_address
          )
          if (existingIdx >= 0) {
            const updated = [...prev]
            updated[existingIdx] = { ...updated[existingIdx], ...newDevice }
            return updated
          }
          return [newDevice, ...prev]
        })
        notifyChange()
      },
      onComplete: async () => {
        setScanning(false)
        await fetchData()
        notifyChange()
        setTimeout(() => setRecentlyAddedId(null), 3000)
      },
      onError: async (err) => {
        console.warn('Streaming discovery fallback to batch sweep:', err)
        try {
          await triggerDiscovery({
            interface: selectedIface.name,
            interface_name: selectedIface.name,
            interface_ip: selectedIface.ip,
          })
          await fetchData()
          notifyChange()
        } catch (fallbackErr) {
          console.error('Batch discovery error:', fallbackErr)
        } finally {
          setScanning(false)
        }
      },
    })
  }

  const handleStartMonitoring = async () => {
    if (!selectedIface) return
    try {
      await startMonitoring({
        interface: selectedIface.name,
        interface_name: selectedIface.name,
        interval: 30,
      })
      setMonitoring(true)
      notifyChange()
    } catch (err) {
      console.error('Start monitoring error:', err)
    }
  }

  const handleStopMonitoring = async () => {
    try {
      await stopMonitoring()
      setMonitoring(false)
      notifyChange()
    } catch (err) {
      console.error('Stop monitoring error:', err)
    }
  }

  const handleClearDevices = async () => {
    if (!window.confirm('Clear all discovered network devices from the active views?')) return
    try {
      await clearDiscoveredDevices()
      setMonitoring(false)
      await fetchData()
      notifyChange()
    } catch (err) {
      console.error('Clear devices error:', err)
    }
  }

  const formatLastSeen = (ts) => {
    if (!ts) return '—'
    try {
      const d = new Date(ts)
      return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleTimeString()
    } catch {
      return String(ts)
    }
  }

  if (loading) return <Spinner message="Querying network topology & interfaces..." />

  return (
    <div className="space-y-6">
      {/* Authorization Banner */}
      {!authorized ? (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-xl flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-mono font-bold text-amber-900 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              NETWORK MONITORING CONSENT REQUIRED
            </div>
            <div className="text-[11px] font-mono text-amber-800 dark:text-slate-400">
              Confirm you are authorized to discover and model endpoints across this local subnet.
            </div>
          </div>
          <button
            onClick={handleAuthorize}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs font-mono transition shadow cursor-pointer"
          >
            I CONFIRM — I am authorized to monitor this network
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-mono text-slate-600 dark:text-slate-400 shadow-sm">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            Network Discovery Permission: <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Authorized</span>
          </span>
          <button
            onClick={handleRevokeAuthorization}
            className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition underline text-[10px] cursor-pointer"
          >
            Revoke Permission
          </button>
        </div>
      )}

      {/* Network Status & Interface Selection */}
      <Card>
        <SectionHeader
          title="Network Adapters & Topology Gateways"
          subtitle="Select an active network interface card (NIC) to inspect or sweep"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
          {interfaces.map((iface, idx) => {
            const isSelected = selectedIface?.name === iface.name
            const statusDisplay = iface.status || (iface.is_up ? 'up' : 'active')
            const countForCard = devices.filter((dev) => isIpInSubnet(dev.ip_address, iface)).length

            return (
              <div
                key={iface.name || `iface-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedIface(iface)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    setSelectedIface(iface)
                  }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800/80 shadow-sm ring-1 ring-slate-900 dark:ring-white'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">{iface.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                      {countForCard} hosts
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold uppercase">
                      {statusDisplay}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                  <div>
                    IP Address: <span className="text-slate-800 dark:text-slate-200 font-semibold">{iface.ip || '—'}</span>
                  </div>
                  <div>
                    Netmask: <span className="text-slate-700 dark:text-slate-300">{iface.subnet || iface.netmask || '255.255.255.0'}</span>
                  </div>
                  <div>
                    Gateway: <span className="text-slate-700 dark:text-slate-300">{iface.gateway || '—'}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Discovery Action Bar */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Selected Adapter: <span className="text-slate-900 dark:text-slate-100 font-bold">{selectedIface?.name || 'None'}</span> ·{' '}
            Showing: <span className="text-slate-900 dark:text-slate-100 font-bold">{filteredDevices.length}</span> devices (
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {filteredDevices.filter((d) => (d.status || '').toLowerCase() === 'online').length}
            </span>{' '}
            online)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunDiscovery}
              disabled={!authorized || scanning}
              className="px-3.5 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-40 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer font-semibold shadow-sm"
            >
              <Radio className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              {scanning
                ? streamCount > 0
                  ? `Streaming (${streamCount} found)...`
                  : 'Scanning Subnet...'
                : 'Run Discovery'}
            </button>

            {!monitoring ? (
              <button
                onClick={handleStartMonitoring}
                disabled={!authorized}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer font-medium"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Monitoring
              </button>
            ) : (
              <button
                onClick={handleStopMonitoring}
                className="px-3.5 py-1.5 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer font-medium"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop Monitoring
              </button>
            )}

            <button
              onClick={handleClearDevices}
              className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-300 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-800 text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg text-xs font-mono transition cursor-pointer"
              title="Clear Discovered Devices"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Card>

      {/* Discovered Devices Table */}
      <Card>
        <SectionHeader title={`Discovered Endpoints — ${selectedIface?.name || 'ACTIVE ADAPTER'} (${filteredDevices.length})`} />
        {filteredDevices.length === 0 ? (
          <EmptyState message={`No devices discovered on ${selectedIface?.name || 'this interface'}. Click 'Run Discovery' to sweep.`} />
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">IP Address</th>
                  <th className="py-2.5 px-3">Hostname</th>
                  <th className="py-2.5 px-3">MAC Address</th>
                  <th className="py-2.5 px-3">Vendor</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Sensor</th>
                  <th className="py-2.5 px-3">Trust Level</th>
                  <th className="py-2.5 px-3">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredDevices.map((device, idx) => {
                  const isRecentlyAdded = recentlyAddedId === (device.id || device.ip_address)
                  return (
                    <tr
                      key={device.id || device.ip_address || `device-${idx}`}
                      className={`transition-colors duration-500 hover:bg-slate-50 dark:hover:bg-slate-800/30 ${
                        isRecentlyAdded ? 'bg-emerald-500/10 dark:bg-emerald-950/40 ring-1 ring-inset ring-emerald-400' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-semibold">{device.ip_address || '—'}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{device.hostname || 'Unknown'}</td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">{device.mac_address || 'Unknown'}</td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 truncate max-w-[140px]">{device.vendor || 'Unknown'}</td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{device.device_type || 'Unknown'}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={device.status || 'Offline'} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {device.sensor_connected ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Connected</span>
                        ) : (
                          <span>✗ None</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <RiskBadge level={device.trust_level || device.risk_level || 'ADAPTIVE'} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {formatLastSeen(device.last_seen || device.first_seen)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default Network