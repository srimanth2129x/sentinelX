import React, { useEffect, useState, useCallback } from 'react'
import {
  Laptop,
  Search,
  RefreshCw,
  Wifi,
  Smartphone,
  Server,
  ArrowUpDown,
  Share2,
} from 'lucide-react'
import { getDevices, authorizeDevice, revokeDevice } from '../api/client'
import { Card, SectionHeader, Spinner, EmptyState } from '../components/ui/Card'
import { RiskBadge, SensorBadge, CategoryBadge, AuthBadge, TransportBadge } from '../components/ui/Badge'

export function Devices({ onNav }) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [sensorFilter, setSensorFilter] = useState('ALL')
  const [sortField, setSortField] = useState('risk_score')
  const [sortOrder, setSortOrder] = useState('desc')

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getDevices()
      const rawList = Array.isArray(res.data) ? res.data : []
      const sanitized = rawList.map((d) => ({
        ...d,
        hostname: (d.hostname || '').replace(/^Node-/i, 'Workstation-'),
      }))
      setDevices(sanitized)
    } catch (err) {
      console.error('Failed to load devices inventory:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleAuthorize = async (deviceId) => {
    try {
      await authorizeDevice(deviceId)
      await loadDevices()
    } catch (err) {
      console.error('Failed to authorize device:', err)
    }
  }

  const handleRevoke = async (deviceId) => {
    try {
      await revokeDevice(deviceId)
      await loadDevices()
    } catch (err) {
      console.error('Failed to revoke device:', err)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const getDeviceIcon = (type) => {
    const t = String(type || '').toLowerCase()
    if (t.includes('router') || t.includes('gateway')) return <Wifi className="w-4 h-4 text-emerald-500" />
    if (t.includes('mobile') || t.includes('phone')) return <Smartphone className="w-4 h-4 text-slate-500 dark:text-slate-400" />
    if (t.includes('server')) return <Server className="w-4 h-4 text-slate-700 dark:text-slate-300" />
    return <Laptop className="w-4 h-4 text-slate-700 dark:text-slate-300" />
  }

  const filteredDevices = devices
    .filter((d) => {
      // Type filter
      if (typeFilter !== 'ALL') {
        const dt = String(d.device_type || '').toUpperCase()
        if (!dt.includes(typeFilter.toUpperCase())) return false
      }

      // Sensor filter
      if (sensorFilter !== 'ALL') {
        const isConnected = Boolean(d.sensor_connected)
        if (sensorFilter === 'CONNECTED' && !isConnected) return false
        if (sensorFilter === 'UNMONITORED' && isConnected) return false
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchHost = (d.hostname || '').toLowerCase().includes(q)
        const matchIp = (d.ip_address || '').toLowerCase().includes(q)
        const matchMac = (d.mac_address || '').toLowerCase().includes(q)
        const matchVendor = (d.vendor || '').toLowerCase().includes(q)
        const matchType = (d.device_type || '').toLowerCase().includes(q)
        return matchHost || matchIp || matchMac || matchVendor || matchType
      }

      return true
    })
    .sort((a, b) => {
      let aVal = a[sortField] ?? 0
      let bVal = b[sortField] ?? 0
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

  if (loading && devices.length === 0) {
    return <Spinner message="Loading monitored asset inventory..." />
  }

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-surface-base p-4 border border-slate-200/90 dark:border-border-base rounded shadow-xs theme-transition">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Endpoint Asset Inventory & Authorization
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold">
                {devices.length} MONITORED ASSETS
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              Continuous ARP discovery, hardware fingerprinting, transport mode, and trust gating
            </p>
          </div>
        </div>

        <button
          onClick={loadDevices}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Inventory
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative min-w-[260px] flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search hostname, IP, MAC address, vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-slate-500"
            />
          </div>

          {/* Device Type Filter */}
          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-500"
            >
              <option value="ALL">All Categories</option>
              <option value="ROUTER">Routers / Gateways</option>
              <option value="LAPTOP">Laptops / PCs</option>
              <option value="MOBILE">Mobile Devices</option>
              <option value="SERVER">Servers</option>
            </select>

            {/* Sensor Status Filter */}
            <select
              value={sensorFilter}
              onChange={(e) => setSensorFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-500"
            >
              <option value="ALL">All Sensors</option>
              <option value="CONNECTED">Sensor Active</option>
              <option value="UNMONITORED">Unmonitored</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Assets Table */}
      <Card>
        <SectionHeader
          title={`Monitored Endpoints (${filteredDevices.length})`}
          subtitle="Real-time devices discovered and tracked on the local network"
        />

        {filteredDevices.length === 0 ? (
          <EmptyState
            icon={<Laptop className="w-6 h-6 text-slate-400" />}
            title="No Assets Found"
            message={
              searchQuery
                ? 'No devices matched your search criteria.'
                : 'No network assets discovered. Visit the Network tab and click Run Discovery to sweep.'
            }
          />
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                  <th
                    tabIndex={0}
                    onClick={() => handleSort('hostname')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSort('hostname')
                      }
                    }}
                    className="py-2.5 px-3 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <div className="flex items-center gap-1">
                      Endpoint <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    tabIndex={0}
                    onClick={() => handleSort('ip_address')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSort('ip_address')
                      }
                    }}
                    className="py-2.5 px-3 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <div className="flex items-center gap-1">
                      IP Address <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">MAC / Vendor</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Authorization</th>
                  <th className="py-2.5 px-3">Transport</th>
                  <th className="py-2.5 px-3">Sensor</th>
                  <th
                    tabIndex={0}
                    onClick={() => handleSort('risk_score')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSort('risk_score')
                      }
                    }}
                    className="py-2.5 px-3 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <div className="flex items-center gap-1">
                      Risk Level <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Last Seen</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredDevices.map((dev) => (
                  <tr key={dev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    {/* Hostname */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {getDeviceIcon(dev.device_type)}
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {dev.hostname || 'Connected Device'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 pl-6">{dev.os || 'Windows'}</div>
                    </td>

                    {/* IP */}
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-semibold">{dev.ip_address}</td>

                    {/* MAC / Vendor */}
                    <td className="py-2.5 px-3">
                      <div className="text-slate-800 dark:text-slate-200">{dev.mac_address || '—'}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                        {dev.vendor || 'Hardware Endpoint'}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-2.5 px-3">
                      <CategoryBadge type={dev.device_type} />
                    </td>

                    {/* Authorization Status */}
                    <td className="py-2.5 px-3">
                      <AuthBadge status={dev.auth_status} />
                    </td>

                    {/* Transport Mode */}
                    <td className="py-2.5 px-3">
                      <TransportBadge mode={dev.transport_mode} />
                    </td>

                    {/* Sensor */}
                    <td className="py-2.5 px-3">
                      <SensorBadge connected={dev.sensor_connected} />
                    </td>

                    {/* Risk Score */}
                    <td className="py-2.5 px-3">
                      <RiskBadge
                        level={dev.risk_level || 'ADAPTIVE'}
                        score={dev.risk_score}
                      />
                    </td>

                    {/* Last Seen */}
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {dev.last_seen ? new Date(dev.last_seen).toLocaleTimeString() : 'Recent'}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {dev.auth_status === 'PENDING' && (
                          <button
                            onClick={() => handleAuthorize(dev.id)}
                            className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded text-[10px] font-mono transition cursor-pointer"
                            title="Authorize Device Telemetry"
                          >
                            Authorize
                          </button>
                        )}
                        {dev.auth_status === 'AUTHORIZED' && (
                          <button
                            onClick={() => handleRevoke(dev.id)}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-950/60 border border-slate-300 dark:border-slate-700 hover:border-red-300 dark:hover:border-red-800 text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-300 rounded text-[10px] font-mono transition cursor-pointer"
                            title="Revoke Device Access"
                          >
                            Revoke
                          </button>
                        )}
                        {dev.auth_status === 'REVOKED' && (
                          <button
                            onClick={() => handleAuthorize(dev.id)}
                            className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded text-[10px] font-mono transition cursor-pointer"
                            title="Re-Authorize Device Access"
                          >
                            Re-Authorize
                          </button>
                        )}
                        {typeof onNav === 'function' && (
                          <button
                            onClick={() => onNav('cybertwin')}
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded text-[10px] font-mono inline-flex items-center gap-1 transition cursor-pointer"
                            title="Inspect in Digital Twin Graph"
                          >
                            <Share2 className="w-3 h-3" />
                            Twin
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default Devices
