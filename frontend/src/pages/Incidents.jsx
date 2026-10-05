import React, { useEffect, useState, useCallback } from 'react'
import {
  ShieldAlert,
  Search,
  RefreshCw,
  GitBranch,
  Clock,
  Laptop,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react'
import { getIncidents, updateIncident } from '../api/client'
import { Card, Spinner, EmptyState } from '../components/ui/Card'
import { RiskBadge, StatusBadge, MitreBadge } from '../components/ui/Badge'
import EvidenceModal from '../components/EvidenceModal'

export function Incidents() {
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSeverity, setFilterSeverity] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIncidentForGraph, setSelectedIncidentForGraph] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)

  const handleClearView = () => {
    setSearchQuery('')
    setFilterSeverity('ALL')
    setSelectedIncidentForGraph(null)
  }

  const loadIncidents = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getIncidents()
      setIncidents(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error('Failed to load incidents:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIncidents()
  }, [loadIncidents])

  const handleStatusChange = async (incidentId, newStatus) => {
    try {
      setUpdatingId(incidentId)
      await updateIncident(incidentId, { id: incidentId, status: newStatus })
      await loadIncidents()
    } catch (err) {
      console.error('Failed to update incident status:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredIncidents = incidents.filter((inc) => {
    // Severity filter
    if (filterSeverity !== 'ALL') {
      const sev = String(inc.severity || '').toUpperCase()
      if (filterSeverity === 'HIGH_PLUS' && !sev.includes('HIGH') && !sev.includes('CRITICAL')) {
        return false
      }
      if (filterSeverity === 'OPEN' && (inc.status || '').toUpperCase() === 'RESOLVED') {
        return false
      }
      if (filterSeverity === 'RESOLVED' && (inc.status || '').toUpperCase() !== 'RESOLVED') {
        return false
      }
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchTitle = (inc.title || '').toLowerCase().includes(q)
      const matchDevice = (inc.device_id || '').toLowerCase().includes(q)
      const matchMitre = (inc.mitre_technique_id || '').toLowerCase().includes(q)
      const matchDesc = (inc.description || '').toLowerCase().includes(q)
      return matchTitle || matchDevice || matchMitre || matchDesc
    }

    return true
  })

  if (loading && incidents.length === 0) {
    return <Spinner message="Loading security incidents..." />
  }

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-surface-base p-4 border border-slate-200/90 dark:border-border-base rounded shadow-xs theme-transition">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Correlated Security Incidents
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold">
                {incidents.filter((i) => (i.status || '').toUpperCase() !== 'RESOLVED').length} ACTIVE
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              Multi-signal threat aggregation, MITRE ATT&CK causal chains, and evidence graphs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearView}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-surface-elevated dark:hover:bg-surface-interactive border border-slate-200/90 dark:border-border-base text-slate-700 dark:text-text-secondary rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
            title="Reset active filters and evidence view"
            aria-label="Clear View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear View
          </button>
          <button
            onClick={loadIncidents}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-surface-elevated dark:hover:bg-surface-interactive border border-slate-200/90 dark:border-border-base text-slate-700 dark:text-text-secondary rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
            aria-label="Refresh incidents"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {[
              { id: 'ALL', label: `All (${incidents.length})` },
              {
                id: 'OPEN',
                label: `Active (${
                  incidents.filter((i) => (i.status || '').toUpperCase() !== 'RESOLVED').length
                })`,
              },
              {
                id: 'HIGH_PLUS',
                label: `High/Critical (${
                  incidents.filter(
                    (i) =>
                      String(i.severity || '').toUpperCase().includes('HIGH') ||
                      String(i.severity || '').toUpperCase().includes('CRITICAL')
                  ).length
                })`,
              },
              {
                id: 'RESOLVED',
                label: `Resolved (${
                  incidents.filter((i) => (i.status || '').toUpperCase() === 'RESOLVED').length
                })`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterSeverity(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition font-medium cursor-pointer ${
                  filterSeverity === tab.id
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search incidents, MITRE, devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-slate-500"
            />
          </div>
        </div>
      </Card>

      {/* Incidents List */}
      <div className="space-y-3">
        {filteredIncidents.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ShieldAlert className="w-6 h-6 text-slate-400" />}
              title="No Incidents Found"
              message={
                searchQuery
                  ? 'No security incidents match your filter query.'
                  : 'Zero active security incidents recorded across the fleet.'
              }
            />
          </Card>
        ) : (
          filteredIncidents.map((inc, idx) => {
            const isResolved = (inc.status || '').toUpperCase() === 'RESOLVED'
            const hasEvidence = inc.evidence_graph && Object.keys(inc.evidence_graph).length > 0

            return (
              <Card
                key={inc.id ?? `incident-${idx}`}
                className={`transition-all duration-150 ${
                  isResolved ? 'opacity-70 border-slate-200 dark:border-slate-800/60' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Title, Device & MITRE */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-slate-500 font-bold">
                        #{inc.id}
                      </span>
                      <RiskBadge level={inc.severity || 'HIGH'} />
                      <StatusBadge status={inc.status || 'Open'} />
                      {inc.risk_points !== undefined && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          +{inc.risk_points} pts
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {inc.title || 'Security Anomaly Detected'}
                    </div>

                    {inc.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono leading-relaxed max-w-3xl">
                        {inc.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-slate-500">
                      <span className="flex items-center gap-1">
                        <Laptop className="w-3 h-3 text-slate-400" />
                        Device: <span className="text-slate-800 dark:text-slate-200 font-semibold">{inc.device_id || 'local-host'}</span>
                      </span>

                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {inc.created_at ? new Date(inc.created_at).toLocaleString() : 'Recent'}
                      </span>

                      {/* MITRE Badge */}
                      {inc.mitre_technique_id && (
                        <MitreBadge
                          techniqueId={inc.mitre_technique_id}
                          techniqueName={inc.mitre_technique_name}
                          tactic={inc.mitre_tactic}
                        />
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
                    {/* Evidence Graph Trigger */}
                    {hasEvidence && (
                      <button
                        onClick={() => setSelectedIncidentForGraph(inc)}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
                        title="Open Causal Evidence Graph"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        Evidence DAG
                      </button>
                    )}

                    {/* Status Toggle Button */}
                    {!isResolved ? (
                      <button
                        onClick={() => handleStatusChange(inc.id, 'Resolved')}
                        disabled={updatingId === inc.id}
                        className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark Resolved
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(inc.id, 'Open')}
                        disabled={updatingId === inc.id}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>

      {/* Evidence Graph DAG Modal */}
      {selectedIncidentForGraph && (
        <EvidenceModal
          alert={selectedIncidentForGraph}
          onClose={() => setSelectedIncidentForGraph(null)}
        />
      )}
    </div>
  )
}

export default Incidents
