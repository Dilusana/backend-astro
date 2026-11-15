import { useEffect, useState } from 'react'
import SkyTimeMachine from './SkyTimeMachine'
import { apiUrl } from '../lib/apiUrl'

function formatWavelength(min, max) {
  if (min == null || max == null) return 'Not in archive row'
  return `${min.toFixed(4)} – ${max.toFixed(4)} µm`
}

function formatExposure(seconds) {
  if (seconds == null) return 'Not in archive row'
  return `${seconds.toFixed(1)} s`
}

function formatDegrees(value) {
  if (value == null) return 'Not in archive row'
  return `${value.toFixed(5)}°`
}

function formatSize(kilobytes) {
  if (kilobytes == null) return null
  return `${Math.round(kilobytes).toLocaleString('en-US')} kB`
}

function formatDate(isoString) {
  if (!isoString) return 'Date unknown'
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return isoString
  }
}

/**
 * Requirement 9: Scientific Caution Card on brightness variations between visits.
 * Must explain SPHEREx Linear Variable Filters (LVF) and prevent false discovery claims.
 */
function ScientificCautionCard() {
  return (
    <div className="rounded-2xl border border-brass/50 bg-brass/10 p-4 text-ink">
      <div className="flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div className="space-y-1.5 text-xs leading-relaxed">
          <p className="font-semibold text-brass uppercase tracking-wider text-[0.7rem]">
            Scientific Caution: How to Read Repeat Observations
          </p>
          <p>
            <strong>Never interpret a brightness difference between observation dates as confirmed object motion or a new discovery.</strong>
          </p>
          <p className="text-ink/90">
            NASA SPHEREx employs <em>Linear Variable Filters (LVF)</em> where the measured infrared wavelength changes continuously across the detector surface.
            When the telescope visits the same coordinates on different dates, it frequently captures the target through different filter wavelengths or at varying scan angles.
          </p>
          <p className="text-muted text-[0.72rem]">
            Astronomers verify actual physical changes only after rigorous multi-spectral calibration and point-spread function fitting.
          </p>
        </div>
      </div>
    </div>
  )
}

