import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from 'motion/react'
import { cn } from '@/lib/utils'

const DockContext = createContext(undefined)
const DockItemContext = createContext({ isHovered: false, isActive: false, collapsed: false })

export function useDock() {
  const context = useContext(DockContext)
  if (!context) {
    throw new Error('useDock must be used within a DockProvider')
  }
  return context
}

export function useDockItem() {
  return useContext(DockItemContext)
}

/**
 * Motion Primitives Dock adapted for Vertical & Horizontal enterprise navigation.
 * Uses restrained spring physics suitable for cybersecurity SOC consoles.
 */
export function Dock({
  children,
  className,
  direction = 'vertical',
  spring = { mass: 0.1, stiffness: 220, damping: 18 },
  distance = 100,
  magnification = 1.06,
  role = 'navigation',
  'aria-label': ariaLabel = 'Sidebar Navigation',
  ...props
}) {
  const mousePos = useMotionValue(Infinity)
  const isHovered = useMotionValue(0)
  const containerRef = useRef(null)

  const handleMouseMove = (e) => {
    isHovered.set(1)
    if (direction === 'vertical') {
      mousePos.set(e.clientY)
    } else {
      mousePos.set(e.clientX)
    }
  }

  const handleMouseLeave = () => {
    isHovered.set(0)
    mousePos.set(Infinity)
  }

  const contextValue = useMemo(
    () => ({
      mousePos,
      isHovered,
      spring,
      distance,
      magnification,
      direction,
    }),
    [mousePos, isHovered, spring, distance, magnification, direction]
  )

  return (
    <nav
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      role={role}
      aria-label={ariaLabel}
      className={cn('relative flex', direction === 'vertical' ? 'flex-col' : 'flex-row items-center', className)}
      {...props}
    >
      <DockContext.Provider value={contextValue}>
        {children}
      </DockContext.Provider>
    </nav>
  )
}

export function DockItem({
  children,
  className,
  onClick,
  isActive = false,
  collapsed = false,
  ariaLabel,
  ...props
}) {
  const ref = useRef(null)
  const { mousePos, spring, distance, magnification, direction } = useDock()
  const [hovered, setHovered] = useState(false)

  // Distance calculation based on vertical (Y) or horizontal (X) mouse position
  const mouseDistance = useTransform(mousePos, (val) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || val === Infinity) return Infinity
    const center = direction === 'vertical' ? rect.y + rect.height / 2 : rect.x + rect.width / 2
    return val - center
  })

  // Restrained spring magnification: between 1.0 and magnification (e.g. 1.05)
  const scaleTransform = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [1, magnification, 1]
  )
  const scale = useSpring(scaleTransform, spring)

  const itemContextValue = useMemo(
    () => ({ isHovered: hovered, isActive, collapsed }),
    [hovered, isActive, collapsed]
  )

  return (
    <DockItemContext.Provider value={itemContextValue}>
      <motion.button
        ref={ref}
        type="button"
        style={collapsed ? { scale } : undefined}
        whileTap={{ scale: 0.98 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative group flex items-center transition-colors outline-none cursor-pointer select-none text-left',
          'focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900',
          className
        )}
        {...props}
      >
        {children}
      </motion.button>
    </DockItemContext.Provider>
  )
}

export function DockIcon({ children, className }) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center shrink-0 transition-colors',
        className
      )}
    >
      {children}
    </div>
  )
}

export function DockLabel({
  children,
  className,
  side = 'right',
}) {
  const { isHovered, collapsed } = useDockItem()

  // If not collapsed, don't show as a floating tooltip; caller will render normal text
  if (!collapsed) return null

  return (
    <AnimatePresence>
      {isHovered && (
        <motion.div
          initial={{ opacity: 0, x: side === 'right' ? -6 : 6, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: side === 'right' ? -4 : 4, scale: 0.96 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium shadow-md border',
            'bg-slate-900 text-slate-100 border-slate-700/80 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700',
            side === 'right' ? 'left-full ml-3 top-1/2 -translate-y-1/2' : 'right-full mr-3 top-1/2 -translate-y-1/2',
            className
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
