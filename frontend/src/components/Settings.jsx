import React, { useState, useEffect, useCallback } from 'react'
import { fetchSettings, updateSettings, resetDemoData } from '../api.js'

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingKey, setSavingKey] = useState(null)
  const [resetting, setResetting] = useState(false)
  const [resetMessage, setResetMessage] = useState(null)

  // Mitigation toggles & threshold state
  const [mitigations, setMitigations] = useState({
    delimiter: false,
    sanitization: false,
    output_filter: false,
    retrieval_score_threshold: false,
    threshold_value: 0.30,
  })

  // System stack configuration
  const [systemInfo, setSystemInfo] = useState({
    llm_model: '',
    llm_base_url: '',
    embedding_model: '',
    vector_store: '',
    active_knowledge_base: '',
  })

  const loadSettings = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchSettings()
      if (data?.mitigations) {
        setMitigations((prev) => ({
          ...prev,
          ...data.mitigations,
          threshold_value:
            data.mitigations.threshold_value != null
              ? Number(data.mitigations.threshold_value)
              : 0.30,
        }))
      }
      if (data?.system_info) {
        setSystemInfo(data.system_info)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
      setError('Unable to load settings from backend service.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()

    // Listen for external mitigation updates (e.g. from Sidebar or Chat)
    const handleMitigationChange = () => {
      loadSettings()
    }
    window.addEventListener('mitigation-settings-changed', handleMitigationChange)
    return () => {
      window.removeEventListener('mitigation-settings-changed', handleMitigationChange)
    }
  }, [loadSettings])

  // Handle individual mitigation toggle
  const handleToggle = async (key) => {
    if (savingKey || resetting) return
    const nextVal = !mitigations[key]
    setSavingKey(key)

    // Optimistic UI update
    setMitigations((prev) => ({ ...prev, [key]: nextVal }))
    setResetMessage(null)

    try {
      const payload = { [key]: nextVal }
      const res = await updateSettings(payload)
      if (res?.mitigations) {
        setMitigations((prev) => ({
          ...prev,
          ...res.mitigations,
          threshold_value:
            res.mitigations.threshold_value != null
              ? Number(res.mitigations.threshold_value)
              : prev.threshold_value,
        }))
      }
      // Broadcast change to other components (Sidebar, Chat)
      window.dispatchEvent(
        new CustomEvent('mitigation-settings-changed', {
          detail: { source: 'settings-screen', key, value: nextVal },
        })
      )
    } catch (err) {
      console.error(`Failed to update setting ${key}:`, err)
      // Revert optimistic update on error
      setMitigations((prev) => ({ ...prev, [key]: !nextVal }))
      setError(`Failed to update ${key}. Please retry.`)
    } finally {
      setSavingKey(null)
    }
  }

  // Handle slider changes for flag threshold
  const handleSliderChange = (e) => {
    const val = parseFloat(e.target.value)
    setMitigations((prev) => ({ ...prev, threshold_value: val }))
    setResetMessage(null)
  }

  const handleSliderCommit = async (val) => {
    const numVal = parseFloat(val)
    setSavingKey('threshold_value')
    try {
      const res = await updateSettings({
        threshold_value: numVal,
        retrieval_score_threshold: true,
      })
      if (res?.mitigations) {
        setMitigations((prev) => ({
          ...prev,
          ...res.mitigations,
          threshold_value:
            res.mitigations.threshold_value != null
              ? Number(res.mitigations.threshold_value)
              : numVal,
        }))
      }
      window.dispatchEvent(
        new CustomEvent('mitigation-settings-changed', {
          detail: { source: 'settings-screen', key: 'threshold_value', value: numVal },
        })
      )
    } catch (err) {
      console.error('Failed to update threshold:', err)
      setError('Failed to update detection threshold.')
    } finally {
      setSavingKey(null)
    }
  }

  // Handle atomic demo reset
  const handleReset = async () => {
    if (resetting) return
    const confirmed = window.confirm(
      'Reset demo data? This will synchronously wipe and rebuild the Chroma collection with baseline documents, clear all SQLite audit logs, and restore default mitigation settings.'
    )
    if (!confirmed) return

    setResetting(true)
    setError(null)
    setResetMessage(null)

    try {
      const res = await resetDemoData()
      setResetMessage({
        type: 'safe',
        text: res?.message || 'Vector store re-indexed and SQLite audit logs cleared.',
        details: `${res?.documents_indexed || 7} baseline documents indexed · ${res?.logs_cleared ?? 0} logs cleared`,
      })

      // Reload settings state
      if (res?.mitigations_reset) {
        setMitigations((prev) => ({
          ...prev,
          ...res.mitigations_reset,
          threshold_value:
            res.mitigations_reset.threshold_value != null
              ? Number(res.mitigations_reset.threshold_value)
              : 0.30,
        }))
      } else {
        await loadSettings()
      }

      // Broadcast reset event to all other components
      window.dispatchEvent(
        new CustomEvent('mitigation-settings-changed', {
          detail: { source: 'settings-screen-reset', reset: true },
        })
      )
    } catch (err) {
      console.error('Failed to reset demo data:', err)
      setError(`Reset failed: ${err.message || 'Unknown error'}`)
    } finally {
      setResetting(false)
    }
  }

  const thresholdDisplay =
    mitigations.threshold_value != null
      ? Number(mitigations.threshold_value).toFixed(2)
      : '0.30'

  return (
    <section className="page active" id="page-settings">
      <div className="pagehead">
        <div>
          <h1>Settings</h1>
          <div className="sub">Mitigation techniques, thresholds, and model configuration</div>
        </div>
      </div>

      {error && (
        <div className="banner danger" style={{ marginBottom: '14px' }}>
          <svg className="icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {resetMessage && (
        <div className={`banner ${resetMessage.type}`} style={{ marginBottom: '14px' }}>
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <div>
            <div>{resetMessage.text}</div>
            {resetMessage.details && (
              <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '2px' }}>
                {resetMessage.details}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card 1: Mitigation Techniques & Detection Threshold */}
      <div className="card" style={{ marginBottom: '14px' }}>
        {/* Row 1: Delimiter */}
        <div className="setting-row">
          <div>
            <div className="title">Delimiter / instruction-hierarchy enforcement</div>
            <div className="desc">
              Wraps retrieved content in explicit tags and instructs the model to never treat content inside them as commands.
            </div>
          </div>
          <div
            id="delimiterToggle"
            className={`toggle ${mitigations.delimiter ? 'on' : 'off'} ${savingKey === 'delimiter' ? 'opacity-60 cursor-wait' : ''}`}
            onClick={() => handleToggle('delimiter')}
            role="switch"
            aria-checked={Boolean(mitigations.delimiter)}
            aria-label="Toggle Delimiter enforcement"
            title={`Delimiter enforcement: ${mitigations.delimiter ? 'On' : 'Off'} (Click to toggle)`}
          >
            <div className="knob" />
          </div>
        </div>

        {/* Row 2: Sanitization with Naive Filter Badge */}
        <div className="setting-row">
          <div>
            <div className="title">
              <span>Input keyword sanitization</span>
              <span className="badge amber" id="naiveFilterBadge" style={{ fontSize: '10px' }}>
                [Naive Keyword Filter — Known Regex Limitations]
              </span>
            </div>
            <div className="desc">
              Strips common injection phrases such as "ignore previous instructions" before a chunk reaches the prompt.
            </div>
          </div>
          <div
            id="sanitizationToggle"
            className={`toggle ${mitigations.sanitization ? 'on' : 'off'} ${savingKey === 'sanitization' ? 'opacity-60 cursor-wait' : ''}`}
            onClick={() => handleToggle('sanitization')}
            role="switch"
            aria-checked={Boolean(mitigations.sanitization)}
            aria-label="Toggle Input keyword sanitization"
            title={`Keyword sanitization: ${mitigations.sanitization ? 'On' : 'Off'} (Click to toggle)`}
          >
            <div className="knob" />
          </div>
        </div>

        {/* Row 3: Output Filtering */}
        <div className="setting-row">
          <div>
            <div className="title">Output filtering</div>
            <div className="desc">
              Checks the model's response for signs of a leaked system prompt before it's returned to the user.
            </div>
          </div>
          <div
            id="outputFilterToggle"
            className={`toggle ${mitigations.output_filter ? 'on' : 'off'} ${savingKey === 'output_filter' ? 'opacity-60 cursor-wait' : ''}`}
            onClick={() => handleToggle('output_filter')}
            role="switch"
            aria-checked={Boolean(mitigations.output_filter)}
            aria-label="Toggle Output filtering"
            title={`Output filtering: ${mitigations.output_filter ? 'On' : 'Off'} (Click to toggle)`}
          >
            <div className="knob" />
          </div>
        </div>

        {/* Row 4: Flag Threshold Slider (Supporting control, not a 4th equal toggle row) */}
        <div className="setting-row">
          <div>
            <div className="title">Flag threshold</div>
            <div className="desc">
              Chunks scoring above this similarity to known attack patterns are flagged for review.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="range"
              id="thresholdSlider"
              min="0.10"
              max="0.90"
              step="0.01"
              value={mitigations.threshold_value ?? 0.30}
              onChange={handleSliderChange}
              onMouseUp={(e) => handleSliderCommit(e.target.value)}
              onTouchEnd={(e) => handleSliderCommit(e.target.value)}
              onKeyUp={(e) => handleSliderCommit(e.target.value)}
              aria-label="Flag threshold slider"
              title={`Flag threshold: ${thresholdDisplay}`}
            />
            <span
              className="badge gray"
              id="thresholdValue"
              style={{ fontFamily: 'var(--mono)', minWidth: '40px', textAlign: 'center' }}
            >
              {thresholdDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* Card 2: Read-Only Model / Stack Config Panel */}
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="infolist" id="stackConfigPanel">
          <div className="row">
            <span>LLM</span>
            <span id="configLlmModel">{systemInfo.llm_model || '—'}</span>
          </div>
          <div className="row">
            <span>Embedding model</span>
            <span id="configEmbeddingModel">{systemInfo.embedding_model || '—'}</span>
          </div>
          <div className="row">
            <span>Vector store</span>
            <span id="configVectorStore">{systemInfo.vector_store || '—'}</span>
          </div>
          <div className="row">
            <span>Knowledge base</span>
            <span id="configKnowledgeBase">{systemInfo.active_knowledge_base || '—'}</span>
          </div>
        </div>
      </div>

      {/* Card 3: Demo Data Reset */}
      <div className="card">
        <div className="setting-row" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="title">Reset demo data</div>
            <div className="desc">
              Clears the audit log and restores the document set to its original, unpoisoned state.
            </div>
          </div>
          <button
            type="button"
            className="btn danger-ghost"
            id="resetDemoBtn"
            onClick={handleReset}
            disabled={resetting}
            style={{ opacity: resetting ? 0.6 : 1, cursor: resetting ? 'wait' : 'pointer' }}
          >
            {resetting ? 'Resetting...' : 'Reset'}
          </button>
        </div>
      </div>
    </section>
  )
}
