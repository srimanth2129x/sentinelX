import React, { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  LayoutDashboard,
  Network,
  Share2,
  Dna,
  Activity,
  BellRing,
  ShieldAlert,
  Gauge,
  Laptop,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Dock, DockItem, DockIcon, DockLabel } from './motion-primitives/dock'

const NAV_GROUPS = [
  {
    title: 'CORE',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    ],
  },
  {
    title: 'MONITOR',
    items: [
      { id: 'devices', label: 'Devices', icon: Laptop },
      { id: 'events', label: 'Events', icon: Activity },
      { id: 'alerts', label: 'Alerts', icon: BellRing, badgeKey: 'alerts' },
    ],
  },
  {
    title: 'INTELLIGENCE',
    items: [
      { id: 'cyberdna', label: 'CyberDNA', icon: Dna },
      { id: 'risk', label: 'Risk Analysis', icon: Gauge },
      { id: 'incidents', label: 'Incidents', icon: ShieldAlert, badgeKey: 'incidents' },
    ],
  },
  {
    title: 'DIGITAL TWIN',
    items: [
      { id: 'network', label: 'Network', icon: Network },
      { id: 'cybertwin', label: 'Digital Twin & Sims', icon: Share2 },
    ],
  },
]

export function Sidebar({ active, onNav, alertCount = 0, incidentCount = 0 }) {
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getBadgeCount = (key) => {
    if (key === 'alerts') return alertCount
    if (key === 'incidents') return incidentCount
    return 0
  }

  return (
    <aside
      className={`relative shrink-0 bg-white dark:bg-surface-base border-r border-slate-200/90 dark:border-border-base flex flex-col justify-between py-3 transition-[width] duration-200 select-none z-20 theme-transition ${
        collapsed ? 'w-[68px]' : 'w-60'
      }`}
    >
      {/* Motion Primitives Vertical Dock Navigation */}
      <div className={`flex-1 px-2 space-y-3 ${collapsed ? 'overflow-visible' : 'overflow-y-auto'}`}>
        <Dock
          direction="vertical"
          distance={90}
          magnification={collapsed ? 1.05 : 1}
          className="w-full space-y-3"
          aria-label="Security Operations Navigation"
        >
          {NAV_GROUPS.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              {!collapsed ? (
                <div className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-slate-400 dark:text-text-muted uppercase">
                  {group.title}
                </div>
              ) : (
                <div className="mx-auto w-6 border-t border-slate-200 dark:border-border-subtle my-1 first:hidden" />
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = active === item.id
                  const count = getBadgeCount(item.badgeKey)
                  const tooltipText = count > 0 ? `${item.label} (${count})` : item.label

                  return (
                    <DockItem
                      key={item.id}
                      onClick={() => onNav(item.id)}
                      isActive={isActive}
                      collapsed={collapsed}
                      ariaLabel={tooltipText}
                      className={`w-full relative rounded transition-colors ${
                        collapsed
                          ? 'h-10 justify-center'
                          : 'h-9 px-3 gap-3 justify-start'
                      } ${
                        isActive
                          ? 'text-slate-900 dark:text-text-primary font-semibold bg-slate-100 dark:bg-surface-interactive shadow-xs'
                          : 'text-slate-600 dark:text-text-secondary hover:text-slate-900 dark:hover:text-text-primary hover:bg-slate-100/70 dark:hover:bg-surface-interactive/60'
                      }`}
                    >
                      {/* Active Spring Indicator Bar (expanded mode) */}
                      {isActive && !collapsed && (
                        <motion.span
                          layoutId="activeNavPill"
                          className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        />
                      )}

                      {/* Active indicator dot (collapsed mode) */}
                      {isActive && collapsed && (
                        <motion.span
                          layoutId="activeNavDot"
                          className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3 rounded-full bg-emerald-500"
                          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        />
                      )}

                      <DockIcon>
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive
                              ? 'text-slate-900 dark:text-text-primary'
                              : 'text-slate-500 dark:text-text-muted group-hover:text-slate-800 dark:group-hover:text-text-secondary'
                          }`}
                        />
                      </DockIcon>

                      {/* Expanded text label */}
                      {!collapsed && (
                        <span className="truncate text-xs tracking-normal">
                          {item.label}
                        </span>
                      )}

                      {/* Expanded count badge */}
                      {!collapsed && count > 0 && (
                        <span
                          className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            item.badgeKey === 'alerts'
                              ? 'bg-primary text-status-hostile-fg shadow-xs'
                              : 'bg-surface-elevated border border-border-strong text-text-primary'
                          }`}
                        >
                          {count}
                        </span>
                      )}

                      {/* Collapsed dot badge */}
                      {collapsed && count > 0 && (
                        <span
                          className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                            item.badgeKey === 'alerts' ? 'bg-primary' : 'bg-status-elevated'
                          }`}
                        />
                      )}

                      {/* Collapsed floating tooltip via DockLabel */}
                      <DockLabel side="right">
                        <div className="flex items-center gap-1.5">
                          <span>{item.label}</span>
                          {count > 0 && (
                            <span
                              className={`px-1 py-0.2 rounded text-[10px] font-mono ${
                                item.badgeKey === 'alerts'
                                  ? 'bg-red-500/20 text-red-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {count}
                            </span>
                          )}
                        </div>
                      </DockLabel>
                    </DockItem>
                  )
                })}
              </div>
            </div>
          ))}
        </Dock>
      </div>

      {/* Footer Collapse Toggle */}
      <div className="pt-2 px-2 border-t border-slate-200/90 dark:border-border-base">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`w-full flex items-center gap-2 p-2 rounded text-xs text-slate-500 dark:text-text-muted hover:text-slate-900 dark:hover:text-text-primary hover:bg-slate-100/80 dark:hover:bg-surface-interactive transition cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 outline-none ${
            collapsed ? 'justify-center' : 'justify-start'
          }`}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-medium tracking-wide">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
