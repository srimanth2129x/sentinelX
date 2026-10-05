import React from 'react'

export function RiskBadge({ level, score, className = '' }) {
  const norm = String(level || '').toUpperCase()
  let bg = 'bg-emerald-50 dark:bg-surface-elevated text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-border-strong'
  let dot = 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
  let label = 'ADAPTIVE'

  if (norm.includes('HOSTILE') || norm.includes('CRITICAL')) {
    bg = 'bg-red-50 dark:bg-primary text-red-700 dark:text-status-hostile-fg border-red-200 dark:border-primary font-bold shadow-xs'
    dot = 'bg-red-500 dark:bg-status-hostile-fg shadow-[0_0_6px_rgba(239,68,68,0.6)]'
    label = 'HOSTILE'
  } else if (norm.includes('HIGH')) {
    bg = 'bg-orange-50 dark:bg-surface-elevated text-orange-700 dark:text-status-elevated border-orange-200 dark:border-border-strong'
    dot = 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.5)]'
    label = 'HIGH RISK'
  } else if (norm.includes('SUSPICIOUS') || norm.includes('MEDIUM')) {
    bg = 'bg-amber-50 dark:bg-surface-elevated text-amber-700 dark:text-status-elevated-dim border-amber-200 dark:border-border-strong'
    dot = 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
    label = 'SUSPICIOUS'
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border tracking-wider uppercase transition-colors ${bg} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span>{label}</span>
      {typeof score === 'number' && <span className="opacity-75 font-normal">({score.toFixed(0)})</span>}
    </span>
  )
}

export function MitreBadge({ techniqueId, techniqueName, tactic, className = '' }) {
  if (!techniqueId && !techniqueName && !tactic) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-300 dark:border-border-strong bg-slate-100 dark:bg-surface-elevated text-slate-700 dark:text-text-primary ${className}`}
      title={techniqueName || tactic || techniqueId}
    >
      <span className="font-bold text-amber-600 dark:text-amber-400">{techniqueId || 'MITRE'}</span>
      {techniqueName && <span className="truncate max-w-[140px] text-slate-600 dark:text-text-secondary">· {techniqueName}</span>}
      {tactic && !techniqueName && <span className="text-slate-500 dark:text-text-muted">· {tactic}</span>}
    </span>
  )
}

export function SensorBadge({ connected, className = '' }) {
  return connected ? (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
      SENSOR ACTIVE
    </span>
  ) : (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/40 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-600" />
      UNMONITORED
    </span>
  )
}

export function StatusBadge({ status, className = '' }) {
  const norm = String(status || '').toUpperCase()
  let style = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'

  if (norm === 'ONLINE' || norm === 'RESOLVED' || norm === 'OPERATIONAL') {
    style = 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
  } else if (norm === 'OPEN' || norm === 'OFFLINE') {
    style = 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
  } else if (norm === 'INVESTIGATING' || norm === 'SCANNING') {
    style = 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 animate-pulse'
  } else if (norm === 'CONTAINED' || norm === 'SUSPICIOUS') {
    style = 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider border ${style} ${className}`}
    >
      {status || 'UNKNOWN'}
    </span>
  )
}

export function CategoryBadge({ type, className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium border border-slate-300 dark:border-slate-700/70 bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 ${className}`}
    >
      {type || 'Node'}
    </span>
  )
}

export function AuthBadge({ status, className = '' }) {
  const norm = String(status || 'AUTHORIZED').toUpperCase()
  let style = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
  let dot = 'bg-slate-400'

  if (norm === 'AUTHORIZED') {
    style = 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
    dot = 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]'
  } else if (norm === 'PENDING') {
    style = 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 animate-pulse'
    dot = 'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]'
  } else if (norm === 'REVOKED') {
    style = 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
    dot = 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]'
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wider border ${style} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span>{norm}</span>
    </span>
  )
}

export function TransportBadge({ mode, className = '' }) {
  const norm = String(mode || 'DIRECT').toUpperCase()
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium border border-slate-300 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 ${className}`}
    >
      {norm.replace('_', ' ')}
    </span>
  )
}
