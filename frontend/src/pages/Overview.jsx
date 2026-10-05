import React, { useEffect, useState, useCallback } from 'react'
import {
  Shield,
  Activity,
  AlertTriangle,
  Laptop,
  Radio,
  Share2,
  Dna,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  RefreshCw,
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { getDashboardSummary, getDevices, getEvents, getAlerts } from '../api/client'
import { Card, SectionHeader, Spinner, EmptyState } from '../components/ui/Card'
import { useTheme } from '../context/ThemeContext'

export function Overview({ onNav }) {
  const { isDark } = useTheme()
  const [summary, setSummary] = useState(null)
  const [devices, setDevices] = useState([])
  const [events, setEvents] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [isCleared, setIsCleared] = useState(false)

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true)
      const [sumRes, devRes, evRes, alRes] = await Promise.all([
        getDashboardSummary().catch(() => ({ data: {} })),
        getDevices().catch(() => ({ data: [] })),
        getEvents({ limit: 12 }).catch(() => ({ data: [] })),
        getAlerts().catch(() => ({ data: [] })),
      ])

      setSummary(sumRes.data || {})
      setDevices(Array.isArray(devRes.data) ? devRes.data : [])
      setEvents(Array.isArray(evRes.data) ? evRes.data : [])
      setAlerts(Array.isArray(alRes.data) ? alRes.data : [])
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isCleared) return
    loadDashboard()
    const timer = setInterval(loadDashboard, 8000)
    return () => clearInterval(timer)
  }, [loadDashboard, isCleared])

  const handleClearView = () => {
    setIsCleared(true)
    setSummary({})
    setDevices([])
    setEvents([])
    setAlerts([])
  }

  const handleRefresh = () => {
    setIsCleared(false)
    loadDashboard()
  }

  const handleNav = (page) => {
    if (typeof onNav === 'function') {
      onNav(page)
    }
  }

  if (loading && !summary && !isCleared) {
    return <Spinner message="Assembling SOC Executive Telemetry..." />
  }

  // Calculate Real Risk Distribution
  const riskCounts = {
    ADAPTIVE: 0,
    SUSPICIOUS: 0,
    HIGH_RISK: 0,
    HOSTILE: 0,
  }

  let totalScore = 0
  devices.forEach((d) => {
    const level = String(d.risk_level || '').toUpperCase()
    const score = d.risk_score ?? 0
    totalScore += score
    if (level.includes('HOSTILE') || score >= 80) {
      riskCounts.HOSTILE += 1
    } else if (level.includes('HIGH') || score >= 50) {
      riskCounts.HIGH_RISK += 1
    } else if (level.includes('SUSPICIOUS') || score >= 25) {
      riskCounts.SUSPICIOUS += 1
    } else {
      riskCounts.ADAPTIVE += 1
    }
  })

  const avgFleetRisk = devices.length > 0 ? (totalScore / devices.length).toFixed(0) : '0'
  const riskScoreNum = Number.parseInt(avgFleetRisk, 10) || 0

  const riskChartData = [
    { name: 'Normal / Adaptive', value: riskCounts.ADAPTIVE, color: '#10b981' },
    { name: 'Suspicious', value: riskCounts.SUSPICIOUS, color: '#f59e0b' },
    { name: 'High Risk', value: riskCounts.HIGH_RISK, color: '#f97316' },
    { name: 'Hostile Threat', value: riskCounts.HOSTILE, color: '#ef4444' },
  ].filter((item) => item.value > 0)

  const finalChartData = riskChartData.length > 0 ? riskChartData : [
    { name: 'Awaiting Telemetry', value: 1, color: isDark ? '#1e293b' : '#e2e8f0' }
  ]

  const totalDevices = devices.length || summary?.total_devices || 0
  const onlineDevices = devices.filter((d) => (d.status || '').toLowerCase() === 'online').length
  const activeAlerts = alerts.filter((a) => (a.status || '').toUpperCase() !== 'RESOLVED').length
  const highAlerts = alerts.filter((a) => {
    const s = String(a.severity || '').toUpperCase()
    return s.includes('HIGH') || s.includes('CRITICAL')
  }).length
  const totalEvents = summary?.total_events ?? events.length
  const simulationsCount = summary?.cyber_twin?.simulations ?? 0

  const recentTelemetry = events.slice(0, 8)

  // Pipeline architecture stages
  const pipelineStages = [
    { name: 'Windows Sensor', role: 'Telemetry' },
    { name: 'Event Processing', role: 'Normalization' },
    { name: 'CyberDNA', role: 'Baselines' },
    { name: 'Threat Detection', role: 'ATT&CK' },
    { name: 'Risk Engine', role: 'Scoring' },
    { name: 'Risk Gate', role: 'Triage' },
    { name: 'Digital Twin', role: 'Topology' },
    { name: 'Attack Path', role: 'Simulations' },
  ]

  return (
    <div className="space-y-5">
      {/* 1. Header & Architecture Pipeline Flow */}
      <div className="flex flex-col gap-3">
        {/* Compact Architecture Pipeline Ribbon */}
        <div className="bg-white dark:bg-surface-base border border-slate-200/90 dark:border-border-base rounded p-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-border-subtle">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-text-primary">
                SentinelTwin Behavioral Pipeline
              </span>
              <span className="text-[11px] text-slate-500 dark:text-text-muted hidden md:inline ml-2">
                Observe → Understand → Detect → Score → Simulate → Respond
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isCleared && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-surface-elevated text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-border-strong font-semibold">
                  VIEW CLEARED (POLLING PAUSED)
                </span>
              )}
              <button
                type="button"
                onClick={handleClearView}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-surface-elevated dark:hover:bg-surface-interactive border border-slate-200/90 dark:border-border-base text-slate-700 dark:text-text-secondary rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
                title="Clear locally displayed overview values and pause polling"
                aria-label="Clear View"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear View
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-surface-elevated dark:hover:bg-surface-interactive border border-slate-200/90 dark:border-border-base text-slate-700 dark:text-text-secondary rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
                title="Refresh and resume live telemetry polling"
                aria-label="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="flex items-center min-w-[700px] gap-1.5 text-center">
              {pipelineStages.map((stage, idx) => (
                <React.Fragment key={stage.name}>
                  <div className="flex-1 py-1.5 px-2 rounded bg-slate-50 dark:bg-surface-elevated border border-slate-200/80 dark:border-border-base transition hover:border-slate-300 dark:hover:border-border-strong">
                    <div className="text-[11px] font-semibold text-slate-800 dark:text-text-primary truncate">
                      {stage.name}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-text-muted truncate">
                      {stage.role}
                    </div>
                  </div>
                  {idx < pipelineStages.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-text-faint shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Structured Operational Posture Grid (Hierarchical, Not Identical Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        {/* Primary Priority 1: Fleet Risk Posture (Col 1-4) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleNav('risk')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleNav('risk')
            }
          }}
          className={`lg:col-span-4 bg-white dark:bg-surface-base border rounded p-4 flex flex-col justify-between transition cursor-pointer hover:border-slate-300 dark:hover:border-border-strong shadow-xs ${
            riskScoreNum >= 50
              ? 'border-l-4 border-l-red-500 border-slate-200 dark:border-border-base'
              : riskScoreNum >= 25
              ? 'border-l-4 border-l-amber-500 border-slate-200 dark:border-border-base'
              : 'border-l-4 border-l-emerald-500 border-slate-200 dark:border-border-base'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-text-secondary">
              Fleet Risk Posture
            </span>
            <Shield className={`w-4 h-4 ${
              riskScoreNum >= 50 ? 'text-red-500' : riskScoreNum >= 25 ? 'text-amber-500' : 'text-emerald-500'
            }`} />
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono tracking-tight text-slate-900 dark:text-text-primary">
                {avgFleetRisk}
              </span>
              <span className="text-sm font-mono text-slate-500 dark:text-text-muted">/ 100</span>
              <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded ${
                riskScoreNum >= 50
                  ? 'bg-red-50 dark:bg-primary text-red-700 dark:text-status-hostile-fg font-bold'
                  : riskScoreNum >= 25
                  ? 'bg-amber-50 dark:bg-surface-elevated text-amber-700 dark:text-status-elevated border border-amber-200 dark:border-border-strong'
                  : 'bg-emerald-50 dark:bg-surface-elevated text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-border-strong'
              }`}>
                {riskScoreNum >= 50 ? 'HIGH RISK' : riskScoreNum >= 25 ? 'SUSPICIOUS' : 'NOMINAL / LOW'}
              </span>
            </div>

            {/* Visual Risk Gauge Spectrum */}
            <div className="w-full bg-slate-100 dark:bg-surface-container rounded-sm h-1.5 mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  riskScoreNum >= 50 ? 'bg-red-500' : riskScoreNum >= 25 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.max(riskScoreNum, 4)}%` }}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-border-subtle flex items-center justify-between text-xs text-slate-500 dark:text-text-muted">
            <span>{totalDevices} device{totalDevices !== 1 ? 's' : ''} monitored</span>
            <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-text-primary">
              Inspect Risk Spectrum <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Primary Priority 2: Alerts & Incident Center (Col 5-8) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleNav('alerts')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleNav('alerts')
            }
          }}
          className={`lg:col-span-4 bg-white dark:bg-surface-base border rounded p-4 flex flex-col justify-between transition cursor-pointer hover:border-slate-300 dark:hover:border-border-strong shadow-xs ${
            activeAlerts > 0
              ? 'border-l-4 border-l-red-500 border-slate-200 dark:border-border-base'
              : 'border-l-4 border-l-emerald-500 border-slate-200 dark:border-border-base'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-text-secondary">
              Active Security Alerts
            </span>
            {activeAlerts > 0 ? (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold font-mono tracking-tight ${
                activeAlerts > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-text-primary'
              }`}>
                {activeAlerts}
              </span>
              <span className="text-xs text-slate-500 dark:text-text-muted">
                {activeAlerts === 1 ? 'threat flag' : 'threat flags'}
              </span>
              <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded ${
                highAlerts > 0
                  ? 'bg-red-50 dark:bg-primary text-red-700 dark:text-status-hostile-fg font-bold'
                  : 'bg-emerald-50 dark:bg-surface-elevated text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-border-strong'
              }`}>
                {highAlerts > 0 ? `${highAlerts} CRITICAL/HIGH` : 'ZERO BREACHES'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-text-muted mt-2">
              {activeAlerts > 0
                ? 'ATT&CK behavioral anomalies requiring operator triage.'
                : 'All endpoints operating within learned Welford baselines.'}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-border-subtle flex items-center justify-between text-xs text-slate-500 dark:text-text-muted">
            <span>Triage Queue</span>
            <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-text-primary">
              View Alerts Queue <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Supporting Operational Metrics (Col 9-12) */}
        <div className="lg:col-span-4 grid grid-cols-1 gap-2.5">
          {/* Active Endpoints Item */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNav('devices')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleNav('devices')
              }
            }}
            className="bg-white dark:bg-surface-base border border-slate-200/90 dark:border-border-base rounded p-3 flex items-center justify-between hover:border-slate-300 dark:hover:border-border-strong transition cursor-pointer shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-slate-100 dark:bg-surface-elevated text-slate-700 dark:text-text-secondary">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-text-primary">
                  Monitored Devices
                </div>
                <div className="text-[11px] text-slate-500 dark:text-text-muted">
                  {onlineDevices} online on local subnet
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold font-mono text-slate-900 dark:text-text-primary">
                {totalDevices}
              </span>
            </div>
          </div>

          {/* Telemetry Volume Item */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNav('events')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleNav('events')
              }
            }}
            className="bg-white dark:bg-surface-base border border-slate-200/90 dark:border-border-base rounded p-3 flex items-center justify-between hover:border-slate-300 dark:hover:border-border-strong transition cursor-pointer shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-slate-100 dark:bg-surface-elevated text-slate-700 dark:text-text-secondary">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-text-primary">
                  Events Ingested
                </div>
                <div className="text-[11px] text-slate-500 dark:text-text-muted">
                  Windows & Sysmon stream
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold font-mono text-slate-900 dark:text-text-primary">
                {totalEvents.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Digital Twin Simulations Item */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNav('cybertwin')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleNav('cybertwin')
              }
            }}
            className="bg-white dark:bg-surface-base border border-slate-200/90 dark:border-border-base rounded p-3 flex items-center justify-between hover:border-slate-300 dark:hover:border-border-strong transition cursor-pointer shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-slate-100 dark:bg-surface-elevated text-slate-700 dark:text-text-secondary">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-text-primary">
                  Digital Twin Sims
                </div>
                <div className="text-[11px] text-slate-500 dark:text-text-muted">
                  Lateral blast-radius evaluations
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold font-mono text-slate-900 dark:text-text-primary">
                {simulationsCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Central Intelligence Split: Risk Distribution & Live Telemetry Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Fleet Risk Distribution Donut (Col 1-4) */}
        <Card className="lg:col-span-4 flex flex-col justify-between">
          <div>
            <SectionHeader
              title="Fleet Risk Distribution"
              subtitle="Breakdown of monitored endpoints by behavioral risk status"
            />

            <div className="h-52 w-full mt-2 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={finalChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={74}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {finalChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        stroke={isDark ? '#0f141f' : '#ffffff'}
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0c0c0e' : '#ffffff',
                      borderColor: isDark ? '#26262a' : '#cbd5e1',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'inherit',
                      color: isDark ? '#ffffff' : '#0f172a',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Centered Device Count */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-2">
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
                  {totalDevices}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  Monitored
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-border-subtle pt-3 mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded bg-slate-50 dark:bg-surface-elevated border border-slate-200/80 dark:border-border-base">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono text-xs block">
                {riskCounts.ADAPTIVE}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-text-muted">Normal</span>
            </div>
            <div className="p-2 rounded bg-slate-50 dark:bg-surface-elevated border border-slate-200/80 dark:border-border-base">
              <span className="text-amber-600 dark:text-amber-400 font-bold font-mono text-xs block">
                {riskCounts.SUSPICIOUS}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-text-muted">Suspicious</span>
            </div>
            <div className="p-2 rounded bg-slate-50 dark:bg-surface-elevated border border-slate-200/80 dark:border-border-base">
              <span className="text-red-600 dark:text-red-400 font-bold font-mono text-xs block">
                {riskCounts.HIGH_RISK + riskCounts.HOSTILE}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-text-muted">Elevated</span>
            </div>
          </div>
        </Card>

        {/* Live Security Ingestion Stream (Col 5-12) */}
        <Card className="lg:col-span-8">
          <SectionHeader
            title="Live Security Telemetry Stream"
            subtitle="Normalized Windows Security & Sysmon events passing through correlation"
            action={
              <button
                onClick={() => handleNav('events')}
                className="text-xs text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-text-primary flex items-center gap-1 transition cursor-pointer font-medium"
              >
                Full Stream <ArrowRight className="w-3.5 h-3.5" />
              </button>
            }
          />

          {recentTelemetry.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-6 h-6 text-slate-400" />}
              title={isCleared ? 'Overview View Cleared' : 'Awaiting Telemetry Ingestion'}
              message={
                isCleared
                  ? 'Locally displayed values cleared and polling paused. Press Refresh to restore live data.'
                  : 'No security events recorded yet. Connect Windows Event Sensor or run discovery.'
              }
            />
          ) : (
            <div className="space-y-1.5 mt-2">
              {recentTelemetry.map((ev, i) => {
                const ts = ev.event_timestamp || ev.timestamp || ev.ingested_at
                const timeStr = ts ? new Date(ts).toLocaleTimeString() : 'Recent'
                const host = ev.hostname || ev.device_id || ev.source_ip || 'Localhost'
                const eventName = ev.process_name || ev.event_type || 'System Event'

                return (
                  <div
                    key={ev.id || i}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNav('events')}
                    onKeyDown={(evKey) => {
                      if (evKey.key === 'Enter' || evKey.key === ' ') {
                        evKey.preventDefault()
                        handleNav('events')
                      }
                    }}
                    className="p-2.5 rounded bg-slate-50/80 dark:bg-surface-elevated/50 border border-slate-200/80 dark:border-border-subtle hover:border-slate-300 dark:hover:border-border-strong flex items-center justify-between text-xs transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0">
                      <span className="text-slate-400 dark:text-text-muted text-[11px] font-mono shrink-0">
                        {timeStr}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-border-strong shrink-0" />
                      <span className="font-medium text-slate-800 dark:text-text-primary truncate font-mono text-[11px]">
                        {eventName}
                      </span>
                      <span className="text-slate-500 dark:text-text-secondary text-[11px] hidden sm:inline truncate">
                        on <span className="font-mono">{host}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {ev.mitre_technique_id && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-surface-elevated text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-border-strong font-semibold">
                          {ev.mitre_technique_id}
                        </span>
                      )}
                      {ev.risk_score !== undefined && (
                        <span
                          className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                            ev.risk_score >= 50
                              ? 'bg-red-50 dark:bg-primary text-red-700 dark:text-status-hostile-fg border-red-200 dark:border-primary font-bold shadow-xs'
                              : ev.risk_score >= 25
                              ? 'bg-amber-50 dark:bg-surface-elevated text-amber-700 dark:text-status-elevated border border-amber-200 dark:border-border-strong'
                              : 'bg-emerald-50 dark:bg-surface-elevated text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-border-strong'
                          }`}
                        >
                          +{ev.risk_score} pts
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 4. Quick Operational Triggers */}
      <Card>
        <SectionHeader
          title="Rapid SOC Operations & Simulation Triggers"
          subtitle="Direct operational actions linked to live SentinelTwin engines"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
          {/* Quick Action 1: Network Discovery */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNav('network')}
            onKeyDown={(evKey) => {
              if (evKey.key === 'Enter' || evKey.key === ' ') {
                evKey.preventDefault()
                handleNav('network')
              }
            }}
            className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition group"
          >
            <div className="flex items-center justify-between mb-2">
              <Radio className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
            </div>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Run Network Discovery
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Trigger high-speed 50-thread ping sweep across local subnet to discover active endpoints.
            </p>
          </div>

          {/* Quick Action 2: Attack Propagation */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNav('cybertwin')}
            onKeyDown={(evKey) => {
              if (evKey.key === 'Enter' || evKey.key === ' ') {
                evKey.preventDefault()
                handleNav('cybertwin')
              }
            }}
            className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition group"
          >
            <div className="flex items-center justify-between mb-2">
              <Share2 className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
            </div>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Simulate Lateral Movement
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Designate patient zero in Digital Twin and evaluate multi-hop BFS blast-radius reachability.
            </p>
          </div>

          {/* Quick Action 3: Inspect Drift */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleNav('cyberdna')}
            onKeyDown={(evKey) => {
              if (evKey.key === 'Enter' || evKey.key === ' ') {
                evKey.preventDefault()
                handleNav('cyberdna')
              }
            }}
            className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition group"
          >
            <div className="flex items-center justify-between mb-2">
              <Dna className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
            </div>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Inspect Behavioral Drift
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Compare personal Welford baselines against cohort peer groups and EWMA drift meters.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default Overview