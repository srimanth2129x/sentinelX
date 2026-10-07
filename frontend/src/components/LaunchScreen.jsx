import React, { useEffect, useRef, useState } from 'react'
import lottie from 'lottie-web/build/player/lottie_light'
import launchAnimationData from '../assets/sentinel-launch.json'

/**
 * SentinelTwin Launch Screen
 * 
 * Plays a polished shield entrance, light sweep, geometric breakup,
 * and upward/outward sweep transition into the active SOC dashboard.
 * 
 * - Built with Lottie Creator MCP exported animation
 * - Respects prefers-reduced-motion
 * - Auto-recovers on any playback error
 * - Fully cleans up animations and listeners on unmount
 */
export function LaunchScreen({ onComplete }) {
  const containerRef = useRef(null)
  const animRef = useRef(null)
  const [fadingOut, setFadingOut] = useState(false)
  const [hasReducedMotion, setHasReducedMotion] = useState(false)

  useEffect(() => {
    // 1. Check for user reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mediaQuery.matches) {
      setHasReducedMotion(true)
      // Brief subtle fade for reduced motion users
      const fadeTimer = setTimeout(() => setFadingOut(true), 500)
      const exitTimer = setTimeout(() => {
        if (onComplete) onComplete()
      }, 900)

      return () => {
        clearTimeout(fadeTimer)
        clearTimeout(exitTimer)
      }
    }

    let isMounted = true
    let completeCalled = false

    const handleComplete = () => {
      if (window.__sentinelHoldFrame) return
      if (completeCalled) return
      completeCalled = true
      setFadingOut(true)
      setTimeout(() => {
        if (isMounted && onComplete) {
          onComplete()
        }
      }, 450)
    }

    // Safety fallback timer (2.9s max) so dashboard is never blocked
    const fallbackTimer = setTimeout(() => {
      if (!window.__sentinelHoldFrame) {
        handleComplete()
      }
    }, 2900)

    // Fade-out trigger timer (~2.0s into the 2.6s animation when breakup sweeps upward/outward)
    const fadeTriggerTimer = setTimeout(() => {
      if (isMounted && !window.__sentinelHoldFrame) {
        setFadingOut(true)
      }
    }, 2050)

    try {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          animationData: launchAnimationData,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
            hideOnTransparent: true,
          },
        })
        window.__sentinelLaunchAnim = animRef.current

        animRef.current.addEventListener('complete', () => {
          if (!window.__sentinelHoldFrame) {
            handleComplete()
          }
        })

        animRef.current.addEventListener('data_failed', () => {
          handleComplete()
        })

        animRef.current.addEventListener('error', () => {
          handleComplete()
        })
      }
    } catch (err) {
      console.warn('Lottie launch animation initialization notice:', err)
      handleComplete()
    }

    return () => {
      isMounted = false
      clearTimeout(fallbackTimer)
      clearTimeout(fadeTriggerTimer)
      delete window.__sentinelLaunchAnim
      if (animRef.current) {
        try {
          animRef.current.destroy()
        } catch {}
        animRef.current = null
      }
    }
  }, [onComplete])

  return (
    <div
      aria-label="SentinelTwin Application Launching"
      role="status"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050505] transition-opacity duration-500 ease-out select-none ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background subtle radial gradient aura */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.07)_0%,transparent_70%)] pointer-events-none" />

      {/* Main Lottie animation or static fallback */}
      <div className="relative z-10 flex flex-col items-center">
        {hasReducedMotion ? (
          <div className="w-36 h-36 flex items-center justify-center animate-pulse">
            <svg viewBox="0 0 48 48" className="w-28 h-28" fill="none">
              <rect width="48" height="48" rx="12" fill="#030712" />
              <path
                d="M24 6L9 12V23C9 32.5 15.4 41.3 24 44C32.6 41.3 39 32.5 39 23V12L24 6Z"
                fill="#082f49"
                stroke="#06b6d4"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d="M24 13L15 17V24C15 30 18.8 35.8 24 38C29.2 35.8 33 30 33 24V17L24 13Z"
                fill="#0e7490"
                fillOpacity="0.5"
              />
              <circle cx="24" cy="24" r="3.5" fill="#22d3ee" />
              <path
                d="M24 17V20.5M24 27.5V31M17 24H20.5M27.5 24H31"
                stroke="#22d3ee"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-72 h-72 sm:w-88 sm:h-88 md:w-96 md:h-96 max-w-[90vw] max-h-[80vh] flex items-center justify-center"
          />
        )}

        {/* Minimal tactical telemetry subtitle */}
        <div className={`mt-2 flex items-center gap-2 px-3 py-1 rounded bg-[#0c0c0e]/80 border border-[#26262a] transition-all duration-300 ${
          fadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-mono text-[11px] tracking-wider text-zinc-400 uppercase">
            Sentinel<span className="text-white font-semibold">Twin</span> // Initializing Platform
          </span>
        </div>
      </div>
    </div>
  )
}
