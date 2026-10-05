import React, { useEffect, useState, useCallback } from 'react'
import {
  Dna,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Layers,
} from 'lucide-react'
import { getCyberDNAUsers, getCyberDNAProfile, getDevices } from '../api/client'
import { Card, SectionHeader, Spinner, EmptyState } from '../components/ui/Card'

export function CyberDNA() {
  const [entities, setEntities] = useState([])
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  // Load Entities & Devices
  const loadEntities = useCallback(async () => {
    try {
      setLoading(true)
      const [entRes, devRes] = await Promise.all([
        getCyberDNAUsers().catch(() => ({ data: [] })),
        getDevices().catch(() => ({ data: [] })),
      ])

      const entList = Array.isArray(entRes.data) ? entRes.data : []
      const devList = Array.isArray(devRes.data) ? devRes.data : []

      // Merge unique entity list
      const combined = [...entList]
      devList.forEach((d) => {
        if (!combined.some((e) => (e.entity_id || e.id) === d.id)) {
          combined.push({
            entity_id: d.id,
            hostname: d.hostname,
            ip_address: d.ip_address,
            peer_group: d.device_type?.toLowerCase().includes('router') ? 'gateways' : 'workstations',
            metric_count: 0,
            is_device: true,
          })
        }
      })

      setEntities(combined)

      if (combined.length > 0 && !selectedEntityId) {
        setSelectedEntityId(combined[0].entity_id || combined[0].id)
      }
    } catch (err) {
      console.error('Failed to load CyberDNA entities:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedEntityId])

  useEffect(() => {
    loadEntities()
  }, [loadEntities])

  // Load Profile when selected entity changes
  useEffect(() => {
    if (!selectedEntityId) return
    let mounted = true
    setProfileLoading(true)

    getCyberDNAProfile(selectedEntityId)
      .then((res) => {
        if (mounted) {
          setProfile(res.data || null)
        }
      })
      .catch((err) => {
        console.error('Failed to load entity profile:', err)
        if (mounted) setProfile(null)
      })
      .finally(() => {
        if (mounted) setProfileLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [selectedEntityId])

  if (loading) return <Spinner message="Loading CyberDNA Behavioral Profiles..." />

  const metrics = profile?.metrics || {}
  const metricEntries = Object.entries(metrics)
  const hasMetrics = metricEntries.length > 0

  // Calculate overall drift from available metrics
  let totalDriftPct = 0
  let evaluatedMetrics = 0
  metricEntries.forEach(([_, m]) => {
    if (m.mean > 0 && m.short_term_mean !== undefined) {
      const d = (Math.abs(m.short_term_mean - m.mean) / m.mean) * 100
      totalDriftPct += d
      evaluatedMetrics += 1
    }
  })
  const avgDrift = evaluatedMetrics > 0 ? (totalDriftPct / evaluatedMetrics).toFixed(1) : '0.0'
  const isDriftDetected = Number.parseFloat(avgDrift) >= 25.0

  // Selected Entity details
  const currentEntity = entities.find(
    (e) => (e.entity_id || e.id) === selectedEntityId
  ) || {}

  const getMetricFriendlyName = (key) => {
    const map = {
      evt_4688_freq: 'Process Execution Rate',
      process_spawn_rate: 'Process Spawn Rate',
      logon_hour: 'Logon Time-of-Day',
      evt_4624_freq: 'Successful Logons',
      evt_4625_freq: 'Failed Authentication Bursts',
      cmd_length: 'PowerShell / CLI Command Length',
      net_flow_freq: 'Network Connection Frequency',
    }
    return map[key] || key.replace(/_/g, ' ').toUpperCase()
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-surface-base p-4 border border-slate-200/90 dark:border-border-base rounded shadow-xs theme-transition">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
            <Dna className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                CyberDNA Behavioral Intelligence
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold">
                WELFORD ONLINE STATS & EWMA DRIFT
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              Continuously calibrated personal baselines, cohort peer variance, and anti-poisoning drift gates
            </p>
          </div>
        </div>

        <button
          onClick={loadEntities}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Baselines
        </button>
      </div>

      {/* Main Grid: Entity Selector + Profile View */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Entity / Asset Selector */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <SectionHeader
              title="Monitored Entities"
              subtitle="Select endpoint or user profile"
            />

            {entities.length === 0 ? (
              <EmptyState message="No entities discovered yet. Run network discovery." />
            ) : (
              <div className="space-y-1.5 mt-3 max-h-[540px] overflow-y-auto pr-1">
                {entities.map((e) => {
                  const id = e.entity_id || e.id
                  const isSelected = selectedEntityId === id
                  const label = e.hostname || e.username || id
                  const peerGroup = e.peer_group || 'workstations'

                  return (
                    <div
                      key={id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedEntityId(id)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault()
                          setSelectedEntityId(id)
                        }
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-all duration-150 text-xs font-mono ${
                        isSelected
                          ? 'bg-slate-100 dark:bg-slate-800 border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold shadow-sm'
                          : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold truncate text-slate-900 dark:text-slate-100">{label}</span>
                        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                          {peerGroup}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate flex items-center justify-between">
                        <span>{e.ip_address || id}</span>
                        {e.metric_count > 0 ? (
                          <span className="text-slate-700 dark:text-slate-300 font-semibold">{e.metric_count} metrics</span>
                        ) : (
                          <span className="text-slate-400">Calibrating</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Detailed Behavioral DNA */}
        <div className="lg:col-span-3 space-y-6">
          {profileLoading ? (
            <Card>
              <Spinner message="Computing behavioral variance and drift..." />
            </Card>
          ) : !profile || !hasMetrics ? (
            <Card>
              <EmptyState
                icon={<Dna className="w-6 h-6 text-slate-400" />}
                title="Awaiting Behavioral Telemetry"
                message={`No baseline entries have been recorded yet for ${
                  currentEntity.hostname || selectedEntityId
                }. Once security events (Process spawns, Network connections, Logons) are ingested, Welford statistical models and EWMA drift meters will calibrate automatically.`}
              />
            </Card>
          ) : (
            <>
              {/* Executive Behavioral KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Drift Meter Card */}
                <Card>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-semibold">
                      Behavioral Drift (EWMA)
                    </span>
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="my-2 flex items-baseline gap-2">
                    <span
                      className={`text-3xl font-bold font-mono ${
                        isDriftDetected ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {avgDrift}%
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold border ${
                        isDriftDetected
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      }`}
                    >
                      {isDriftDetected ? 'DRIFT DETECTED' : 'STABLE BASELINE'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isDriftDetected ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(Number.parseFloat(avgDrift), 100)}%` }}
                    />
                  </div>
                </Card>

                {/* Peer Group Cohort */}
                <Card>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-semibold">
                      Cohort Peer Group
                    </span>
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 capitalize">
                      {profile.peer_group || 'Workstations'}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                      {metricEntries.length} active statistical dimensions
                    </div>
                  </div>
                </Card>

                {/* Calibration Maturity */}
                <Card>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-semibold">
                      Baseline Maturity
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      CALIBRATED
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                      Anti-Poisoning Gate Active
                    </div>
                  </div>
                </Card>
              </div>

              {/* Visual Behavioral Drift Comparison Bars */}
              <Card>
                <SectionHeader
                  title="Personal Baseline vs Current Behavior & Drift"
                  subtitle="Visualizing deviation of short-term EWMA against calibrated normal behavior"
                />

                <div className="space-y-4 mt-3">
                  {metricEntries.map(([mkey, m]) => {
                    const normMean = m.mean || 1
                    const currentMean = m.short_term_mean ?? m.mean
                    const driftPct = normMean > 0 ? (((currentMean - normMean) / normMean) * 100).toFixed(1) : '0.0'
                    const isElevated = Math.abs(Number.parseFloat(driftPct)) >= 25.0

                    return (
                      <div key={mkey} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-xs font-mono text-slate-900 dark:text-slate-100">
                              {getMetricFriendlyName(mkey)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono ml-2">({mkey})</span>
                          </div>
                          <span
                            className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                              isElevated
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                            }`}
                          >
                            DRIFT {driftPct > 0 ? `+${driftPct}%` : `${driftPct}%`}
                          </span>
                        </div>

                        {/* Visual Bars Comparison */}
                        <div className="space-y-1.5 font-mono text-[11px] pt-1">
                          <div className="flex items-center gap-3">
                            <span className="w-36 text-slate-500 shrink-0 text-[10px] uppercase font-semibold">
                              Personal Baseline (μ)
                            </span>
                            <div className="flex-1 bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-slate-700 dark:bg-slate-300 rounded-full"
                                style={{ width: `${Math.min(m.mean * 15, 80)}%` }}
                              />
                            </div>
                            <span className="w-16 text-right font-bold text-slate-800 dark:text-slate-200">
                              {m.mean} ± {m.std_dev}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="w-36 text-slate-500 shrink-0 text-[10px] uppercase font-semibold">
                              Current EWMA
                            </span>
                            <div className="flex-1 bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isElevated ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(m.short_term_mean * 15, 100)}%` }}
                              />
                            </div>
                            <span className={`w-16 text-right font-bold ${isElevated ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {m.short_term_mean}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>

              {/* Personal vs Peer Cohort Comparison */}
              <Card>
                <SectionHeader
                  title="Cohort Peer Group Variance Table"
                  subtitle="Comparing individual baseline against workstation fleet baseline"
                />

                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-3">Metric Dimension</th>
                        <th className="py-2.5 px-3">Personal Baseline (μ ± σ)</th>
                        <th className="py-2.5 px-3">Short-Term EWMA</th>
                        <th className="py-2.5 px-3">Peer Cohort (μ ± σ)</th>
                        <th className="py-2.5 px-3">Cohort Alignment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {metricEntries.map(([mkey, m]) => {
                        const hasPeer = m.peer_mean !== undefined
                        const isOutlier = hasPeer && m.peer_std_dev && Math.abs(m.mean - m.peer_mean) > 2 * m.peer_std_dev

                        return (
                          <tr key={mkey} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {getMetricFriendlyName(mkey)}
                              </div>
                              <div className="text-[10px] text-slate-500">{mkey}</div>
                            </td>

                            <td className="py-2.5 px-3">
                              <span className="text-slate-800 dark:text-slate-200 font-bold">{m.mean}</span>
                              <span className="text-slate-400 ml-1">± {m.std_dev}</span>
                            </td>

                            <td className="py-2.5 px-3">
                              <span
                                className={`font-semibold ${
                                  Math.abs(m.short_term_mean - m.mean) > m.std_dev
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {m.short_term_mean}
                              </span>
                            </td>

                            <td className="py-2.5 px-3">
                              {hasPeer ? (
                                <span>
                                  <span className="text-slate-800 dark:text-slate-200 font-bold">{m.peer_mean}</span>
                                  <span className="text-slate-400 ml-1">± {m.peer_std_dev}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">Calibrating</span>
                              )}
                            </td>

                            <td className="py-2.5 px-3">
                              {isOutlier ? (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold">
                                  COHORT OUTLIER
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                  ALIGNED
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CyberDNA
