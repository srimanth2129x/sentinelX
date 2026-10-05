import React, { useState, useEffect, useCallback } from 'react'
import { BellRing, RefreshCw, Search } from 'lucide-react'
import { getAlerts } from '../api/client'
import { Card, SectionHeader, Spinner, EmptyState } from '../components/ui/Card'
import { RiskBadge, StatusBadge, MitreBadge } from '../components/ui/Badge'
import EvidenceModal from '../components/EvidenceModal'

export default function AlertsView({ onAlertChange }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedAlertForEvidence, setSelectedAlertForEvidence] = useState(null)
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getAlerts()
      setAlerts(Array.isArray(res.data) ? res.data : [])
      if (typeof onAlertChange === 'function') {
        onAlertChange()
      }
    } catch (e) {
      console.error('Failed to load alerts:', e)
    } finally {
      setLoading(false)
    }
  }, [onAlertChange])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 6000)
    return () => clearInterval(interval)
  }, [fetchAlerts])

  const filteredAlerts = alerts.filter((al) => {
    if (severityFilter !== 'ALL') {
      const s = String(al.severity || '').toUpperCase()
      if (severityFilter === 'HIGH_PLUS' && !s.includes('HIGH') && !s.includes('CRITICAL')) return false
      if (severityFilter === 'OPEN' && (al.status || '').toUpperCase() === 'RESOLVED') return false
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchTitle = (al.title || '').toLowerCase().includes(q)
      const matchDevice = (al.device_id || '').toLowerCase().includes(q)
      const matchMitre = (al.mitre_technique_id || '').toLowerCase().includes(q)
      return matchTitle || matchDevice || matchMitre
    }

    return true
  })

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-surface-base p-4 border border-slate-200/90 dark:border-border-base rounded shadow-xs theme-transition">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Security Alert Management
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold">
                {alerts.filter(a => (a.status || '').toUpperCase() !== 'RESOLVED').length} ACTIVE ALERTS
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              Correlated anomaly detections, MITRE ATT&CK technique tags, and explainable causal evidence graphs
            </p>
          </div>
        </div>

        <button
          onClick={fetchAlerts}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {[
              { id: 'ALL', label: `All Alerts (${alerts.length})` },
              { id: 'HIGH_PLUS', label: `High / Critical (${alerts.filter(a => String(a.severity || '').toUpperCase().includes('HIGH') || String(a.severity || '').toUpperCase().includes('CRITICAL')).length})` },
              { id: 'OPEN', label: `Open Only (${alerts.filter(a => (a.status || '').toUpperCase() !== 'RESOLVED').length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSeverityFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition font-medium cursor-pointer ${
                  severityFilter === tab.id
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
              placeholder="Search alerts, techniques, host..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-slate-500"
            />
          </div>
        </div>
      </Card>

      {/* Alert Table */}
      <Card>
        <SectionHeader
          title={`Detected Security Alerts (${filteredAlerts.length})`}
          subtitle="Triage queue with MITRE ATT&CK technique linkage and causal chain inspection"
        />

        {loading && alerts.length === 0 ? (
          <Spinner message="Checking threat detection queue..." />
        ) : filteredAlerts.length === 0 ? (
          <EmptyState
            icon={<BellRing className="w-6 h-6 text-slate-400" />}
            title="Zero Active Security Alerts"
            message="No alerts match the active filter criteria. All monitored endpoints within normal baseline."
          />
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-4">Severity</th>
                  <th className="py-2.5 px-4">Alert Title</th>
                  <th className="py-2.5 px-4">Device ID</th>
                  <th className="py-2.5 px-4">MITRE ATT&CK</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Explainability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredAlerts.map((al) => (
                  <tr key={al.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <RiskBadge level={al.severity || 'HIGH'} />
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                      {al.title}
                      {al.description && (
                        <div className="text-[10px] text-slate-400 font-normal truncate max-w-sm mt-0.5">
                          {al.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-semibold">{al.device_id}</td>
                    <td className="py-3 px-4">
                      {al.mitre_technique_id ? (
                        <MitreBadge
                          techniqueId={al.mitre_technique_id}
                          techniqueName={al.mitre_technique_name}
                          tactic={al.mitre_tactic}
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={al.status || 'OPEN'} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedAlertForEvidence(al)}
                        className="px-3 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md text-[11px] font-semibold hover:bg-slate-800 dark:hover:bg-white transition cursor-pointer shadow-sm"
                      >
                        View Evidence
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Interactive Evidence Graph Modal */}
      {selectedAlertForEvidence && (
        <EvidenceModal
          alert={selectedAlertForEvidence}
          onClose={() => setSelectedAlertForEvidence(null)}
        />
      )}
    </div>
  )
}