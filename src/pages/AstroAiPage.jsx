import { useState, useRef, useEffect } from 'react'
import { fetchAstroAiChat } from '../lib/spherexApi'

function renderFormattedMessage(text) {
  if (!text) return null
  const paragraphs = text.split('\n\n')
  return paragraphs.map((para, pIdx) => {
    const parts = []
    let lastIndex = 0
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g
    let match

    while ((match = regex.exec(para)) !== null) {
      if (match.index > lastIndex) {
        parts.push(para.substring(lastIndex, match.index))
      }
      if (match[1] && match[2]) {
        parts.push(
          <a
            key={`link-${pIdx}-${match.index}`}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline font-medium inline-flex items-center gap-0.5"
          >
            <span>{match[1]}</span>
            <span className="text-[0.65rem]">↗</span>
          </a>
        )
      } else if (match[3]) {
        parts.push(
          <strong key={`bold-${pIdx}-${match.index}`} className="font-semibold text-white">
            {match[3]}
          </strong>
        )
      }
      lastIndex = regex.lastIndex
    }
    if (lastIndex < para.length) {
      parts.push(para.substring(lastIndex))
    }

    return (
      <p key={pIdx} className="whitespace-pre-line leading-relaxed">
        {parts}
      </p>
    )
  })
}

function cleanTextForSpeech(raw) {
  if (!raw) return ''
  return raw
    .replace(/https?:\/\/\S+/g, '') // strip URLs
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // keep link anchor text only
    .replace(/[*_#`~>]/g, '') // remove markdown symbols
    .replace(/\s+/g, ' ')
    .trim()
}

export default function AstroAiPage({
  selectedObject,
  archiveData,
  onNavigate,
  onSelectTarget,
}) {
  const messageCounterRef = useRef(100)
  const [messages, setMessages] = useState([
    {
      id: 'msg-welcome',
      sender: 'ai',
      band: 'SPHEREx Calibration Level 2',
      source: 'Astro AI • SPHEREx Synchronized',
      text: "Hey there! 👋 I'm Astro, your cosmic guide. Ask me anything about the universe, NASA's SPHEREx mission, or the celestial targets in the night sky!",
      followUpQuestions: [
        'What is SPHEREx?',
        'Why does Betelgeuse look different in infrared?',
        "Can you explain this like I'm 10?",
      ],
    },
  ])

  const [inputText, setInputText] = useState('')
  const [speakAloud, setSpeakAloud] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [speakingMsgId, setSpeakingMsgId] = useState(null)
  const [errorNotice, setErrorNotice] = useState(null)
  const chatBottomRef = useRef(null)

  const activeTargetName = selectedObject?.name || 'Betelgeuse'

  const starterQuestions = [
    { label: 'What is this star?', query: `What is this star (${activeTargetName}) and what kind of celestial object is it?` },
    { label: 'How far away is it?', query: `How far away is ${activeTargetName} from Earth, and how do astronomers measure cosmic distances?` },
    { label: 'What am I seeing in this NASA image?', query: `What am I seeing in this NASA SPHEREx spectral observation of ${activeTargetName}?` },
    { label: 'Why does this star look different in infrared?', query: `Why does ${activeTargetName} look so different in infrared light compared to visible light?` },
    { label: 'What changed between these observations?', query: `What changed between these observations in the Sky Time Machine?` },
    { label: 'What is SPHEREx?', query: 'What is NASA SPHEREx and how does its 102-band all-sky spectrophotometry survey work?' },
    { label: "Can you explain this like I'm 10?", query: `Can you explain ${activeTargetName} and infrared light like I'm 10 years old?` },
    { label: 'Can you quiz me about this object?', query: `Can you quiz me about ${activeTargetName} to test my astronomy knowledge?` },
  ]

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  function handleResetChat() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setSpeakingMsgId(null)
    setErrorNotice(null)
    setMessages([
      {
        id: `msg-welcome-${Date.now()}`,
        sender: 'ai',
        band: 'SPHEREx Calibration Level 2',
        source: 'Astro AI • SPHEREx Synchronized',
        text: "Hey there! 👋 Chat history cleared. I'm Astro, your cosmic guide! What would you like to explore together?",
        followUpQuestions: [
          'What is SPHEREx?',
          `Why does ${activeTargetName} look different in infrared?`,
          "Can you explain this like I'm 10?",
        ],
      },
    ])
  }

  async function handleSend(queryText) {
    const q = queryText || inputText
    if (!q.trim() || isLoading) return

    setErrorNotice(null)
    messageCounterRef.current += 1
    const userMsg = {
      id: `user-${messageCounterRef.current}`,
      sender: 'user',
      text: q,
      time: 'Just now',
    }

    setMessages((prev) => [...prev, userMsg])
    setInputText('')
    setIsLoading(true)

    // Build rich context from target catalog & live SPHEREx observation telemetry
    const context = {
      name: selectedObject?.name,
      designation: selectedObject?.designation,
      distance: selectedObject?.distance,
      category: selectedObject?.category,
      ra: selectedObject?.ra,
      dec: selectedObject?.dec,
      summary: selectedObject?.summary,
      whatToLookFor: selectedObject?.whatToLookFor,
      ...(archiveData ? {
        observation_count: archiveData.count,
        bands: archiveData.comparable?.bands?.map(b => b.bandpass).join(', '),
        earliest_date: archiveData.comparable?.bands?.[0]?.earliest,
        latest_date: archiveData.comparable?.bands?.[0]?.latest,
        repeat_coverage_found: archiveData.comparable?.repeat_coverage_found,
        span_days: archiveData.comparable?.bands?.[0]?.span_days,
      } : {}),
    }

    // Prepare bounded multi-turn conversational history (last 8 turns)
    const history = messages
      .filter((m) => m.text)
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      }))
      .slice(-8)

    try {
      const response = await fetchAstroAiChat({
        message: q,
        targetId: selectedObject?.id || null,
        context,
        history,
      })

      messageCounterRef.current += 1
      const aiMsg = {
        id: `ai-${messageCounterRef.current}`,
        sender: 'ai',
        band: response.band || 'SPHEREx Calibration Level 2',
        source: response.source || 'Astro AI',
        text: response.text,
        miniCard: response.target_card
          ? {
              title: response.target_card.title,
              subtitle: response.target_card.subtitle,
              imageUrl: response.target_card.image_url,
              metricLabel: response.target_card.metric_label,
              metricValue: response.target_card.metric_value,
            }
          : null,
        suggestions: response.suggestions || [],
        followUpQuestions: response.follow_up_questions || [],
      }

      setMessages((prev) => [...prev, aiMsg])

      if (response.notice) {
        setErrorNotice(response.notice)
      }

      if (speakAloud) {
        speakText(response.text, aiMsg.id)
      }
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('rate limit')) {
        setErrorNotice('Rate limit reached: Please wait a moment before sending another message to Astro AI.')
      } else {
        setErrorNotice('Live Astro AI is unavailable. Showing a limited offline response.')
      }

      messageCounterRef.current += 1
      const fallback = generateEducationalResponse(q, selectedObject)
      const aiMsg = {
        id: `ai-${messageCounterRef.current}`,
        sender: 'ai',
        band: 'Offline response',
        source: 'Astro AI • Offline Mode',
        text: fallback.text,
        miniCard: fallback.miniCard,
        suggestions: fallback.suggestions,
        followUpQuestions: fallback.followUpQuestions || [],
      }
      setMessages((prev) => [...prev, aiMsg])

      if (speakAloud) {
        speakText(fallback.text, aiMsg.id)
      }
    } finally {
      setIsLoading(false)
    }
  }

  function speakText(text, msgId) {
    if (!('speechSynthesis' in window)) return

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel()
      setSpeakingMsgId(null)
      return
    }

    window.speechSynthesis.cancel()
    const cleanSpokenText = cleanTextForSpeech(text)
    const utterance = new SpeechSynthesisUtterance(cleanSpokenText)
    utterance.rate = 1.0
    utterance.pitch = 1.05

    utterance.onstart = () => {
      setSpeakingMsgId(msgId)
    }
    utterance.onend = () => {
      setSpeakingMsgId(null)
    }
    utterance.onerror = () => {
      setSpeakingMsgId(null)
    }

    window.speechSynthesis.speak(utterance)
  }

  function handleVoiceToggle() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not natively supported in this browser. Please type your question in the text bar!')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false

    if (!isListening) {
      setIsListening(true)
      setErrorNotice(null)
      try {
        recognition.start()
      } catch (err) {
        setIsListening(false)
        setErrorNotice('Could not start speech recognition: ' + (err.message || 'Browser permission required.'))
        return
      }

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setIsListening(false)
        setInputText(transcript)
        handleSend(transcript)
      }
      recognition.onerror = (event) => {
        setIsListening(false)
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setErrorNotice('Microphone access was denied. Please allow microphone permissions in your browser or type in the chat box!')
        } else if (event.error !== 'no-speech') {
          setErrorNotice(`Microphone error: ${event.error}. Please type your question in the text bar.`)
        }
      }
      recognition.onend = () => {
        setIsListening(false)
      }
    } else {
      setIsListening(false)
      try {
        recognition.stop()
      } catch {
        // ignore
      }
    }
  }

  function handleSuggestionClick(sug) {
    if (sug.action === 'explore') {
      onSelectTarget?.(selectedObject?.id || 'betelgeuse')
      onNavigate?.('explore')
    } else if (sug.action === 'timemachine') {
      onSelectTarget?.(selectedObject?.id || 'betelgeuse')
      onNavigate?.('explore')
      setTimeout(() => {
        window.scrollTo({ top: 900, behavior: 'smooth' })
      }, 150)
    } else if (sug.action === 'learn') {
      onNavigate?.('learn')
    } else if (sug.action === 'dimming') {
      handleSend('Explain the 2019 Great Dimming of Betelgeuse in detail.')
    } else if (sug.label) {
      handleSend(sug.label)
    }
  }

  return (
    <div className="space-y-10 py-4 sm:py-8 max-w-5xl mx-auto px-4">
      {/* 1. Header Badges & Action Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-950/30 px-3.5 py-1 text-xs text-purple-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono text-[0.68rem] tracking-wider uppercase">
            ASTRO CORE V2.4 • SPHEREx SYNCHRONIZED
          </span>
        </div>

        {/* Right Controls: Reset Chat + Voice Enabled Pill */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Reset Chat Button */}
          <button
            type="button"
            onClick={handleResetChat}
            className="cursor-pointer flex items-center gap-1.5 rounded-full border border-line bg-panel/60 px-3 py-1 text-xs text-slate-300 hover:text-white hover:border-purple-400/50 hover:bg-purple-950/40 transition shadow-sm"
            title="Reset conversation and start fresh"
          >
            <span className="text-purple-400">↺</span>
            <span className="text-[0.72rem] font-medium">Reset Chat</span>
          </button>

          {/* Voice Enabled Pill */}
          <div className="flex items-center gap-2 rounded-full border border-line bg-panel/60 px-3 py-1 text-xs text-slate-300">
            <span>{speakingMsgId ? '🔊' : '🔈'}</span>
            <span className="text-[0.72rem]">
              {speakingMsgId ? 'Speaking Aloud...' : isListening ? 'Listening for speech...' : 'Voice Enabled • Listen Aloud'}
            </span>
            <div className="flex items-center gap-0.5">
              <span className={`h-2 w-0.5 bg-cyan-400 ${speakingMsgId || isListening ? 'animate-pulse' : 'opacity-40'}`} />
              <span className={`h-3 w-0.5 bg-cyan-400 ${speakingMsgId || isListening ? 'animate-pulse delay-75' : 'opacity-40'}`} />
              <span className={`h-1.5 w-0.5 bg-cyan-400 ${speakingMsgId || isListening ? 'animate-pulse delay-150' : 'opacity-40'}`} />
            </div>
            {speakingMsgId && (
              <button
                type="button"
                onClick={() => {
                  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
                  setSpeakingMsgId(null)
                }}
                className="ml-1.5 cursor-pointer rounded bg-red-600/90 px-2 py-0.5 text-[0.65rem] font-bold text-white hover:bg-red-500 transition"
                title="Stop Speech Playback"
              >
                ⏹ Stop Speaking
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Central AI Avatar Orb */}
      <section className="text-center space-y-4">
        {/* Animated Glowing Orb with Digital Eyes */}
        <div className="relative inline-flex items-center justify-center">
          {/* Ambient Glow Halo */}
          <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-purple-600/30 via-pink-600/20 to-cyan-500/30 blur-xl" />

          {/* The Orb Body */}
          <div className={`relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-purple-400/50 bg-gradient-to-br from-[#1d1238] via-[#0d1429] to-[#040817] shadow-[0_0_50px_rgba(168,85,247,0.5)] ${isLoading ? 'animate-pulse scale-105' : 'animate-orb-glow'} transition duration-300`}>
            {/* Expressive Digital Cyan Eyes */}
            <div className="flex items-center gap-3">
              <span className={`h-6 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee] ${isLoading ? 'animate-ping' : 'animate-eye-blink'}`} />
              <span className={`h-6 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee] ${isLoading ? 'animate-ping' : 'animate-eye-blink'}`} />
            </div>

            {/* Orbiting Sparkle */}
            <span className="absolute top-2 right-2 text-xs text-purple-300 animate-spin">✦</span>
          </div>
        </div>

        <div className="space-y-1.5 max-w-lg mx-auto">
          <div className="inline-flex items-center gap-1.5 text-[0.68rem] font-mono text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span>{isLoading ? 'Astro is consulting NASA SPHEREx data...' : 'Astro is ready to explore with you'}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Say Hello to Astro
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Your celestial guide to NASA’s infrared universe. Ask simple questions, decode distant galaxies, and hear real cosmic science explained in plain English.
          </p>
        </div>
      </section>

      {/* 3. Starter Prompt Pills */}
      <section className="space-y-2 text-center">
        <p className="text-[0.65rem] font-mono uppercase tracking-widest text-muted">
          TAP A COSMIC QUESTION TO BEGIN
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {starterQuestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => handleSend(q.query)}
              className="cursor-pointer rounded-full border border-line bg-panel/60 px-3.5 py-1.5 text-xs text-slate-200 shadow-sm transition hover:border-purple-400/60 hover:bg-purple-950/30 hover:text-white active:scale-95 disabled:opacity-50"
            >
              <span className="text-purple-400 mr-1.5">✦</span>
              <span>{q.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 4. Chat Message History Thread */}
      <section className="rounded-2xl border border-line/80 bg-panel/70 p-4 sm:p-6 space-y-6 shadow-2xl backdrop-blur-sm min-h-[360px] max-h-[540px] overflow-y-auto">
        {messages.map((msg) => {
          if (msg.sender === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-xl space-y-1 text-right">
                  <span className="text-[0.65rem] font-mono text-muted mr-1">You • {msg.time}</span>
                  <div className="rounded-2xl rounded-tr-sm bg-gradient-to-r from-purple-900/60 to-purple-800/80 border border-purple-400/40 p-3.5 text-xs sm:text-sm text-white shadow-md text-left">
                    {msg.text}
                  </div>
                </div>
              </div>
            )
          }

          const isSpeakingThis = speakingMsgId === msg.id

          return (
            <div key={msg.id} className="flex items-start gap-3 max-w-2xl">
              {/* Mini AI Orb Avatar */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-purple-400 bg-purple-950/80 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.4)]">
                <span className="text-xs">✨</span>
              </div>

              {/* AI Bubble */}
              <div className="space-y-3 flex-1">
                {/* Header with Band & Listen Button */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">Astro AI</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.62rem] font-mono text-cyan-300">
                      • {msg.band}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakText(msg.text, msg.id)}
                    className={`cursor-pointer flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-[0.68rem] transition ${
                      isSpeakingThis
                        ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300 font-bold'
                        : 'border-line bg-panel/80 text-slate-300 hover:text-white hover:border-cyan-400'
                    }`}
                  >
                    <span>{isSpeakingThis ? '⏹' : '🔊'}</span>
                    <span>{isSpeakingThis ? 'Stop' : 'Listen'}</span>
                  </button>
                </div>

                {/* Message Body with Formatted Markdown / Links */}
                <div className="rounded-2xl rounded-tl-sm border border-line/80 bg-black/40 p-4 text-xs sm:text-sm text-slate-200 leading-relaxed space-y-3">
                  <div className="space-y-2">
                    {renderFormattedMessage(msg.text)}
                  </div>

                  {/* Embedded Mini-Target Card (if provided) */}
                  {msg.miniCard && (
                    <div className="rounded-xl border border-white/10 bg-panel/90 p-3 flex items-center justify-between gap-3 shadow-inner">
                      <div className="flex items-center gap-3">
                        <img
                          src={msg.miniCard.imageUrl}
                          alt={msg.miniCard.title}
                          className="h-10 w-10 rounded-lg object-cover border border-white/10"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">{msg.miniCard.title}</p>
                          <p className="text-[0.65rem] text-muted">{msg.miniCard.subtitle}</p>
                        </div>
                      </div>
                      <div className="text-right border-l border-white/10 pl-3">
                        <p className="text-[0.6rem] font-mono text-amber-300 uppercase">{msg.miniCard.metricLabel || 'OBSERVATION PARAMETER'}</p>
                        <p className="text-xs font-bold text-white font-mono flex items-center justify-end gap-1">
                          <span>{msg.miniCard.metricValue}</span>
                          <span className="text-amber-400">🌡</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Suggested Next Action Pills */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
                      <span className="text-[0.65rem] font-mono text-muted self-center">Suggested Next:</span>
                      {msg.suggestions.map((sug, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleSuggestionClick(sug)}
                          className="cursor-pointer rounded-lg border border-line bg-white/5 px-2.5 py-1 text-[0.68rem] text-purple-300 hover:border-purple-400 hover:bg-purple-950/40 hover:text-white transition"
                        >
                          {sug.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Follow-up Questions Chips */}
                  {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                    <div className="pt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.62rem] font-mono text-cyan-300 mr-1">✦ Ask Follow-up:</span>
                      {msg.followUpQuestions.map((fq, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isLoading}
                          onClick={() => handleSend(fq)}
                          className="cursor-pointer text-[0.65rem] text-slate-300 hover:text-white bg-purple-950/30 hover:bg-purple-900/40 border border-purple-500/20 px-2 py-0.5 rounded-full transition"
                        >
                          {fq} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Loading Indicator when awaiting AI response */}
        {isLoading && (
          <div className="flex items-start gap-3 max-w-md">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-purple-400 bg-purple-950/80 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.4)] animate-pulse">
              <span className="text-xs">✨</span>
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-line/80 bg-black/40 px-4 py-3 text-xs text-slate-300 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" />
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce delay-100" />
              <span className="h-2 w-2 rounded-full bg-pink-400 animate-bounce delay-200" />
              <span className="ml-1 text-[0.7rem] font-mono text-cyan-300">Astro is consulting NASA SPHEREx data...</span>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </section>

      {/* 5. Fixed/Bottom Input Bar */}
      <section className="space-y-3">
        {errorNotice && (
          <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-950/40 px-3.5 py-2 text-xs text-amber-200">
            <span>⚠ {errorNotice}</span>
            <button
              type="button"
              onClick={() => setErrorNotice(null)}
              className="text-amber-400 hover:text-white text-xs cursor-pointer ml-2"
            >
              ✕
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex items-center gap-2 rounded-2xl border border-line/80 bg-panel/90 p-2 shadow-2xl backdrop-blur-md"
        >
          {/* Ask Input */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-xs text-muted">💬</span>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isListening ? 'Listening to your microphone... speak now!' : 'Ask Astro anything about the universe...'}
              disabled={isLoading}
              className="w-full rounded-xl bg-transparent py-2 pl-9 pr-4 text-xs sm:text-sm text-ink placeholder:text-muted focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Speak Answers Aloud Toggle */}
          <label className="hidden sm:flex items-center gap-1.5 text-[0.68rem] text-slate-300 cursor-pointer select-none px-2">
            <input
              type="checkbox"
              checked={speakAloud}
              onChange={(e) => setSpeakAloud(e.target.checked)}
              className="rounded border-line bg-black accent-purple-500"
            />
            <span>Speak answers aloud</span>
          </label>

          {/* Microphone Button */}
          <button
            type="button"
            onClick={handleVoiceToggle}
            className={`cursor-pointer flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition duration-200 ${
              isListening
                ? 'border-red-500 bg-red-600 text-white animate-pulse'
                : 'border-cyan-400/40 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
            }`}
            title="Click to speak (Voice Recognition)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 02-3-3V5a3 3 0 116 0v6a3 3 0 02-3 3z" />
            </svg>
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            className="cursor-pointer flex items-center gap-1.5 rounded-xl border border-pink-500/40 bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md transition hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <span>Send</span>
            <span>▷</span>
          </button>
        </form>

        {/* 3 Trust Badges at Bottom */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-[0.68rem] text-muted">
          <span className="flex items-center gap-1">
            <span className="text-cyan-400">🛡</span> Verified against NASA SPHEREx Mission Archive
          </span>
          <span className="flex items-center gap-1">
            <span className="text-purple-400">🎓</span> Appropriate for Grade 5 to Astrophysics Undergrad
          </span>
          <span className="flex items-center gap-1">
            <span className="text-pink-400">🗣</span> Natural Voice Synthesis Ready
          </span>
        </div>
      </section>
    </div>
  )
}

function generateEducationalResponse(query, target) {
  const q = query.toLowerCase().trim()
  const name = target?.name || 'Betelgeuse'

  // 1. Greetings (e.g. "hi", "hiiii", "hello", "hey")
  if (/^(hi+|hey+|heyy+|hello+|howdy|hola|yo|sup|greetings|good\s+(morning|afternoon|evening))[\s!.,?~:)]*$/i.test(q)) {
    return {
      text: "Heyyy! 👋 I'm Astro, your cosmic guide. How's it going? Want to explore the stars, check out NASA SPHEREx infrared data, or just chat about space?",
      suggestions: [
        { label: 'What is SPHEREx?', action: 'explore' },
        { label: 'Explore the Night Sky', action: 'explore' },
        { label: 'Can you quiz me?', action: 'learn' },
      ],
      followUpQuestions: [
        'What is SPHEREx?',
        `Why does ${name} look different in infrared?`,
        "Can you explain this like I'm 10?",
      ],
    }
  }

  // 2. Casual Conversation ("how are you", "who are you", "thank you")
  if (q.includes('how are you') || q.includes("how's it going") || q.includes('hows it going')) {
    return {
      text: "I'm doing stellar! 🚀 Floating through cosmic data streams and ready to explore the infrared universe with you. What's on your mind today?",
      suggestions: [
        { label: 'Explore the Night Sky', action: 'explore' },
        { label: 'Learn Space Discoveries', action: 'learn' },
      ],
      followUpQuestions: [
        'What is NASA SPHEREx?',
        'Why does the infrared sky look colorful?',
      ],
    }
  }

  if (q.includes('who are you') || q.includes('what are you') || q.includes('what can you do')) {
    return {
      text: "I'm Astro, your AI celestial guide for AstroLens X! 🌌 I connect you directly with NASA's SPHEREx mission data, help you decode infrared space observations, and explain cosmic phenomena in plain English.",
      suggestions: [
        { label: 'What is SPHEREx?', action: 'explore' },
        { label: 'Show in Sky Explorer', action: 'explore' },
      ],
      followUpQuestions: [
        'What are the 102 spectral bands of SPHEREx?',
        'Can you quiz me about astronomy?',
      ],
    }
  }

  if (q.includes('thank') || q.includes('thanks')) {
    return {
      text: "You're very welcome! 🌟 Exploring the cosmos is always more exciting together. Let me know if you want to inspect more stars or test your astronomy knowledge!",
      suggestions: [
        { label: 'Take an Astronomy Quiz', action: 'learn' },
        { label: 'Explore the Sky', action: 'explore' },
      ],
      followUpQuestions: [
        'Can you quiz me about this object?',
        'What is SPHEREx?',
      ],
    }
  }

  // 3. Tamil Language Request (தமிழ்)
  if (/[\u0B80-\u0BFF]/.test(query) || q.includes('in tamil') || q.includes('tamil')) {
    return {
      text: "வணக்கம்! 🌟 நாசாவின் SPHEREx திட்டம் என்பது முழு வானத்தையும் 102 அகச்சிவப்பு (Infrared) அலைவரிசைகளில் வரைபடமாக்கும் ஒரு முன்னோடி விண்வெளித் திட்டமாகும். பிரபஞ்சத்தின் தோற்றம் மற்றும் விண்மீன்கள் பற்றி நீங்கள் என்ன தெரிந்து கொள்ள விரும்புகிறீர்கள்?",
      suggestions: [
        { label: 'வானை ஆராயுங்கள் (Explore)', action: 'explore' },
        { label: 'SPHEREx பற்றி அறிக (Learn)', action: 'learn' },
      ],
      followUpQuestions: [
        'SPHEREx என்றால் என்ன?',
        'அகச்சிவப்பு ஒளி எவ்வாறு செயல்படுகிறது?',
      ],
    }
  }

  // 4. Proper Motion & Cosmic Change
  if (q.includes('why does space change') || q.includes('proper motion') || q.includes('motion') || q.includes('move')) {
    return {
      text: 'Space looks calm to our eyes, but it is continuously in motion! Nearby stars have high proper motion and race across our field of view, while variable stars pulsate and newborn stars flash as they swallow planetary debris. By comparing two NASA observations taken months or years apart, astronomers spot these changes in an instant!',
      suggestions: [
        { label: 'Open Sky Time Machine', action: 'timemachine' },
        { label: 'Inspect Barnard’s Star', action: 'explore' },
      ],
      followUpQuestions: [
        'How fast is Barnard’s Star moving?',
        'How does the blink comparator work?',
      ],
    }
  }

  // 5. Infrared Light & Dust Penetration
  if (q.includes('infrared') || q.includes('12') || q.includes('dust')) {
    return {
      text: 'Think of visible light as what your eyes see (like a rainbow), and infrared light as warm heat you feel from a hot mug! Cosmic dust blocks visible starlight, but heat waves slip right through. Telescopes like NASA’s SPHEREx wear infrared glasses to reveal baby stars hidden inside thick clouds!',
      suggestions: [
        { label: 'Explore the Sky', action: 'explore' },
        { label: 'Learn Space Discoveries', action: 'learn' },
      ],
      followUpQuestions: [
        'What are the 102 spectral channels of SPHEREx?',
        `Why does ${name} glow in infrared?`,
      ],
    }
  }

  // 6. SPHEREx Pixel Scale & Resolution
  if (q.includes('pixel') || q.includes('blurry') || q.includes('resolution') || q.includes('arcsec')) {
    return {
      text: 'SPHEREx has a 20-centimeter aperture designed for wide all-sky spectroscopy, not narrow high-magnification portraits. Its detector scale is 6.155 arcseconds per pixel with an optical point-spread function of ~7.5″. Each pixel represents authentic calibrated scientific flux in mega-Janskys per steradian (MJy/sr)!',
      suggestions: [
        { label: 'Inspect FITS in Time Machine', action: 'timemachine' },
      ],
      followUpQuestions: [
        'What does MJy/sr mean?',
        'What is WCS astrometric reprojection?',
      ],
    }
  }

  // 7. Distance Inquiry (only if target is specifically asked or referenced)
  if (q.includes('how far') || q.includes('distance')) {
    return {
      text: `${name} is located at an estimated distance of ${target?.distance || '642.5 light-years'}. Light traveling from this object began its journey hundreds of years ago before reaching NASA’s detectors! Astronomers calculate this using trigonometric parallax from Gaia and space astrometry.`,
      miniCard: {
        title: target?.designation || name,
        subtitle: `Distance: ${target?.distance || 'Cosmic Distance'}`,
        imageUrl: target?.imageUrl || 'https://images-assets.nasa.gov/image/PIA23646/PIA23646~thumb.jpg',
        metricLabel: 'PARALLAX DISTANCE',
        metricValue: target?.distance || 'Verified',
      },
      suggestions: [
        { label: 'Show in Sky Explorer', action: 'explore' },
        { label: 'Compare observations over time', action: 'timemachine' },
      ],
      followUpQuestions: [
        'How does parallax measurement work?',
        'Why does space change over time?',
      ],
    }
  }

  return {
    text: "I don't have a reliable offline answer for that question. I'm best at astronomy and SPHEREx topics; please try again when the live Astro AI service is available.",
    suggestions: [
      { label: 'Show in Sky Explorer', action: 'explore' },
      { label: 'Learn Space Discoveries', action: 'learn' },
    ],
    followUpQuestions: [
      'What is SPHEREx?',
    ],
  }
}
