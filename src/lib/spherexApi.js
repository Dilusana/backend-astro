import { apiUrl } from './apiUrl'

export async function fetchSpherexObservations({ raDeg, decDeg }, signal) {
  const params = new URLSearchParams({
    ra: String(raDeg),
    dec: String(decDeg),
  })
  const response = await fetch(apiUrl(`/api/spherex/observations?${params}`), { signal })
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const detail = body && typeof body.detail === 'string' ? body.detail : null
    throw new Error(detail || 'The SPHEREx archive request failed.')
  }
  if (!body || !Array.isArray(body.observations)) {
    throw new Error('The SPHEREx service returned an unreadable payload.')
  }
  return body
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
    throw new Error(detail || 'The Astro AI service is unavailable.')
  }
  return body
}

