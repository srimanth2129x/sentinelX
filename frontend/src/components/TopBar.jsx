import React from 'react'
import { Shield, RefreshCw, Cpu, Server, Activity, Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export function TopBar({ status = {}, onRefresh, refreshing }) {
  const { toggleTheme, isDark } = useTheme()
  const isOnline = status.status === 'operational' || status.backendOnline !== false
  const activeSensors = status.active_sensors ?? status.sensors_connected ?? 0
  const onlineDevices = status.online_devices ?? status.devices_online ?? 0
  const totalDevices = status.total_devices ?? status.devices_total ?? 0
  const activeSubnet = status.subnet || '192.168.0.0/24'

  return (
    <header className="w-full bg-white dark:bg-surface-base border-b border-slate-200 dark:border-border-base px-4 py-2.5 flex items-center justify-between select-none z-30 shrink-0 theme-transition">
      {/* Left: Branding & Tagline */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-8 h-8 rounded bg-slate-900 dark:bg-surface-elevated text-white shadow-xs border border-slate-700/80 dark:border-border-strong">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-text-primary">
              Sentinel<span className="text-slate-500 dark:text-text-secondary font-medium">Twin</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-surface-elevated border border-slate-200 dark:border-border-strong text-slate-700 dark:text-text-muted font-semibold tracking-wider uppercase">
              SOC CONSOLE
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-text-muted tracking-normal hidden sm:block">
            Endpoint Behavioral Baseline & Digital Twin Intelligence
          </p>
        </div>
      </div>

      {/* Center: Live System Posture Telemetry */}
      <div className="hidden md:flex items-center gap-3 xl:gap-5 text-xs">
        {/* Core Health Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-100 dark:bg-surface-elevated border border-slate-200 dark:border-border-base text-slate-700 dark:text-text-secondary">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isOnline ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          <span className="text-[11px] font-semibold tracking-wide">
            {isOnline ? 'OPERATIONAL' : 'DISCONNECTED'}
          </span>
          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-300 dark:border-emerald-800/60">
            CONNECTED
          </span>
        </div>

        {/* Subnet Indicator */}
        <div className="hidden xl:flex items-center gap-1.5 text-slate-500 dark:text-text-secondary text-xs">
          <Activity className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-medium text-text-muted">SUBNET:</span>
          <span className="text-slate-800 dark:text-text-primary font-mono font-semibold text-[11px]">{activeSubnet}</span>
        </div>

        {/* Sensor State */}
        <div className="hidden lg:flex items-center gap-1.5 text-slate-500 dark:text-text-secondary text-xs">
          <Server className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-medium text-text-muted">SENSORS:</span>
          <span className={`font-mono text-[11px] font-semibold ${activeSensors > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-text-secondary'}`}>
            {activeSensors > 0 ? `${activeSensors} ONLINE` : 'STANDBY'}
          </span>
        </div>

        {/* Devices Summary */}
        <div className="hidden xl:flex items-center gap-1.5 text-slate-500 dark:text-text-secondary text-xs">
          <Cpu className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-medium text-text-muted">ASSETS:</span>
          <span className="text-slate-800 dark:text-text-primary font-mono font-bold text-[11px]">
            {onlineDevices}
            <span className="text-text-faint font-normal">/{totalDevices || onlineDevices || 1} MONITORED</span>
          </span>
        </div>
      </div>

      {/* Right: Actions, Theme Switcher & Refresh */}
      <div className="flex items-center gap-2">
        {/* Light / Dark Mode Toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-surface-elevated dark:hover:bg-surface-interactive border border-slate-200 dark:border-border-base text-slate-600 dark:text-text-secondary rounded transition cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 outline-none"
          title={isDark ? 'Switch to Clean Light Mode' : 'Switch to Dark SOC Mode'}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-slate-700" />
          )}
        </button>

        {/* Manual Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-surface-elevated dark:hover:bg-surface-interactive border border-slate-200 dark:border-border-base text-slate-600 dark:text-text-secondary rounded transition cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 outline-none"
            title="Refresh Telemetry"
            aria-label="Refresh telemetry data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-slate-900 dark:text-white' : ''}`} />
          </button>
        )}

        {/* Operator Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-100 dark:bg-surface-elevated border border-slate-200 dark:border-border-base text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-slate-800 dark:text-text-primary font-semibold font-mono text-[10px]">SOC OPERATOR</span>
          <span className="text-slate-400 dark:text-text-faint text-[10px] hidden sm:inline">· AUDIT</span>
        </div>
      </div>
    </header>
  )
}

export default TopBar
