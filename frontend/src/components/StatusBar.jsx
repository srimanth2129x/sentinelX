import React, { useEffect, useState } from 'react'
import { Server, Radio, ShieldCheck, Clock, Wifi } from 'lucide-react'
import { getSystemStatus } from '../api/client'

export function StatusBar({ status = {}, isMonitoring, backendOnline }) {
  const [latency, setLatency] = useState(null)
  const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString())
  const [isLive, setIsLive] = useState(true)

  useEffect(() => {
    let mounted = true

    const measureHealth = async () => {
      const start = performance.now()
      try {
        await getSystemStatus()
        const duration = Math.round(performance.now() - start)
        if (mounted) {
          setLatency(duration)
          setIsLive(true)
          setLastSync(new Date().toLocaleTimeString())
        }
      } catch {
        if (mounted) {
          setIsLive(backendOnline ?? false)
          setLatency(null)
          setLastSync(new Date().toLocaleTimeString())
        }
      }
    }

    measureHealth().catch(() => {})
    const interval = setInterval(() => {
      measureHealth().catch(() => {})
    }, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [backendOnline])

  const discoveryState = isMonitoring || status.is_monitoring || status.discovery_active
    ? 'SCANNING'
    : 'READY'

  const activeSubnet = status.subnet || '192.168.0.0/24'

  return (
    <footer className="w-full bg-slate-100/90 dark:bg-surface-base border-t border-slate-200 dark:border-border-subtle px-4 py-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-text-muted select-none z-30 shrink-0 theme-transition">
      {/* Left Core Metrics */}
      <div className="flex items-center gap-5">
        {/* Core API & Latency */}
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          <span className="text-[11px] font-medium">API Telemetry:</span>
          <span className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isLive ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            <span className={`font-mono text-[11px] font-semibold ${isLive ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
              {isLive ? (latency !== null ? `${latency}ms` : 'ONLINE') : 'OFFLINE'}
            </span>
          </span>
        </div>

        {/* Discovery Engine */}
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          <span className="text-[11px] font-medium">Discovery Engine:</span>
          <span className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                discoveryState === 'SCANNING' ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
            <span className={`font-mono text-[11px] font-semibold ${discoveryState === 'SCANNING' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
              {discoveryState}
            </span>
          </span>
        </div>

        {/* Sentinel Engine Rule Mode */}
        <div className="hidden lg:flex items-center gap-2 whitespace-nowrap">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-medium">Sentinel Engine:</span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold text-[11px]">Continuous Baseline Enforcement</span>
        </div>
      </div>

      {/* Right Subnet & Sync Info */}
      <div className="flex items-center gap-4 text-[11px]">
        <div className="hidden md:flex items-center gap-1.5">
          <Wifi className="w-3.5 h-3.5 text-slate-400" />
          <span>Subnet:</span>
          <span className="text-slate-700 dark:text-slate-300 font-mono font-semibold">{activeSubnet}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          <span>Synced:</span>
          <span className="text-slate-700 dark:text-slate-300 font-mono font-medium">{lastSync}</span>
        </div>
      </div>
    </footer>
  )
}

export default StatusBar