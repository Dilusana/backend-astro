import { useEffect, useMemo, useState } from 'react'
import CosmicNavbar from './components/CosmicNavbar'
import CosmicFooter from './components/CosmicFooter'
import HomePage from './pages/HomePage'
import ExplorePage from './pages/ExplorePage'
import LearnPage from './pages/LearnPage'
import AstroAiPage from './pages/AstroAiPage'
import { catalog } from './data/catalog'
import { catalogPositionToDegrees } from './lib/coordinates'
import { fetchSpherexObservations } from './lib/spherexApi'

export default function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [selectedId, setSelectedId] = useState('betelgeuse') // Betelgeuse is featured on Screenshot 1, 3, and 4
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem('astrolens_mode') || 'explorer'
    } catch {
      return 'explorer'
    }
  })

  const [archive, setArchive] = useState({
    status: 'idle',
    data: null,
    error: null,
    objectId: null,
  })

  const [retryCount, setRetryCount] = useState(0)

  function handleModeChange(newMode) {
    setMode(newMode)
    try {
      localStorage.setItem('astrolens_mode', newMode)
    } catch {
      // ignore
    }
  }

  function handleRetry() {
    setRetryCount((c) => c + 1)
  }

  const selected = useMemo(() => {
    return catalog.find((obj) => obj.id === selectedId) || catalog[0]
  }, [selectedId])

  // Real NASA IRSA SPHEREx data pipeline query whenever target changes
  useEffect(() => {
    if (!selected || currentPage !== 'explore') return

    const position = catalogPositionToDegrees(selected)
    const objectId = selected.id

    if (!position) {
      setArchive({
        status: 'error',
        data: null,
        error: 'The stored right ascension and declination could not be converted to degrees.',
        objectId,
      })
      return
    }

    const controller = new AbortController()
    setArchive({ status: 'loading', data: null, error: null, objectId })

    fetchSpherexObservations(position, controller.signal)
      .then((data) => {
        setArchive({
          status: data.count > 0 ? 'ready' : 'empty',
          data,
          error: null,
          objectId,
        })
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setArchive({
          status: 'error',
          data: null,
          error: err.message || 'NASA IRSA SPHEREx query failed.',
          objectId,
        })
      })

    return () => controller.abort()
  }, [currentPage, selected, retryCount])

  function handleSelectTarget(targetId) {
    setSelectedId(targetId)
  }

  function handleNavigate(page) {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-svh flex flex-col bg-[#050814] text-slate-100 font-sans selection:bg-purple-500/30 selection:text-white">
      {/* 1. Global Cosmic Navigation Bar */}
      <CosmicNavbar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        archiveStatus={archive.status}
        mode={mode}
        onModeChange={handleModeChange}
      />

      {/* 2. Main Page Content based on active tab */}
      <main className="flex-1">
        {currentPage === 'home' && (
          <HomePage
            onNavigate={handleNavigate}
            onSelectTarget={handleSelectTarget}
            catalog={catalog}
          />
        )}

        {currentPage === 'explore' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ExplorePage
              catalog={catalog}
              selectedId={selectedId}
              onSelectTarget={handleSelectTarget}
              archiveData={archive.objectId === selected?.id ? archive.data : null}
              archiveStatus={archive.objectId === selected?.id ? archive.status : 'loading'}
              archiveError={archive.objectId === selected?.id ? archive.error : null}
              onRetry={handleRetry}
              mode={mode}
            />
          </div>
        )}

        {currentPage === 'learn' && (
          <LearnPage
            onNavigate={handleNavigate}
            onSelectTarget={handleSelectTarget}
          />
        )}

        {currentPage === 'ai' && (
          <AstroAiPage
            selectedObject={selected}
            archiveData={archive.objectId === selected?.id ? archive.data : null}
            onNavigate={handleNavigate}
            onSelectTarget={handleSelectTarget}
          />
        )}
      </main>

      {/* 3. Global Cosmic Footer */}
      <CosmicFooter onNavigate={handleNavigate} />
    </div>
  )
}
