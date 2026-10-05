import React, { useEffect, useState, useCallback } from 'react'
import { getStatus, getNetworkInterfaces, getIncidents } from './api/client'
import { ThemeProvider } from './context/ThemeContext'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'

import Overview from './pages/Overview'
import Network from './pages/Network'
import CyberTwin from './pages/CyberTwin'
import CyberDNA from './pages/CyberDNA'
import Events from './pages/Events'
import Alerts from './pages/Alerts'
import Incidents from './pages/Incidents'
import RiskIntel from './pages/RiskIntel'
import Devices from './pages/Devices'

function AppContent() {
  const [page, setPage] = useState('overview')
  const [status, setStatus] = useState({
    status: 'operational',
    online_devices: 0,
    total_devices: 0,
    active_sensors: 0,
    open_alerts: 0,
    open_incidents: 0,
    total_events: 0,
    discovery_active: false,
    is_monitoring: false,
    subnet: '192.168.0.0/24',
  })

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, ifaceRes, incRes] = await Promise.all([
        getStatus().catch(() => ({ data: {} })),
        getNetworkInterfaces().catch(() => ({ data: [] })),
        getIncidents().catch(() => ({ data: [] })),
      ])

      const d = statusRes?.data || {}
      const ifaceList = Array.isArray(ifaceRes.data) ? ifaceRes.data : []
      const activeIface = ifaceList.find(i => i.ip && !i.ip.startsWith('169.254.') && !i.ip.startsWith('127.')) || ifaceList[0]
      const subnetStr = activeIface?.ip ? `${activeIface.ip.rsplit ? activeIface.ip.rsplit('.', 1)[0] : activeIface.ip.split('.').slice(0, 3).join('.')}.0/24` : '192.168.0.0/24'

      const incList = Array.isArray(incRes.data) ? incRes.data : []
      const openIncs = incList.filter(i => (i.status || '').toUpperCase() !== 'RESOLVED').length

      const online = d.online_devices ?? d.devices_online ?? d.devices?.online ?? 0
      const rawTotal = d.total_devices ?? d.devices_total ?? d.devices?.total ?? 0
      const total = rawTotal >= online && rawTotal > 0 ? rawTotal : online

      setStatus({
        status: d.status || 'operational',
        online_devices: online,
        total_devices: total,
        devices_online: online,
        devices_total: total,
        active_sensors: d.active_sensors ?? d.sensors_connected ?? d.sensors?.connected ?? 0,
        open_alerts: d.open_alerts ?? d.active_alerts ?? d.alerts_count ?? d.alerts?.open ?? 0,
        open_incidents: openIncs,
        total_events: d.total_events ?? d.events_count ?? d.events?.total ?? 0,
        discovery_active: Boolean(d.discovery_active || d.is_monitoring || d.network?.discovery_active),
        is_monitoring: Boolean(d.is_monitoring || d.discovery_active || d.network?.discovery_active),
        subnet: subnetStr,
      })
    } catch (err) {
      console.debug('Status polling error:', err)
    }
  }, [])

  useEffect(() => {
    loadStatus().catch(() => {})
    const interval = setInterval(() => {
      loadStatus().catch(() => {})
    }, 4000)
    return () => clearInterval(interval)
  }, [loadStatus])

  const alertCount = status.open_alerts ?? 0
  const incidentCount = status.open_incidents ?? 0

  const pages = {
    overview: <Overview onNav={setPage} />,
    network: <Network onDiscoveryChange={loadStatus} />,
    cybertwin: <CyberTwin />,
    cyberdna: <CyberDNA />,
    events: <Events />,
    alerts: <Alerts onAlertChange={loadStatus} />,
    incidents: <Incidents />,
    risk: <RiskIntel />,
    devices: <Devices onNav={setPage} />,
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100 dark:bg-bg-page text-slate-900 dark:text-text-primary theme-transition">
      {/* 1. TOP EXECUTIVE BAR */}
      <TopBar status={status} onRefresh={loadStatus} />

      {/* 2. BODY: SIDEBAR + MAIN CONTENT ROUTER */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          active={page}
          onNav={setPage}
          alertCount={alertCount}
          incidentCount={incidentCount}
        />

        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 2xl:p-8 bg-[#f8fafc]/80 dark:bg-bg-page relative w-full">
          <div key={page} className="page-enter w-full max-w-[2560px] mx-auto">
            {pages[page] || (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Page "{page}" not found.
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 3. BOTTOM SYSTEM STATUS BAR */}
      <StatusBar status={status} />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}