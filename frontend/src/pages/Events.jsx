/**
 * Telemetry Event Stream Component (`Events.jsx`)
 * ===============================================
 * Displays high-throughput normalized Windows Security Event Logs and Sysmon telemetry.
 *
 * Core Architecture & Features:
 *  1. Telemetry Ingestion View:
 *     Fetches the latest 200 security records from GET /api/events sorted by time.
 *
 *  2. Defensive "Visibility Boundary" (The Clear Feature):
 *     In compliance with forensic and defensive security standards, clicking "Clear Events"
 *     does NOT delete logs from the database. Instead, it creates a client-side visibility
 *     boundary (persisted in localStorage as `sentinel_events_cleared_max_id` and `sentinel_events_cleared_at`).
 *     - All events received BEFORE this boundary are hidden from view.
 *     - Any NEW events arriving after the clear will immediately appear in real-time.
 *     - Analysts can click "Restore History" at any time to unhide historical events.
 *
 *  3. Dynamic Filtering:
 *     Real-time client/server filters by device ID and event type (e.g. logon, process_creation).
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Activity, RefreshCw, Terminal, Laptop, RotateCcw, EyeOff } from 'lucide-react'
import { getEvents } from '../api/client'
import { Card, SectionHeader, Spinner, EmptyState } from '../components/ui/Card'

export function Events() {
  // Raw event logs fetched from the backend API
  const [events, setEvents] = useState([])
  // Loading spinner state while HTTP request is in-flight
  const [loading, setLoading] = useState(true)
  // Filter state for device_id and event_type inputs
  const [filter, setFilter] = useState({ device_id: '', event_type: '' })

  // Live Auto-Refresh frequency ('off' | '3s' | '5s' | '10s')
  const [autoRefreshInterval, setAutoRefreshInterval] = useState('5s')

  // --- Visibility Boundary States ---
  // Persisted in localStorage so the user's cleared view persists across page refreshes.
  // clearedAt: Timestamp (epoch ms) when the user clicked Clear
  const [clearedAt, setClearedAt] = useState(() => localStorage.getItem('sentinel_events_cleared_at'))
  // clearedMaxId: The highest event ID seen at the time of clearing
  const [clearedMaxId, setClearedMaxId] = useState(() => {
    const v = localStorage.getItem('sentinel_events_cleared_max_id')
    return v ? Number(v) : 0
  })
  // Controls display of the two-step confirmation modal
  const [showClearModal, setShowClearModal] = useState(false)

  // Asynchronously loads telemetry records from backend REST API
  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getEvents({ limit: 200, ...filter })
      setEvents(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error('Events load error:', err)
    } finally {
      setLoading(false)
    }
  }, [filter])

  // Trigger initial fetch on component mount and whenever filter inputs change
  useEffect(() => {
    load()
  }, [load])

  // Live auto-refresh interval effect
  useEffect(() => {
    if (autoRefreshInterval === 'off') return
    const ms = autoRefreshInterval === '3s' ? 3000 : autoRefreshInterval === '10s' ? 10000 : 5000
    const timer = setInterval(() => {
      getEvents({ limit: 200, ...filter })
        .then((res) => {
          if (Array.isArray(res.data)) {
            setEvents(res.data)
          }
        })
        .catch((err) => console.debug('Auto-refresh error:', err))
    }, ms)
    return () => clearInterval(timer)
  }, [autoRefreshInterval, filter])

  /**
   * Sets the visibility boundary to hide past events without deleting database records.
   * Called when user confirms "Clear Events" in the modal.
   */
  const handleClearEvents = () => {
    const now = Date.now()
    // Find the maximum ID among currently loaded events
    const maxId = events.reduce((max, e) => Math.max(max, Number(e.id) || 0), 0)
    // Store in browser localStorage
    localStorage.setItem('sentinel_events_cleared_at', String(now))
    localStorage.setItem('sentinel_events_cleared_max_id', String(maxId))
    // Update local React state to immediately trigger visibleEvents recalculation
    setClearedAt(String(now))
    setClearedMaxId(maxId)
    // Reset transient filter inputs
    setFilter({ device_id: '', event_type: '' })
    setShowClearModal(false)
  }

  /**
   * Clears the visibility boundary from localStorage, restoring all historical events.
   */
  const handleRestoreHistory = () => {
    localStorage.removeItem('sentinel_events_cleared_at')
    localStorage.removeItem('sentinel_events_cleared_max_id')
    setClearedAt(null)
    setClearedMaxId(0)
  }

  /**
   * Computes the subset of events to display on screen:
   * - If no boundary is active (clearedAt is null), returns all events.
   * - If boundary is active, excludes events with ID <= clearedMaxId or timestamp <= clearedAt.
   * - New events streaming in with higher IDs or later timestamps pass through and render.
   */
  const visibleEvents = useMemo(() => {
    if (!clearedAt) return events
    const clearedTime = Number(clearedAt)
    return events.filter((e) => {
      // Primary check: event ID is greater than highest ID recorded when cleared
      if (clearedMaxId > 0 && e.id != null) {
        return Number(e.id) > clearedMaxId
      }
      // Fallback check: event timestamp is newer than clear epoch time
      const timeStr = e.ingested_at || e.event_timestamp || e.timestamp || e.created_at
      if (!timeStr) return false
      const t = new Date(timeStr).getTime()
      return !Number.isNaN(t) && t > clearedTime
    })
  }, [events, clearedAt, clearedMaxId])

  // Color mapping badges for different security event categories
  const EVENT_TYPE_COLORS = {
    logon: 'text-emerald-600 dark:text-emerald-400',
    failed_logon: 'text-red-600 dark:text-red-400',
    process_creation: 'text-slate-800 dark:text-slate-200',
    network_connection: 'text-amber-600 dark:text-amber-400',
    file_created: 'text-slate-600 dark:text-slate-300',
  }

  const formatTime = (ts) => {
    if (!ts) return '—'
    try {
      const d = new Date(ts)
      return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleTimeString()
    } catch {
      return String(ts)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-surface-base p-4 border border-slate-200/90 dark:border-border-base rounded shadow-xs theme-transition">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Telemetry Event Stream
              </h2>
              {clearedAt ? (
                <>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                    {visibleEvents.length} DISPLAYED
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-semibold flex items-center gap-1">
                    <EyeOff className="w-3 h-3" />
                    {events.length - visibleEvents.length} HISTORICAL HIDDEN
                  </span>
                </>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold">
                  {events.length} INGESTED EVENTS
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              High-throughput raw Windows Security Event Logs and Sysmon telemetry passing through correlation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {clearedAt && (
            <button
              onClick={handleRestoreHistory}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
              title="Restore full historical event logs in view"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore History
            </button>
          )}

          {/* Live Auto-Refresh Selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-2 py-1 rounded-lg text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${autoRefreshInterval !== 'off' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className="text-[10px] text-slate-500 uppercase font-semibold mr-0.5">Live:</span>
            {['off', '3s', '5s', '10s'].map((opt) => (
              <button
                key={opt}
                onClick={() => setAutoRefreshInterval(opt)}
                className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold transition cursor-pointer ${
                  autoRefreshInterval === opt
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
                title={`Set auto-refresh to ${opt}`}
              >
                {opt}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowClearModal(true)}
            disabled={visibleEvents.length === 0 && events.length === 0}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-surface-elevated dark:hover:bg-surface-interactive border border-slate-200/90 dark:border-border-base text-slate-700 dark:text-text-secondary rounded text-xs font-mono flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Clear events view"
            aria-label="Clear View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear View
          </button>

          <button
            onClick={load}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Visibility Boundary Status Notice */}
      {clearedAt && (
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg text-xs font-mono text-amber-800 dark:text-amber-300 theme-transition">
          <div className="flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Visibility boundary active:</strong> Prior events are hidden from this view. All {events.length} records remain safely stored in the database.
            </span>
          </div>
          <button
            onClick={handleRestoreHistory}
            className="underline font-semibold hover:text-amber-950 dark:hover:text-amber-100 ml-3 cursor-pointer shrink-0"
          >
            Restore All ({events.length})
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px]">
            <Laptop className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-slate-500"
              placeholder="Filter by device ID..."
              value={filter.device_id}
              onChange={(e) => setFilter((f) => ({ ...f, device_id: e.target.value }))}
            />
          </div>

          <div className="relative min-w-[220px]">
            <Terminal className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-slate-500"
              placeholder="Filter by event type..."
              value={filter.event_type}
              onChange={(e) => setFilter((f) => ({ ...f, event_type: e.target.value }))}
            />
          </div>

          {(filter.device_id || filter.event_type) && (
            <button
              onClick={() => setFilter({ device_id: '', event_type: '' })}
              className="text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </Card>

      {/* Event Stream Table */}
      <Card>
        <SectionHeader
          title={`Telemetry Log Records (${visibleEvents.length}${clearedAt ? ` / ${events.length} total` : ''})`}
          subtitle={clearedAt ? 'Showing new telemetry records arriving after visibility clear' : 'Normalized event timeline sorted by ingestion order'}
        />

        {loading && visibleEvents.length === 0 && events.length === 0 ? (
          <Spinner message="Streaming telemetry records..." />
        ) : visibleEvents.length === 0 ? (
          clearedAt ? (
            <div className="py-12 px-4 text-center">
              <div className="inline-flex p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 mb-3">
                <EyeOff className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
                No new events
              </h3>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 mb-4">
                Events received after clearing will appear here. All {events.length} past events remain safely stored in the database.
              </p>
              <button
                onClick={handleRestoreHistory}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white/90 rounded-lg text-xs font-mono font-medium transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore History ({events.length} Events)
              </button>
            </div>
          ) : (
            <EmptyState
              icon={<Activity className="w-6 h-6 text-slate-400" />}
              title="Zero Telemetry Events Ingested"
              message="No events recorded. Connect the SentinelTwin Windows Sensor to capture real-time security events."
            />
          )
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs font-mono text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Device / Host</th>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Process Name</th>
                  <th className="py-2.5 px-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {visibleEvents.map((e, idx) => {
                  const evType = (e.event_type || '').toLowerCase()
                  const typeColor = EVENT_TYPE_COLORS[evType] || 'text-slate-700 dark:text-slate-300'

                  return (
                    <tr
                      key={e.id || idx}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-2 px-3 text-slate-500 whitespace-nowrap text-[11px]">
                        {formatTime(e.timestamp || e.event_timestamp || e.ingested_at || e.created_at)}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {e.hostname || e.device_id || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                        {e.username || e.user || '—'}
                      </td>
                      <td className={`py-2 px-3 font-semibold ${typeColor}`}>
                        {e.event_type || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-[11px]">
                        {e.event_id ? `#${e.event_id}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium truncate max-w-xs">
                        {e.process_name || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-400 text-[11px]">
                        {e.source || 'Sysmon / Security'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Confirmation Modal via Portal */}
      {showClearModal && typeof document !== 'undefined' && createPortal(
        <div
          role="button"
          tabIndex={0}
          aria-label="Close modal backdrop"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 cursor-default"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowClearModal(false)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' '))) {
              setShowClearModal(false)
            }
          }}
        >
          <div
            className="bg-white dark:bg-surface-base border border-slate-200/90 dark:border-border-base rounded-lg p-5 shadow-2xl max-w-md w-full theme-transition"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-600 dark:text-amber-400 shrink-0">
                <EyeOff className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
                  Clear Events View
                </h3>
                <p className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                  This operation is strictly client-side. It will hide past events from your current view and reset filters.
                </p>
                <div className="mt-3 p-2.5 rounded bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Database Safety:</span> All historical event records remain safely stored in the database. Use <span className="font-semibold text-slate-700 dark:text-slate-200">Restore History</span> at any time to unhide them.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleClearEvents}
                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear View
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default Events