function RepeatCoverage({ comparable, mode }) {
  const repeats = comparable.bands.filter((band) => band.repeat_coverage)

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-2xl border border-line bg-void/60 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[0.68rem] tracking-[0.16em] text-muted uppercase">
            {mode === 'explorer' ? '4. Multi-Epoch Repeat Coverage' : 'Temporal & Bandpass Coverage'}
          </p>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-[0.68rem] text-muted">
            {repeats.length} repeat {repeats.length === 1 ? 'band' : 'bands'}
          </span>
        </div>

        {repeats.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted">
              {mode === 'explorer'
                ? 'NASA SPHEREx has scanned these coordinates on multiple separate passes:'
                : 'Repeat visits detected across identical bandpasses separated by ≥ 1 day:'}
            </p>
            <ul className="space-y-2 text-sm text-ink">
              {repeats.map((band) => (
                <li key={band.bandpass} className="rounded-xl border border-line/60 bg-panel/60 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-glint">{band.bandpass}</span>
                    <span className="font-mono text-xs text-brass">
                      {band.distinct_obs_ids} visits over {band.span_days} days
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Earliest: <span className="text-ink">{formatDate(band.earliest)}</span> · Latest:{' '}
                    <span className="text-ink">{formatDate(band.latest)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {mode === 'explorer'
              ? 'This sky position has been observed in a single pass in this archive release. Check back as NASA releases further sky surveys.'
              : 'No bandpass in this response contains two observation IDs at least one day apart.'}
          </p>
        )}

        {comparable.uses_truncated_result && (
          <p className="mt-3 text-[0.72rem] leading-relaxed text-muted">
            The archive row limit was reached. Additional historical passes may exist in the full archive.
          </p>
        )}
      </div>

      {/* Requirement 9: Prominent Caution Card */}
      <ScientificCautionCard />
    </div>
  )
}

function FitsImageViewer({ observation, ra, dec, autoLoad = false, mode = 'explorer' }) {
  const [active, setActive] = useState(autoLoad)
  const [status, setStatus] = useState('idle')
  const [metadata, setMetadata] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [zoom, setZoom] = useState(2)
  const [pixelated, setPixelated] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const fitsUrl = observation.access_url
  const previewUrl =
    fitsUrl && ra != null && dec != null
      ? apiUrl(`/api/spherex/preview?fits_url=${encodeURIComponent(fitsUrl)}&ra=${ra}&dec=${dec}&size_deg=0.04`)
      : null
  const metaUrl =
    fitsUrl && ra != null && dec != null
      ? apiUrl(`/api/spherex/preview_meta?fits_url=${encodeURIComponent(fitsUrl)}&ra=${ra}&dec=${dec}&size_deg=0.04`)
      : null

  useEffect(() => {
    if (!active || !previewUrl) return

    let cancelled = false
    setStatus('loading')
    setErrorMsg(null)

    if (metaUrl) {
      fetch(`${metaUrl}&_t=${attempt}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((data) => {
          if (!cancelled) setMetadata(data)
        })
        .catch((err) => {
          console.warn('Metadata fetch warning:', err)
        })
    }

    const img = new Image()
    img.src = `${previewUrl}&_t=${attempt}`
    img.onload = () => {
      if (!cancelled) setStatus('loaded')
    }
    img.onerror = () => {
      if (!cancelled) {
        setStatus('error')
        setErrorMsg('The IRSA cutout request failed or timed out.')
      }
    }

    return () => {
      cancelled = true
    }
  }, [active, previewUrl, metaUrl, attempt])

  if (!fitsUrl) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-panel/30 p-3">
        <p className="text-xs text-muted">No trusted FITS access URL available for this observation.</p>
      </div>
    )
  }

  if (!active) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-brass/40 bg-panel/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-medium tracking-[0.16em] text-brass uppercase">
              {mode === 'explorer' ? 'Genuine NASA Image' : 'FITS Scientific Preview'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {mode === 'explorer'
                ? 'Load the real calibrated infrared image captured by NASA SPHEREx at this location.'
                : 'Level-2 SPHEREx cutout calibrated in MJy/sr with Asinh 99.5% stretch.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActive(true)}
            className="cursor-pointer rounded-full border border-brass/70 bg-brass/10 px-4 py-2 text-xs font-medium text-brass transition hover:bg-brass/20"
          >
            {mode === 'explorer' ? 'View NASA Infrared Cutout' : 'Extract & View FITS'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-panel/60 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          <p className="text-[0.68rem] font-semibold tracking-[0.16em] text-brass uppercase">
            {mode === 'explorer' ? 'Real NASA SPHEREx Infrared Cutout' : 'SPHEREx Level-2 FITS Cutout'}
          </p>
        </div>
        {status === 'loaded' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[0.68rem] text-muted uppercase">Zoom:</span>
            {[1, 2, 4].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={`cursor-pointer rounded px-2 py-0.5 font-mono text-xs transition ${
                  zoom === z ? 'border border-glint/40 bg-glint/20 text-glint' : 'text-muted hover:text-ink'
                }`}
              >
                {z}x
              </button>
            ))}
            <span className="text-muted/40">|</span>
            <button
              type="button"
              onClick={() => setPixelated((prev) => !prev)}
              className="cursor-pointer text-xs text-muted hover:text-glint"
              title="Toggle pixel smoothing"
            >
              {pixelated ? 'Pixel-crisp' : 'Smooth'}
            </button>
          </div>
        )}
      </div>

      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brass/30 border-t-brass" />
          <p className="mt-3 text-xs font-medium text-ink">
            {mode === 'explorer'
              ? 'Retrieving genuine NASA infrared data from California Institute of Technology / IPAC…'
              : 'Streaming Level-2 FITS cutout from NASA/IPAC IRSA and applying Asinh percentile stretch…'}
          </p>
          <p className="mt-1 text-[0.72rem] text-muted">
            Initial retrieval takes 5–15 seconds; subsequent requests are cached.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="py-6 text-center">
          <p className="text-xs font-medium text-red-300">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-3 cursor-pointer rounded-full border border-line px-4 py-1.5 text-xs text-glint hover:border-glint/50"
          >
            Retry Image Retrieval
          </button>
        </div>
      )}

      {status === 'loaded' && (
        <div className="mt-3 space-y-3">
          <div className="relative flex justify-center overflow-hidden rounded-xl border border-line bg-void/90 p-4">
            <div
              className="relative inline-block transition-all duration-150"
              style={{
                width: metadata?.dimensions ? Math.min(metadata.dimensions[0] * zoom * 6, 360) : 240,
                height: metadata?.dimensions ? Math.min(metadata.dimensions[1] * zoom * 6, 360) : 240,
                maxWidth: '100%',
              }}
            >
              <img
                src={`${previewUrl}&_t=${attempt}`}
                alt={`SPHEREx infrared spectral image for ${observation.obs_id}`}
                className="h-full w-full object-contain"
                style={{ imageRendering: pixelated ? 'pixelated' : 'auto' }}
              />

              {/* Coordinate Reticle Overlay */}
              {metadata?.target_pixel?.display_x != null &&
                metadata?.target_pixel?.display_y != null &&
                metadata.inside_footprint && (
                  <div
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${(metadata.target_pixel.display_x / metadata.dimensions[0]) * 100}%`,
                      top: `${(metadata.target_pixel.display_y / metadata.dimensions[1]) * 100}%`,
                    }}
                    title="Target coordinate position"
                  >
                    <div className="h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-400/20 shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
                  </div>
                )}
            </div>

            {/* Astronomical Orientation Compass */}
            <div className="absolute top-2 right-2 rounded-lg border border-line/50 bg-void/80 px-2.5 py-1 font-mono text-[0.65rem] text-muted backdrop-blur-xs">
              <span className="text-brass">N ↑</span> · <span className="text-glint">E ←</span>
            </div>
          </div>

          {/* Scientific Metadata & Calibration Badges */}
          <div className="grid grid-cols-2 gap-2 font-mono text-[0.7rem] text-muted sm:grid-cols-4">
            <div className="rounded-xl border border-line/40 bg-void/50 p-2.5">
              <span className="block text-[0.6rem] uppercase tracking-wider text-muted/70">
                {mode === 'explorer' ? 'Intensity Unit' : 'Flux Unit'}
              </span>
              <span className="font-semibold text-ink">{metadata?.bunit || 'MJy / sr'}</span>
            </div>
            <div className="rounded-xl border border-line/40 bg-void/50 p-2.5">
              <span className="block text-[0.6rem] uppercase tracking-wider text-muted/70">
                {mode === 'explorer' ? 'Brightness Range' : 'Flux Limits'}
              </span>
              <span className="text-ink">{metadata ? `${metadata.flux_min} to ${metadata.flux_max}` : '—'}</span>
            </div>
            <div className="rounded-xl border border-line/40 bg-void/50 p-2.5">
              <span className="block text-[0.6rem] uppercase tracking-wider text-muted/70">
                {mode === 'explorer' ? 'Resolution' : 'Pixel Scale'}
              </span>
              <span className="text-ink">
                {metadata?.wcs?.pixel_scale_arcsec ? `${metadata.wcs.pixel_scale_arcsec}″/px` : '6.15″/px'}
              </span>
            </div>
            <div className="rounded-xl border border-line/40 bg-void/50 p-2.5">
              <span className="block text-[0.6rem] uppercase tracking-wider text-muted/70">
                {mode === 'explorer' ? 'Target Position' : 'Footprint State'}
              </span>
              <span className={metadata?.inside_footprint ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                {metadata?.inside_footprint ? 'Target Centered' : 'Edge Coverage'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Raw Data & Provenance Links */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/40 pt-3 text-xs">
        <span className="text-[0.68rem] text-muted">
          {mode === 'explorer' ? 'Original NASA files:' : 'Direct scientific products:'}
        </span>
        <div className="flex flex-wrap gap-2">
          {observation.access_url && (
            <a
              href={observation.access_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line px-3 py-1 text-glint transition hover:border-glint/50"
            >
              Full FITS Cube ({formatSize(observation.access_estsize_kb) || 'spectral'}) ↗
            </a>
          )}
          {observation.cutout_url && (
            <a
              href={observation.cutout_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line px-3 py-1 text-ink transition hover:border-glint/50"
            >
              IRSA Cutout Link ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function ObservationCard({ observation, queryRa, queryDec, index, mode }) {
  const size = formatSize(observation.access_estsize_kb)
  const isExplorer = mode === 'explorer'

  return (
    <li className="rounded-2xl border border-line bg-void/50 p-4 sm:p-5 transition hover:border-line/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[0.65rem] tracking-[0.16em] text-muted uppercase">
            {isExplorer ? `Visit #${index + 1}` : 'Observation'}
          </span>
          <p className="mt-0.5 font-mono text-sm break-all text-glint font-medium">
            {observation.obs_id ?? 'Identifier absent from archive row'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xs text-brass font-semibold">
            {isExplorer
              ? formatDate(observation.observation_start)
              : observation.observation_start ?? 'Start time absent'}
          </p>
          {isExplorer && (
            <span className="text-[0.68rem] text-muted">
              {observation.observation_start?.split('T')[1]?.substring(0, 5) || ''} UTC
            </span>
          )}
        </div>
      </div>

      {isExplorer ? (
        /* Explorer Mode: Clear, user-friendly details */
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3 text-xs">
          <div className="rounded-xl border border-line/40 bg-panel/40 p-2.5">
            <span className="text-muted block text-[0.65rem] uppercase tracking-wider">Infrared Band</span>
            <span className="text-ink font-medium mt-0.5 block">{observation.bandpass ?? 'SPHEREx Band'}</span>
            <span className="text-muted/70 text-[0.7rem] font-mono block">
              {formatWavelength(observation.wavelength_min_um, observation.wavelength_max_um)}
            </span>
          </div>
          <div className="rounded-xl border border-line/40 bg-panel/40 p-2.5">
            <span className="text-muted block text-[0.65rem] uppercase tracking-wider">Exposure Time</span>
            <span className="text-ink font-medium mt-0.5 block">{formatExposure(observation.exposure_seconds)}</span>
            <span className="text-muted/70 text-[0.7rem] block">Duration of observation</span>
          </div>
          <div className="rounded-xl border border-line/40 bg-panel/40 p-2.5">
            <span className="text-muted block text-[0.65rem] uppercase tracking-wider">Telescope</span>
            <span className="text-ink font-medium mt-0.5 block">NASA SPHEREx</span>
            <span className="text-muted/70 text-[0.7rem] block">Calibrated Level 2</span>
          </div>
        </div>
      ) : (
        /* Science Mode: Detailed technical parameters */
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">Facility and Instrument</dt>
            <dd className="mt-1 text-ink">
              {[observation.facility_name, observation.instrument_name].filter(Boolean).join(' · ') ||
                'Not in archive row'}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">Bandpass &amp; Channel</dt>
            <dd className="mt-1 text-ink">
              {observation.bandpass ?? 'Not in archive row'}
              {observation.spectral_band ? ` · ${observation.spectral_band}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">Wavelength Coverage</dt>
            <dd className="mt-1 font-mono text-xs text-ink">
              {formatWavelength(observation.wavelength_min_um, observation.wavelength_max_um)}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">Integration Duration</dt>
            <dd className="mt-1 font-mono text-xs text-ink">{formatExposure(observation.exposure_seconds)}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">Boresight Pointing Center</dt>
            <dd className="mt-1 font-mono text-xs text-ink">
              RA {formatDegrees(observation.image_center_ra_deg)} · Dec{' '}
              {formatDegrees(observation.image_center_dec_deg)}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">Public Release Date</dt>
            <dd className="mt-1 text-ink">{observation.release_date ?? 'Not in archive row'}</dd>
          </div>
        </dl>
      )}

      {!isExplorer && (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {observation.proposal_title ?? 'Proposal title was blank in the archive row.'}
          {observation.calib_level != null ? ` Calibration level ${observation.calib_level}.` : ''}
          {observation.pixel_scale_arcsec != null
            ? ` Pixel scale ${observation.pixel_scale_arcsec} arcsec.`
            : ''}
          {size ? ` Archive size estimate ${size}.` : ''}
        </p>
      )}

      {/* Embedded Real NASA Cutout Viewer */}
      <FitsImageViewer
        observation={observation}
        ra={queryRa}
        dec={queryDec}
        autoLoad={index === 0}
        mode={mode}
      />
    </li>
  )
}

export default function NasaResults({ objectName, status, result, error, onRetry, mode = 'explorer' }) {
  const target = objectName ?? 'the selected object'
  const querying = status === 'loading'
  const hasResults = status === 'ready' && result

  return (
    <section
      aria-labelledby="nasa-heading"
      aria-busy={querying}
      className={`rounded-3xl p-5 sm:p-6 transition-colors ${
        hasResults
          ? 'border border-line bg-panel/80'
          : 'border border-dashed border-brass/40 bg-panel/50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[0.68rem] font-medium tracking-[0.18em] text-brass uppercase">
            {mode === 'explorer' ? '3. Genuine NASA Data' : 'IRSA SIA Archive Query'}
          </span>
          <h2 id="nasa-heading" className="font-display mt-0.5 text-3xl text-ink">
            {mode === 'explorer' ? 'NASA Infrared Observations' : 'NASA Observation Results'}
          </h2>
        </div>
        <p className="rounded-full border border-brass/40 bg-brass/10 px-3 py-1 text-xs tracking-wide text-brass uppercase">
          {hasResults ? result.query.collection : 'IRSA SPHEREx'}
        </p>
      </div>

      {/* Explorer Mode Educational Card: Why Infrared? */}
      {mode === 'explorer' && hasResults && (
        <div className="mt-4 rounded-2xl border border-line/60 bg-void/40 p-4">
          <h3 className="text-xs font-semibold text-glint flex items-center gap-1.5">
            <span>🔭</span> Why does NASA observe in infrared?
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Infrared wavelengths penetrate dense clouds of interstellar gas and dust that block visible light.
            NASA SPHEREx maps the whole sky across 102 infrared colors, revealing the distribution of water ice,
            organic compounds, and cosmic structures across the history of the universe.
          </p>
        </div>
      )}

      {/* Cached Offline Snapshot Notice */}
      {hasResults && (result.from_cache || result.is_cached) && (
        <div className="mt-4 rounded-2xl border border-cyan-500/40 bg-cyan-950/30 p-4 text-xs">
          <div className="flex items-start gap-3">
            <span className="text-lg">🕒</span>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-cyan-300 uppercase tracking-wider text-[0.7rem]">
                  Verified NASA Archive Telemetry (Cached Snapshot)
                </span>
                <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[0.65rem] font-mono text-cyan-300">
                  Retrieved: {result.retrieval_date_formatted || result.retrieval_timestamp || 'Previous Session'}
                </span>
              </div>
              <p className="text-slate-200 leading-relaxed">
                {result.notice || 'Upstream NASA IRSA SIA service is temporarily undergoing maintenance (HTTP 502). Displaying verified real NASA observation telemetry previously retrieved.'}
              </p>
              <p className="text-cyan-400/80 text-[0.68rem]">
                All celestial coordinates, observation epochs, and FITS cutout links below are authentic NASA measurements.
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'idle' && (
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">
          Select a sky target to query NASA/IPAC IRSA for SPHEREx spectral images at its stored coordinates.
          Real observations and FITS cutouts will display here.
        </p>
      )}

      {status === 'loading' && (
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brass/40 border-t-brass" />
          <p className="mt-3 text-sm font-medium text-ink">
            Querying NASA/IPAC IRSA for SPHEREx observations of <span className="text-glint">{target}</span>…
          </p>
          <p className="mt-1 text-xs text-muted">
            Checking astronomical archives for overlapping Level-2 spectral images.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-4 max-w-3xl rounded-2xl border border-amber-500/40 bg-amber-950/20 p-5">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-amber-200">
                NASA IRSA Service Notice for <span className="text-ink">{target}</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-300/90">{error}</p>
              <p className="text-[0.72rem] text-muted leading-relaxed">
                NASA Caltech/IPAC IRSA SIA servers periodically experience upstream maintenance or load throttling.
                AstroLens X made bounded retries with exponential backoff before reporting this status.
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 cursor-pointer rounded-full border border-amber-500/40 bg-amber-900/30 px-4 py-2 text-xs font-medium text-amber-200 hover:bg-amber-900/50 hover:text-white transition"
                >
                  Retry NASA Query
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {status === 'empty' && result && (
        <div className="mt-4 max-w-3xl rounded-2xl border border-line bg-void/50 p-5">
          <p className="text-sm font-semibold text-ink">
            No SPHEREx spectral images found for <span className="text-glint">{target}</span>.
          </p>
          <p className="mt-1 text-xs text-muted">
            The current NASA archive release may not have coverage for this sky patch yet, or the target lies just outside surveyed quadrants.
          </p>
          <p className="mt-3 font-mono text-[0.72rem] text-muted/70">
            Searched: RA {result.query.ra_deg.toFixed(5)}°, Dec {result.query.dec_deg.toFixed(5)}° · radius{' '}
            {result.query.radius_deg}°
          </p>
        </div>
      )}

      {hasResults && (
        <>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">
            Found <span className="text-ink font-semibold">{result.count}</span> spectral{' '}
            {result.count === 1 ? 'image' : 'images'} intersecting{' '}
            <span className="text-glint font-medium">{target}</span> from NASA’s Simple Image Access archive.
          </p>

          {/* Repeat Coverage & Caution Section */}
          <RepeatCoverage comparable={result.comparable} mode={mode} />

          {/* Multi-Epoch Sky Time Machine Comparison */}
          {result.count >= 1 && (
            <SkyTimeMachine
              observations={result.observations}
              queryRa={result.query.ra_deg}
              queryDec={result.query.dec_deg}
              comparable={result.comparable}
              mode={mode}
            />
          )}

          {/* Observation List */}
          <div className="mt-6">
            <h3 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
              {mode === 'explorer' ? 'Observation Records & Cutouts' : 'Archive Rows & FITS Cutouts'}
            </h3>
            <ul className="mt-3 max-h-[46rem] space-y-4 overflow-y-auto pr-1">
              {result.observations.map((observation, index) => (
                <ObservationCard
                  key={`${observation.publisher_did ?? observation.obs_id ?? 'row'}-${observation.bandpass ?? index}`}
                  observation={observation}
                  queryRa={result.query.ra_deg}
                  queryDec={result.query.dec_deg}
                  index={index}
                  mode={mode}
                />
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
