import React from 'react'
import { AlertCircle } from 'lucide-react'
import { RiskBadge, StatusBadge, MitreBadge, SensorBadge, CategoryBadge, AuthBadge, TransportBadge } from './Badge'

export { RiskBadge, StatusBadge, MitreBadge, SensorBadge, CategoryBadge, AuthBadge, TransportBadge }

export function Card({ children, className = '', hover = true, onClick }) {
  const handleKeyDown = onClick
    ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(e)
        }
      }
    : undefined

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`bg-white dark:bg-surface-base border border-slate-200/90 dark:border-border-base rounded p-4 transition-all duration-150 theme-transition ${
        hover ? 'hover:border-slate-300 dark:hover:border-border-strong hover:bg-slate-50/50 dark:hover:bg-surface-elevated/50 shadow-xs' : ''
      } ${onClick ? 'cursor-pointer select-none active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-slate-400 outline-none' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function StatCard({
  title,
  label,
  value,
  sub,
  subtitle,
  change,
  trend,
  icon,
  accent = 'neutral',
  onClick,
  className = '',
}) {
  const displayTitle = title || label
  const displaySub = sub || subtitle
  const handleKeyDown = onClick
    ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(e)
        }
      }
    : undefined

  // Semantic accent borders (strictly restrained)
  const accentGlow = {
    emerald: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400',
    green: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400',
    amber: 'border-l-4 border-l-amber-500 dark:border-l-amber-400',
    orange: 'border-l-4 border-l-orange-500 dark:border-l-orange-400',
    rose: 'border-l-4 border-l-red-500 dark:border-l-red-400',
    red: 'border-l-4 border-l-red-500 dark:border-l-red-400',
    neutral: 'border-l-4 border-l-slate-400 dark:border-l-border-strong',
  }[accent] || 'border-l-4 border-l-slate-400 dark:border-l-border-strong'

  const valueColor = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    orange: 'text-orange-600 dark:text-orange-400',
    rose: 'text-red-600 dark:text-red-400',
    red: 'text-red-600 dark:text-red-400',
    neutral: 'text-slate-900 dark:text-text-primary',
  }[accent] || 'text-slate-900 dark:text-text-primary'

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`bg-white dark:bg-surface-base border border-slate-200/90 dark:border-border-base rounded p-4 flex flex-col justify-between transition-all duration-150 theme-transition shadow-xs ${accentGlow} ${
        onClick ? 'cursor-pointer hover:border-slate-300 dark:hover:border-border-strong active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-slate-400 outline-none' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600 dark:text-text-secondary">
          {displayTitle}
        </span>
        {icon && <span className="text-slate-400 dark:text-text-muted">{icon}</span>}
      </div>

      <div className="my-2">
        <div className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight ${valueColor}`}>
          {value ?? '—'}
        </div>
        {(displaySub || change) && (
          <div className="text-xs text-slate-500 dark:text-text-muted mt-1 flex items-center gap-1.5 truncate">
            {change && (
              <span
                className={`font-semibold font-mono text-[11px] ${
                  trend === 'up'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : trend === 'down'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-500 dark:text-text-muted'
                }`}
              >
                {change}
              </span>
            )}
            {displaySub && <span className="truncate">{displaySub}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export function SectionHeader({ title, subtitle, badge, action, children }) {
  const displayTitle = title || (typeof children === 'string' ? children : null)

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-border-subtle pb-2">
      <div>
        <div className="flex items-center gap-2">
          {displayTitle && (
            <h3 className="text-xs font-semibold text-slate-800 dark:text-text-primary uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-border-strong" />
              {displayTitle}
            </h3>
          )}
          {badge}
        </div>
        {subtitle && <p className="text-[11px] text-slate-500 dark:text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function Spinner({ message = 'Loading Telemetry...' }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-3">
      <div className="relative w-7 h-7">
        <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-800 border-t-slate-700 dark:border-t-slate-300 animate-spin" />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{message}</span>
    </div>
  )
}

export function EmptyState({ title, message, icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-2.5">
        {icon || <AlertCircle className="w-5 h-5 text-slate-400 dark:text-slate-500" />}
      </div>
      {title && <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">{title}</div>}
      <div className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">{message || 'No telemetry recorded yet.'}</div>
    </div>
  )
}

export default Card