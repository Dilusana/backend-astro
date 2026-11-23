import { apiUrl } from './apiUrl'

const ARCHIVE_RETRY_DELAYS_MS = [2000, 5000, 10000, 20000]
const RETRYABLE_ARCHIVE_STATUSES = new Set([429, 502, 503, 504])

function waitForRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function archiveRetryDelay(response, retryIndex) {
  const retryAfter = response.headers.get('Retry-After')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) {
      return Math.max(1000, Math.min(seconds * 1000, 30000))
    }
    const retryAt = Date.parse(retryAfter)
    if (Number.isFinite(retryAt)) {
      return Math.max(1000, Math.min(retryAt - Date.now(), 30000))
    }
  }
  return ARCHIVE_RETRY_DELAYS_MS[retryIndex]
}

export async function fetchSpherexObservations({ raDeg, decDeg }, signal) {
  const params = new URLSearchParams({
    ra: String(raDeg),
    dec: String(decDeg),
  })
  const url = apiUrl(`/api/spherex/observations?${params}`)

  for (let retryIndex = 0; ; retryIndex += 1) {
    let response
    try {
      response = await fetch(url, { signal })
    } catch (error) {
      if (signal?.aborted || retryIndex >= ARCHIVE_RETRY_DELAYS_MS.length) throw error
      await waitForRetry(ARCHIVE_RETRY_DELAYS_MS[retryIndex], signal)
      continue
    }

    let body = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    if (!response.ok) {
      if (RETRYABLE_ARCHIVE_STATUSES.has(response.status) && retryIndex < ARCHIVE_RETRY_DELAYS_MS.length) {
        await waitForRetry(archiveRetryDelay(response, retryIndex), signal)
        continue
      }
      const detail = body && typeof body.detail === 'string' ? body.detail : null
      throw new Error(detail || `The SPHEREx archive request failed (HTTP ${response.status}).`)
    }
    if (!body || !Array.isArray(body.observations)) {
      throw new Error('The SPHEREx service returned an unreadable payload.')
    }
    return body
  }
}

export async function fetchSpherexCompare({ fitsUrl1, fitsUrl2, ra, dec, sizeDeg = 0.04, interpolation = 'nearest' }, signal) {
  const params = new URLSearchParams({
    fits_url_1: fitsUrl1,
    fits_url_2: fitsUrl2,
    ra: String(ra),
    dec: String(dec),
    size_deg: String(sizeDeg),
    interpolation: String(interpolation),
  })
  const response = await fetch(apiUrl(`/api/spherex/compare?${params}`), { signal })
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const detail = body && typeof body.detail === 'string' ? body.detail : null
    throw new Error(detail || 'The multi-epoch comparison request failed.')
  }
  if (!body || !body.epoch1 || !body.epoch2 || !body.registration) {
    throw new Error('The comparison service returned an invalid registration structure.')
  }
  return body
}

export async function fetchAstroAiChat({ message, targetId, context, history }, signal) {
  const response = await fetch(apiUrl('/api/ai/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      target_id: targetId || null,
      context: context || null,
      history: history || null,
    }),
    signal,
  })
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const detail = body && typeof body.detail === 'string' ? body.detail : null
    throw new Error(detail || `The Astro AI service is unavailable (HTTP ${response.status}).`)
  }
  if (!body || typeof body.text !== 'string' || !body.text.trim()) {
    throw new Error('The Astro AI service returned an empty response.')
  }
  return body
}

