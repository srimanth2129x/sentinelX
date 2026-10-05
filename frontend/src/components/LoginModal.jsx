import React, { useState } from 'react'
import { Shield, Lock, User, AlertCircle, X, CheckCircle2 } from 'lucide-react'
import { login } from '../api/client'

export function LoginModal({ isOpen, onClose, onLoginSuccess, initialError }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError || '')

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Please provide both username and password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const data = await login(username.trim(), password.trim())
      onLoginSuccess?.(data)
      onClose?.()
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Authentication failed. Please verify credentials.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-surface-base border border-slate-200 dark:border-border-base rounded-lg w-full max-w-md shadow-2xl overflow-hidden theme-transition">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-border-base">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-slate-900 dark:bg-surface-elevated text-emerald-400 border border-slate-700">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-text-primary tracking-tight">
                SentinelTwin Authentication
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-text-secondary">
                SOC Console Administrator / Analyst Login
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-text-secondary mb-1.5">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or analyst"
                required
                autoFocus
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-surface-elevated border border-slate-300 dark:border-border-base rounded text-sm text-slate-900 dark:text-text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-text-secondary mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-surface-elevated border border-slate-300 dark:border-border-base rounded text-sm text-slate-900 dark:text-text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded text-sm transition cursor-pointer shadow-xs"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[11px] text-center text-slate-400 dark:text-text-faint">
            Default credentials are intentionally disabled. Admin account is initialized via server environment bootstrap.
          </p>
        </form>
      </div>
    </div>
  )
}

export default LoginModal
