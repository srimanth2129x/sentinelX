import React, { useState, useEffect, useCallback } from 'react'
import {
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  Server,
  Laptop,
  Wifi,
  Smartphone,
  Share2,
} from 'lucide-react'
import { Card, SectionHeader, Spinner, EmptyState } from '../components/ui/Card'
import { RiskBadge, SensorBadge } from '../components/ui/Badge'
import { getTopology, runSimulation } from '../api/client'

export function CyberTwin() {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [simSource, setSimSource] = useState('')
  const [simResults, setSimResults] = useState(null)
  const [simulating, setSimulating] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [activeTab, setActiveTab] = useState('topology') // 'topology' | 'attackpath' | 'simulation'

  const fetchTopologyData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getTopology()
      const data = res.data || {}

      const rawNodes = Array.isArray(data.nodes) ? data.nodes : []
      const rawEdges = Array.isArray(data.edges) ? data.edges : []

      const safeNodes = rawNodes.map((n) => {
        const d = n.data || n
        const rawHost = d.hostname || n.hostname || 'Workstation-Node'
        const cleanHost = rawHost.replace(/^Node-/i, 'Workstation-')
        return {
          ...d,
          ...n,
          id: d.id || n.id,
          hostname: cleanHost,
          ip_address: d.ip_address || d.ip || n.ip_address || n.ip || '0.0.0.0',
          device_type: d.device_type || d.type || n.device_type || 'Workstation',
          vendor: d.vendor || n.vendor || 'Hardware Endpoint',
          mac_address: d.mac_address || n.mac_address || '—',
          status: d.status || n.status || 'Online',
          risk_score: d.risk_score ?? n.risk_score ?? 0,
          risk_level: d.risk_level || n.risk_level || 'ADAPTIVE',
          sensor_connected: Boolean(d.sensor_connected ?? n.sensor_connected),
        }
      })

      const safeEdges = rawEdges.map((e, idx) => {
        const d = e.data || e
        return {
          id: d.id || e.id || `edge-${idx}`,
          source: d.source || e.source,
          target: d.target || e.target,
          relationship: d.relationship || d.relationship_type || 'network_reachability',
        }
      })

      setNodes(safeNodes)
      setEdges(safeEdges)

      if (safeNodes.length > 0 && !selectedNode) {
        setSelectedNode(safeNodes[0])
        setSimSource(safeNodes[0].id || '')
      }
    } catch (err) {
      console.error('Failed to load topology:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedNode])

  useEffect(() => {
    fetchTopologyData()
  }, [fetchTopologyData])

  const handleSimulate = async () => {
    if (!simSource) return
    try {
      setSimulating(true)
      const res = await runSimulation({ source_device: simSource })
      setSimResults(res.data || null)
    } catch (err) {
      console.error('Simulation execution failed:', err)
    } finally {
      setSimulating(false)
    }
  }

  const handleResetSimulation = () => {
    setSimResults(null)
  }

  const getDeviceIcon = (type) => {
    const t = String(type || '').toLowerCase()
    if (t.includes('router') || t.includes('gateway')) return <Wifi className="w-4 h-4 text-emerald-500" />
    if (t.includes('mobile') || t.includes('phone')) return <Smartphone className="w-4 h-4 text-slate-500 dark:text-slate-400" />
    if (t.includes('server')) return <Server className="w-4 h-4 text-slate-700 dark:text-slate-300" />
    return <Laptop className="w-4 h-4 text-slate-700 dark:text-slate-300" />
  }

  if (loading && nodes.length === 0) {
    return <Spinner message="Assembling Digital Twin NetworkX Model..." />
  }

  // Find Gateway & Connected Nodes
  const gatewayNode = nodes.find((n) => {
    const t = (n.device_type || '').toLowerCase()
    const h = (n.hostname || '').toLowerCase()
    return t.includes('router') || t.includes('gateway') || h.includes('gateway') || h.includes('router')
  }) || nodes[0]

  const endpointNodes = nodes.filter((n) => n.id !== gatewayNode?.id)
  const compromisedPath = simResults?.worst_path || []

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-surface-base p-4 border border-slate-200/90 dark:border-border-base rounded shadow-xs theme-transition">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Network Digital Twin & Attack Reachability
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-400 font-semibold">
                NETWORKX GRAPH ENGINE
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              Live device relationships: USER │ DEVICE │ PROCESS │ NETWORK │ DESTINATION
            </p>
          </div>
        </div>

        {/* View Mode Switcher + Zoom Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono">
            <button
              onClick={() => setActiveTab('topology')}
              className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                activeTab === 'topology'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Topology Graph
            </button>
            <button
              onClick={() => setActiveTab('attackpath')}
              className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                activeTab === 'attackpath'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Attack Paths
            </button>
            <button
              onClick={() => setActiveTab('simulation')}
              className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                activeTab === 'simulation'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Simulations
            </button>
          </div>

          <button
            onClick={() => setZoom((z) => Math.min(z + 0.1, 1.4))}
            className="p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.1, 0.7))}
            className="p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            title="Reset Canvas"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Main Grid: Graph Canvas + Telemetry Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Graph & Path Canvas */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="min-h-[520px] relative overflow-hidden bg-slate-50/60 dark:bg-surface-elevated/40 border-slate-200/90 dark:border-border-base flex flex-col justify-between p-5">
            <SectionHeader
              title={
                activeTab === 'topology'
                  ? 'Active Digital Twin Topology Model'
                  : activeTab === 'attackpath'
                  ? 'Lateral Movement Attack Propagation Vectors'
                  : 'Blast-Radius Simulation Workbench'
              }
              subtitle="Interactive star-topology modeling with multi-hop reachability"
              action={
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                  {nodes.length} Assets · {edges.length || (nodes.length > 0 ? nodes.length - 1 : 0)} Links
                </span>
              }
            />

            {nodes.length === 0 ? (
              <EmptyState
                icon={<Share2 className="w-6 h-6 text-slate-400" />}
                title="No Network Nodes Discovered"
                message="Run network discovery in the Network tab to populate the digital twin graph."
              />
            ) : (
              <div
                className="relative py-6 px-4 transition-transform duration-200 flex-1 flex flex-col justify-center items-center select-none"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              >
                {/* Visual Gateway Center Node */}
                {gatewayNode && (
                  <div className="flex flex-col items-center mb-8 relative">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedNode(gatewayNode)
                        setSimSource(gatewayNode.id)
                        setDrawerOpen(true)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedNode(gatewayNode)
                          setSimSource(gatewayNode.id)
                          setDrawerOpen(true)
                        }
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 min-w-[210px] text-center shadow-sm ${
                        selectedNode?.id === gatewayNode.id
                          ? 'bg-slate-100 dark:bg-slate-800 border-slate-900 dark:border-white ring-2 ring-slate-800 dark:ring-white shadow-md'
                          : compromisedPath.includes(gatewayNode.id)
                          ? 'bg-red-50 dark:bg-red-950/70 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse'
                          : 'bg-white dark:bg-[#121824] border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Wifi className="w-4 h-4 text-emerald-500" />
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 uppercase">
                          GATEWAY HUB
                        </span>
                      </div>
                      <div className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {gatewayNode.hostname}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {gatewayNode.ip_address}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        Criticality Weight: {gatewayNode.criticality || 4}x
                      </div>
                    </div>

                    {/* Central Vertical Connector Line */}
                    <div className="w-0.5 h-8 bg-gradient-to-b from-emerald-500 to-slate-400 dark:to-slate-600 mt-1" />
                  </div>
                )}

                {/* Subnet Endpoints Row */}
                <div className="flex flex-wrap items-center justify-center gap-6 w-full pt-2">
                  {endpointNodes.map((node) => {
                    const isSelected = selectedNode?.id === node.id
                    const isSimOrigin = simSource === node.id
                    const isPathCompromised = compromisedPath.includes(node.id)

                    return (
                      <div
                        key={node.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedNode(node)
                          setSimSource(node.id)
                          setDrawerOpen(true)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedNode(node)
                            setSimSource(node.id)
                            setDrawerOpen(true)
                          }
                        }}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-200 min-w-[180px] max-w-[220px] flex-1 text-left shadow-sm ${
                          isSelected
                            ? 'bg-slate-100 dark:bg-slate-800 border-slate-900 dark:border-white ring-2 ring-slate-800 dark:ring-white shadow-md'
                            : isPathCompromised
                            ? 'bg-red-50 dark:bg-red-950/70 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse'
                            : 'bg-white dark:bg-[#121824] border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          {getDeviceIcon(node.device_type)}
                          <RiskBadge level={node.risk_level || 'ADAPTIVE'} />
                        </div>

                        <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                          {node.hostname}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {node.ip_address}
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-500 dark:text-slate-400 truncate">{node.device_type}</span>
                          {isSimOrigin && (
                            <span className="text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wide bg-amber-50 dark:bg-amber-950/60 px-1 py-0.2 rounded border border-amber-300 dark:border-amber-800 text-[9px]">
                              [PATIENT ZERO]
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Simulation Results Banner */}
            {simResults && (
              <div className="border-t border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 p-4 rounded-xl space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <h4 className="text-xs font-mono font-bold text-red-800 dark:text-red-300 uppercase tracking-wider">
                      Lateral Movement Blast-Radius Findings
                    </h4>
                  </div>
                  <button
                    onClick={handleResetSimulation}
                    className="text-xs font-mono text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Clear
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="bg-white dark:bg-slate-950/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Reachability</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold">
                      {simResults.reachable_count ?? simResults.target_devices?.length ?? 0} Assets
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-950/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Max Depth</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold">{simResults.max_depth ?? simResults.hop_count ?? 1} Hops</span>
                  </div>
                  <div className="bg-white dark:bg-slate-950/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Critical Assets</span>
                    <span className="text-amber-700 dark:text-amber-400 font-bold">
                      {simResults.critical_assets?.length ?? 0} At Risk
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-950/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Estimated Impact</span>
                    <span className="text-red-700 dark:text-red-400 font-bold">{simResults.estimated_impact || 'MEDIUM'}</span>
                  </div>
                </div>

                {simResults.worst_path && simResults.worst_path.length > 0 && (
                  <div className="bg-white dark:bg-slate-950/90 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-mono text-slate-700 dark:text-slate-300 uppercase block mb-2 font-bold">
                      Worst-Case Lateral Attack Vector Path:
                    </span>
                    <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
                      {simResults.worst_path.map((nid, i) => (
                        <React.Fragment key={nid}>
                          <span className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800 font-bold">
                            {nid}
                          </span>
                          {i < simResults.worst_path.length - 1 && (
                            <span className="text-red-500 font-bold">➔</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Right Col: Simulation Controller & Telemetry Drawer */}
        <div className="space-y-4">
          {/* Simulation Controller */}
          <Card>
            <SectionHeader
              title="Simulation Controller"
              subtitle="Trigger safe lateral penetration BFS analysis"
            />

            <div className="space-y-3 mt-2">
              <div>
                <label htmlFor="designated-attack-origin" className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase block mb-1 font-semibold">
                  Designated Attack Origin (Patient Zero)
                </label>
                <select
                  id="designated-attack-origin"
                  value={simSource}
                  onChange={(e) => setSimSource(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono rounded-lg p-2.5 focus:outline-none focus:border-slate-500"
                >
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.hostname} ({n.ip_address})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleSimulate}
                disabled={simulating || nodes.length === 0}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 disabled:opacity-50 text-xs font-mono font-bold rounded-lg flex items-center justify-center gap-2 transition shadow cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {simulating ? 'Calculating Lateral Vectors...' : 'Execute Twin Simulation'}
              </button>
            </div>
          </Card>

          {/* Node Telemetry Drawer */}
          {selectedNode && drawerOpen ? (
            <Card>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5 mb-3">
                <SectionHeader title="Selected Asset Telemetry" />
                <RiskBadge
                  level={selectedNode.risk_level || 'ADAPTIVE'}
                  score={selectedNode.risk_score}
                />
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Hostname</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold">{selectedNode.hostname}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">IP Address</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">{selectedNode.ip_address}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">MAC Address</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedNode.mac_address || '—'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Device Category</span>
                  <span className="text-slate-800 dark:text-slate-200">{selectedNode.device_type}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Hardware Vendor</span>
                  <span className="text-slate-700 dark:text-slate-300 truncate max-w-[160px]">
                    {selectedNode.vendor || 'Hardware Endpoint'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Operating System</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedNode.os || 'Windows'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Sensor Status</span>
                  <SensorBadge connected={selectedNode.sensor_connected} />
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">Criticality Weight</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold">{selectedNode.criticality || 1}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Last Seen</span>
                  <span className="text-slate-500">
                    {selectedNode.last_seen ? new Date(selectedNode.last_seen).toLocaleTimeString() : 'Recent'}
                  </span>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState message="Click an asset on the canvas to inspect real-time telemetry." />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default CyberTwin