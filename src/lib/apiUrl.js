const apiBaseUrl = import.meta.env.DEV
  ? import.meta.env.VITE_API_BASE_URL || ''
  : ''

export function apiUrl(path) {
  const base = apiBaseUrl.replace(/\/+$/, '')
  const endpoint = path.replace(/^\/+/, '')
  return `${base}/${endpoint}`
}
