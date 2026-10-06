import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const TOKEN_STORAGE_KEY = 'sentinel_auth_token'
const USER_STORAGE_KEY = 'sentinel_auth_user'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// --- Session & Token Management ---

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAuthSession(token, user) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    }
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
    }
  } catch (err) {
    console.warn('Failed to persist auth session to localStorage:', err)
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
  } catch (err) {
    console.warn('Failed to clear auth session from localStorage:', err)
  }
}

export function isAuthenticated() {
  return Boolean(getAuthToken())
}

// Request Interceptor: Attach JWT Bearer token
api.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, (error) => Promise.reject(error))

// Response Interceptor: Handle 401 Unauthorized and 403 Forbidden
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const message = error.response?.data?.error || error.message

    if (status === 401) {
      // Clear expired / invalid token
      clearAuthSession()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel-auth-error', {
          detail: { status: 401, message: message || 'Authentication required or session expired.' }
        }))
      }
    } else if (status === 403) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel-auth-error', {
          detail: { status: 403, message: message || 'Access forbidden: Insufficient privileges.' }
        }))
      }
    }

    return Promise.reject(error)
  }
)

// --- Authentication Endpoints ---

export async function login(username, password) {
  const res = await api.post('/auth/login', { username, password })
  if (res.data?.token) {
    const user = { username: res.data.username || username, role: res.data.role || 'Administrator' }
    setAuthSession(res.data.token, user)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sentinel-auth-login', { detail: user }))
    }
  }
  return res.data
}

export function logout() {
  clearAuthSession()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sentinel-auth-logout'))
  }
}

// --- System Status & Health Check ---
export const getStatus = () => api.get('/system/status')
export const getSystemStatus = () => api.get('/system/status')
export const getHealth = () => api.get('/health')

// --- Dashboard Aggregates ---
export const getDashboardSummary = () => api.get('/dashboard/summary')
export const getDashboard = () => api.get('/dashboard/summary')

// --- Network Discovery, Monitoring & Interfaces ---
export const getNetworkInterfaces = () => api.get('/network/interfaces')
export const getDiscoveredDevices = () => api.get('/network/devices')
export const triggerDiscovery = (data) => api.post('/network/discover', data)

export function streamDiscovery({ interface_ip, subnet, onDevice, onComplete, onError, signal }) {
  const token = getAuthToken()
  const params = new URLSearchParams()
  if (interface_ip) params.set('interface_ip', interface_ip)
  if (subnet) params.set('subnet', subnet)
  if (token) params.set('token', token)

  const url = `${API_BASE_URL}/network/discover/stream?${params.toString()}`
  const headers = { Accept: 'text/event-stream' }
  if (token) headers.Authorization = `Bearer ${token}`

  fetch(url, { headers, signal })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Streaming failed: HTTP ${response.status}`)
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const rawJson = trimmed.slice(5).trim()
          if (!rawJson) continue
          try {
            const data = JSON.parse(rawJson)
            if (data.type === 'device' && onDevice) {
              onDevice(data.device, data.count)
            } else if (data.type === 'complete' && onComplete) {
              onComplete(data.total)
            } else if (data.type === 'error' && onError) {
              onError(new Error(data.error))
            }
          } catch (e) {
            console.debug('Failed to parse SSE event:', e)
          }
        }
      }
      if (onComplete) onComplete()
    })
    .catch((err) => {
      if (err.name === 'AbortError') return
      if (onError) onError(err)
    })
}

export const startMonitoring = (data) => api.post('/network/monitoring/start', data)
export const stopMonitoring = () => api.post('/network/monitoring/stop')
export const getMonitoringStatus = () => api.get('/network/monitoring/status')
export const clearDiscoveredDevices = () => api.post('/network/devices/clear')

// --- Cyber Twin Topology & Simulations ---
export const getTopology = () => api.get('/network/topology')
export const runSimulation = (data) => api.post('/simulation/run', data)
export const getSimulationResults = () => api.get('/simulation/results')

// --- CyberDNA & Behavioral Analytics ---
export const getCyberDNAUsers = () => api.get('/cyberdna/users')
export const getCyberDNAUser = (userId) => api.get(`/cyberdna/profile/${userId}`)
export const getCyberDNAProfile = (userId) => api.get(`/cyberdna/profile/${userId}`)
export const getCyberDNABaselines = (userId) => api.get(`/cyberdna/profile/${userId}`)

// --- Events, Alerts & Incidents ---
export const getEvents = (params) => api.get('/events', { params })
export const clearEvents = () => api.post('/events/clear')
export const getAlerts = (params) => api.get('/alerts', { params })
export const updateAlert = (alertId, data) => api.patch(`/alerts/${alertId}`, data)
export const getIncidents = (params) => api.get('/incidents', { params })
export const getIncident = (incidentId) => api.get(`/incidents/${incidentId}`)
export const createIncident = (data) => api.post('/incidents', data)
export const updateIncident = (incidentId, data) => api.patch(`/incidents/${incidentId}`, data)

// --- Device Risk & Inventory ---
export const getRiskSummary = () => api.get('/risk/summary')
export const getRiskDevices = () => api.get('/risk/devices')
export const getDevices = (params) => api.get('/devices', { params })
export const getAllDevices = (params) => api.get('/devices', { params })
export const getDeviceDetails = (deviceId) => api.get(`/devices/${deviceId}`)
export const getDevice = (deviceId) => api.get(`/devices/${deviceId}`)
export const authorizeDevice = (deviceId) => api.post(`/devices/${deviceId}/authorize`)
export const revokeDevice = (deviceId) => api.post(`/devices/${deviceId}/revoke`)

export default api