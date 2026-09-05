import React, { useState, useEffect, useRef } from 'react'
import { fetchSettings, updateSettings, sendQuery } from '../api.js'

/**
 * Extracts distinct, readable citation chips from retrieved chunks metadata.
 */
export function extractCitations(retrievedChunks) {
  if (!retrievedChunks || !Array.isArray(retrievedChunks)) {
    return []
  }

  const citations = []
  const seen = new Set()

  for (let idx = 0; idx < retrievedChunks.length; idx++) {
    const chunk = retrievedChunks[idx]
    const docName = chunk.source_document || chunk.source || 'unknown'
    const text = chunk.text || ''

    // Determine document type badge
    const lowerDoc = docName.toLowerCase()
    let type = 'doc'
    let badge = 'DOC'
    if (lowerDoc.endsWith('.pdf')) {
      type = 'pdf'
      badge = 'PDF'
    } else if (lowerDoc.endsWith('.md') || lowerDoc.endsWith('.markdown')) {
      type = 'doc'
      badge = 'DOC'
    }

    // Try to extract section or page information from markdown headings
    let sectionLabel = ''
    const secMatch = text.match(/(?:^|\n)##\s*(\d+)?\.?\s*([^\n\r]+)/)
    if (secMatch) {
      if (secMatch[1]) {
        sectionLabel = `section ${secMatch[1]}`
      } else {
        const title = secMatch[2].trim().slice(0, 30)
        sectionLabel = title
      }
    } else {
      const anyHead = text.match(/(?:^|\n)#+\s*([^\n\r]+)/)
      if (anyHead) {
        sectionLabel = anyHead[1].trim().slice(0, 30)
      } else {
        sectionLabel = `chunk ${idx + 1}`
      }
    }

    const label = `${docName} — ${sectionLabel}`
    const key = `${badge}:${label}`

    if (!seen.has(key)) {
      seen.add(key)
      citations.push({
        type,
        badge,
        label,
        docName,
        section: sectionLabel,
      })
    }
  }

  return citations
}

/**
 * Evaluates whether a safe or danger banner should be rendered
 * under an AI response that touched an injected or flagged chunk.
 */
export function determineBanner(result) {
  if (!result) return null

  const finalStatus = result.final_status
  const isFlagged = Boolean(result.is_flagged)
  const hasFlaggedChunk = Boolean(
    result.retrieved_chunks &&
      Array.isArray(result.retrieved_chunks) &&
      result.retrieved_chunks.some((c) => c.flagged)
  )
  const isAttackStatus = finalStatus === 'leaked'
  const isDefenseStatus = finalStatus === 'blocked' || finalStatus === 'sanitized'

  // If attack succeeded or leaked unverified content: Danger banner
  if (isAttackStatus) {
    return {
      type: 'danger',
      id: 'chatBannerDanger',
      icon: (
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 3l10 18H2L12 3z" />
          <path d="M12 9v5" />
        </svg>
      ),
      text: 'Injected instruction followed',
    }
  }

  // If defense blocked or sanitized untrusted content: Safe banner
  if (isDefenseStatus) {
    return {
      type: 'safe',
      id: 'chatBannerSafe',
      icon: (
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      ),
      text: 'Untrusted content wrapped — instruction ignored',
    }
  }

  // If chunk was flagged at retrieval threshold, display appropriate state
  if (isFlagged || hasFlaggedChunk) {
    return {
      type: 'safe',
      id: 'chatBannerSafe',
      icon: (
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      ),
      text: 'Untrusted content wrapped — instruction ignored',
    }
  }

  // Clean response with no injection or flags touched
  return null
}

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [inputQuery, setInputQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isMitigationActive, setIsMitigationActive] = useState(false)
  const [isUpdatingToggle, setIsUpdatingToggle] = useState(false)
  const [error, setError] = useState(null)
  const threadEndRef = useRef(null)

  // Load initial mitigation state from backend settings
  const loadSettings = async () => {
    try {
      const data = await fetchSettings()
      const m = data?.mitigations || data?.active_mitigations
      const active = m
        ? Boolean(m.delimiter || m.sanitization || m.output_filter || m.output_filtering || m.retrieval_score_threshold)
        : false
      setIsMitigationActive(active)
    } catch (err) {
      console.error('Failed to load settings in Chat header:', err)
    }
  }

  useEffect(() => {
    loadSettings()
    const handleMitigationChange = (e) => {
      if (e?.detail?.source === 'chat-header') return
      loadSettings()
    }
    window.addEventListener('mitigation-settings-changed', handleMitigationChange)
    return () => {
      window.removeEventListener('mitigation-settings-changed', handleMitigationChange)
    }
  }, [])

  // Auto-scroll to bottom of thread when messages update
  useEffect(() => {
    if (threadEndRef.current && typeof threadEndRef.current.scrollIntoView === 'function') {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  // Toggle mitigation state from header toggle
  // Per spec: changes mitigation state for the NEXT query only without modifying thread history
  const handleToggleMitigation = async () => {
    if (isUpdatingToggle) return
    const nextState = !isMitigationActive
    setIsUpdatingToggle(true)
    setIsMitigationActive(nextState)

    try {
      const updated = await updateSettings({
        delimiter: nextState,
        sanitization: nextState,
        output_filter: nextState,
        retrieval_score_threshold: nextState,
      })
      window.dispatchEvent(
        new CustomEvent('mitigation-settings-changed', {
          detail: { source: 'chat-header', mitigations: updated?.mitigations },
        })
      )
    } catch (err) {
      console.error('Failed to update mitigation settings from Chat toggle:', err)
      // Revert on failure
      setIsMitigationActive(!nextState)
    } finally {
      setIsUpdatingToggle(false)
    }
  }

  // Handle user query submission
  const handleSend = async (e) => {
    if (e) e.preventDefault()
    const trimmed = inputQuery.trim()
    if (!trimmed || isLoading) return

    const userMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    }

    setMessages((prev) => [...prev, userMessage])
    setInputQuery('')
    setIsLoading(true)
    setError(null)

    try {
      const payload = {
        query: trimmed,
        mitigations: {
          delimiter: isMitigationActive,
          sanitization: isMitigationActive,
          output_filter: isMitigationActive,
          retrieval_score_threshold: isMitigationActive,
        },
      }

      const result = await sendQuery(payload)
      const citations = extractCitations(result.retrieved_chunks)
      const banner = determineBanner(result)

      const aiMessage = {
        id: `ai_${Date.now()}`,
        role: 'ai',
        text: result.response || result.raw_response || 'No response generated.',
        citations,
        banner,
        final_status: result.final_status,
        is_flagged: result.is_flagged,
        mitigations_used: { ...payload.mitigations },
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (err) {
      console.error('Chat query execution failed:', err)
      setError(err.message)
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'ai',
          text: `Query failed: ${err.message}`,
          isError: true,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="page active" id="page-chat">
      <div className="pagehead">
        <div>
          <h1>Chat</h1>
          <div className="sub">Ask questions grounded in your knowledge base</div>
        </div>
        <div className="toggle-row" style={{ gap: '8px' }}>
          <span className="state" id="chatToggleState">
            Mitigation: {isMitigationActive ? 'On' : 'Off'}
          </span>
          <div
            className={`toggle ${isMitigationActive ? 'on' : 'off'} ${
              isUpdatingToggle ? 'opacity-60 cursor-wait' : ''
            }`}
            id="chatToggle"
            onClick={handleToggleMitigation}
            role="button"
            tabIndex={0}
            title={`Mitigation: ${isMitigationActive ? 'On' : 'Off'} (Click to toggle)`}
          >
            <div className="knob" />
          </div>
        </div>
      </div>

      <div className="chatwrap">
        <div className="thread" id="chat-thread">
          {messages.length === 0 ? (
            <div className="p-8 text-center text-text-secondary border border-dashed border-border-strong rounded-lg my-auto">
              <p className="text-sm mb-2 text-text-primary font-medium">No messages yet in this session</p>
              <p className="text-xs text-text-muted mb-4">
                Ask a question to query your indexed knowledge base, or test indirect prompt injection defenses.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  className="btn ghost text-xs py-1 px-3"
                  onClick={() => setInputQuery('Summarize the refund policy from our FAQ.')}
                >
                  Prompt: "Summarize the refund policy from our FAQ."
                </button>
                <button
                  type="button"
                  className="btn ghost text-xs py-1 px-3"
                  onClick={() => setInputQuery("What's the escalation process for a P1 incident?")}
                >
                  Prompt: "What's the escalation process for a P1 incident?"
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`msg-row ${msg.role === 'user' ? 'user' : ''}`}
                id={`msg-row-${idx}`}
              >
                {msg.role === 'user' ? (
                  <div className="bubble-user">{msg.text}</div>
                ) : (
                  <div className="ai-block">
                    <div className="answer-text" id={`chat-answer-${idx}`}>
                      {msg.text}
                    </div>

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="citerow" id={`citerow-${idx}`}>
                        {msg.citations.map((cite, cIdx) => (
                          <div key={cIdx} className="citechip">
                            <span className={`filetag ${cite.type}`}>{cite.badge}</span>
                            <span>{cite.label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.banner && (
                      <div
                        className={`banner ${msg.banner.type}`}
                        id={msg.banner.id || `banner-${idx}`}
                      >
                        {msg.banner.icon}
                        <span>{msg.banner.text}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="msg-row" id="chat-loading-indicator">
              <div className="ai-block">
                <div className="answer-text text-text-muted italic flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-violet animate-pulse" />
                  Retrieving documents and generating response...
                </div>
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {error && (
          <div className="text-xs text-red mb-2 px-2">
            Error: {error}
          </div>
        )}

        <form className="chat-input" onSubmit={handleSend}>
          <input
            type="text"
            id="chat-input-field"
            placeholder="Ask about your documents…"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="iconbtn"
            id="chat-submit-btn"
            disabled={isLoading || !inputQuery.trim()}
            title="Send query"
          >
            <svg
              className="icon"
              viewBox="0 0 24 24"
              style={{ stroke: 'none', fill: 'currentColor' }}
            >
              <path d="M4 12l16-7-6 16-2.5-6.5L4 12z" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  )
}
