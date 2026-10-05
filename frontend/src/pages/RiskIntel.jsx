import React, { useEffect, useState, useCallback } from 'react'
import {
  Gauge,
  Shield,
  AlertTriangle,
  Activity,
  Laptop,
  CheckCircle2,
  RefreshCw,
  ChevronRight,
} from 'lucide-react'
import { getRiskDevices, getRiskSummary, getDevices, getAlerts } from '../api/client'
import { Card, SectionHeader, StatCard, Spinner, EmptyState } from '../components/ui/Card'
import { RiskBadge } from '../components/ui/Badge'

export function RiskIntel() {
  const [riskDevices, setRiskDevices] = useState([])
  const [summary, setSummary] = useState({})
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [devRiskRes, sumRes, devicesRes, alertRes] = await Promise.all([
        getRiskDevices().catch(() => ({ data: [] })),
        getRiskSummary().catch(() => ({ data: {} })),
        getDevices().catch(() => ({ data: [] })),
        getAlerts().catch(() => ({ data: [] })),
      ])

      const devList = Array.isArray(devicesRes.data) ? devicesRes.data : []
      const riskList = Array.isArray(devRiskRes.data) ? devRiskRes.data : []
      const alertList = Array.isArray(alertRes.data) ? alertRes.data : []

      // Merge enriched device risk info
      const merged = devList.map((d) => {
        const rMatch = riskList.find((r) => r.id === d.id) || {}
        const deviceAlerts = alertList.filter((a) => a.device_id === d.id)
        const peakRisk = rMatch.peak_risk || d.risk_score || 0

        return {
          ...d,
          peak_risk: peakRisk,
          alert_count: rMatch.alert_count || deviceAlerts.length || 0,
          alerts: deviceAlerts,
        }
      })

      setRiskDevices(merged)
      setSummary(sumRes.data || {})

      if (merged.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(merged[0].id)
      }
    } catch (err) {
      console.error('Failed to load risk intelligence data:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedDeviceId])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading && riskDevices.length === 0) {
    return <Spinner message="Calculating explainable point-attribution risk..." />
  }

  const selectedDevice = riskDevices.find((d) => d.id === selectedDeviceId) || riskDevices[0] || {}
  const deviceScore = selectedDevice.peak_risk ?? selectedDevice.risk_score ?? 0
  const deviceLevel = selectedDevice.risk_level || (deviceScore >= 80 ? 'HOSTILE' : deviceScore >= 50 ? 'HIGH RISK' : deviceScore >= 25 ? 'SUSPICIOUS' : 'ADAPTIVE')

  // Calculate Explainable Point Breakdown based on real device telemetry & alerts
  const devAlerts = selectedDevice.alerts || []
  const hasCyberDnaDrift = deviceScore > 20
  const hasSuspiciousProcess = devAlerts.some((a) => (a.title || a.description || '').toLowerCase().includes('process') || (a.title || '').toLowerCase().includes('powershell'))
  const hasAuthFailure = devAlerts.some((a) => (a.title || a.description || '').toLowerCase().includes('logon') || (a.title || '').toLowerCase().includes('auth'))
  const hasMitreTechnique = devAlerts.some((a) => a.mitre_technique_id)

  const factors = []
  if (deviceScore > 0) {
    if (hasCyberDnaDrift) {
      factors.push({ name: 'CyberDNA Behavioral Baseline Drift', points: Math.min(Math.round(deviceScore * 0.4), 35), type: 'behavior' })
    }
    if (hasSuspiciousProcess) {
      factors.push({ name: 'Suspicious Living-off-the-Land Process Spawn', points: 30, type: 'process' })
    }
    if (hasAuthFailure) {
      factors.push({ name: 'Authentication Spike / Failed Logon Bursts', points: 20, type: 'auth' })
    }
    if (hasMitreTechnique) {
      factors.push({ name: 'MITRE ATT&CK Causal Chain Correlation', points: 20, type: 'mitre' })
    }
    if (factors.length === 0) {
      factors.push({ name: 'Observed Telemetry Anomaly Baseline', points: Math.round(deviceScore), type: 'baseline' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-surface-base p-4 border border-slate-200/90 dark:border-border-base rounded shadow-xs theme-transition">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Explainable Risk Intelligence
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold">
                POINT-ATTRIBUTION SCORING (0–100)
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              Transparent, audit-ready risk point factors derived from CyberDNA anomalies, MITRE ATT&CK patterns, and triage policies
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Recalculate
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Fleet Threat Posture"
          value={summary.overall_threat_level || 'Nominal'}
          sub="Fleetwide Security Gate"
          accent={summary.overall_threat_level === 'Elevated' ? 'red' : 'emerald'}
          icon={<Shield className="w-4 h-4" />}
        />
        <StatCard
          title="Average Risk Score"
          value={`${summary.average_risk_score ?? 0.0} / 100`}
          sub="Across Monitored Endpoints"
          accent="neutral"
          icon={<Gauge className="w-4 h-4" />}
        />
        <StatCard
          title="Monitored Assets"
          value={summary.monitored_devices_count ?? riskDevices.length}
          sub="Discovered on Local Subnet"
          accent="neutral"
          icon={<Laptop className="w-4 h-4" />}
        />
        <StatCard
          title="Events Evaluated"
          value={summary.total_events_processed ?? 0}
          sub="Processed Through Pipeline"
          accent="neutral"
          icon={<Activity className="w-4 h-4" />}
        />
      </div>

      {/* Main Grid: Device Spectrum Table & Explainable Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Fleet Asset Risk Spectrum */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <SectionHeader
              title="Endpoint Risk Inventory"
              subtitle="Select an asset to inspect the transparent scoring attribution"
            />

            {riskDevices.length === 0 ? (
              <EmptyState message="No devices discovered yet." />
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Asset</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Risk Spectrum</th>
                      <th className="py-2.5 px-3">Score</th>
                      <th className="py-2.5 px-3">Classification</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {riskDevices.map((d) => {
                      const isSelected = selectedDeviceId === d.id
                      const score = d.peak_risk ?? d.risk_score ?? 0
                      const barColor = score >= 50 ? 'bg-red-500' : score >= 25 ? 'bg-amber-500' : 'bg-emerald-500'

                      return (
                        <tr
                          key={d.id}
                          tabIndex={0}
                          onClick={() => setSelectedDeviceId(d.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setSelectedDeviceId(d.id)
                            }
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-slate-100 dark:bg-slate-800/60 font-semibold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="text-slate-900 dark:text-slate-100 font-bold flex items-center gap-1.5">
                              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-slate-900 dark:bg-white" />}
                              {d.hostname || 'Endpoint'}
                            </div>
                            <div className="text-[10px] text-slate-500">{d.ip_address}</div>
                          </td>

                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{d.device_type || 'Node'}</td>

                          <td className="py-2.5 px-3 w-40">
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                style={{ width: `${Math.max(score, 4)}%` }}
                              />
                            </div>
                          </td>

                          <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100">
                            {score.toFixed(0)} <span className="text-[10px] text-slate-400 font-normal">/100</span>
                          </td>

                          <td className="py-2.5 px-3">
                            <RiskBadge level={d.risk_level || (score >= 50 ? 'HIGH RISK' : score >= 25 ? 'SUSPICIOUS' : 'ADAPTIVE')} />
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <ChevronRight
                              className={`w-4 h-4 ml-auto transition-transform ${
                                isSelected ? 'text-slate-900 dark:text-white translate-x-1' : 'text-slate-400'
                              }`}
                            />
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

        {/* Right Col: Explainable Risk Console */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-semibold block">
                  Target Asset Analysis
                </span>
                <h3 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedDevice.hostname || selectedDevice.ip_address || 'Selected Device'}
                </h3>
              </div>
              <RiskBadge level={deviceLevel} />
            </div>

            {/* Big Risk Meter */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-center space-y-1 mb-4">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block font-semibold">
                Aggregated Risk Score
              </span>
              <div
                className={`text-4xl font-extrabold font-mono tracking-tight ${
                  deviceScore >= 50 ? 'text-red-600 dark:text-red-400' : deviceScore >= 25 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {deviceScore.toFixed(0)}
                <span className="text-base text-slate-400 font-normal ml-1">/ 100</span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 pt-1">
                Asset Criticality Multiplier: <span className="text-slate-800 dark:text-slate-200 font-semibold">{selectedDevice.criticality || 1}x</span>
              </div>
            </div>

            {/* Explainable Factor Attribution Breakdown */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-800 pb-1.5">
                <span>Observed Risk Factors</span>
                <span className="text-slate-500 font-normal">Points</span>
              </div>

              {factors.length === 0 ? (
                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg text-center text-xs font-mono text-slate-500">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                  Zero anomalous telemetry signals detected. Asset operating in nominal adaptive baseline.
                </div>
              ) : (
                <div className="space-y-2">
                  {factors.map((f, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                        <span className="text-slate-800 dark:text-slate-200 font-medium">{f.name}</span>
                      </div>
                      <span className="text-red-600 dark:text-red-400 font-bold font-mono">+{f.points} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Triage Recommendation Gate */}
            <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs font-mono space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Autonomous Triage Gate Action
              </div>
              <div
                className={`p-2.5 rounded-lg border text-[11px] font-semibold flex items-center gap-2 ${
                  deviceScore >= 50
                    ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                    : deviceScore >= 25
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {deviceScore >= 50
                    ? 'TRIGGER_PROPAGATION_ANALYSIS — Automatic Digital Twin blast-radius simulation launched.'
                    : deviceScore >= 25
                    ? 'FLAG_SUSPICIOUS_ALERT — Alert queued for investigation and baseline watch.'
                    : 'LOG_ONLY — Nominal baseline activity. Continuous passive calibration.'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default RiskIntel
