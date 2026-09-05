import React, { useEffect, useState } from 'react'
import { fetchSettings, updateSettings } from '../api.js'

const NAV_ITEMS = [
  {
    id: 'trace',
    label: 'Live trace',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M3 12h4l2 6 4-14 2 8h6" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M4 5h16v10H8l-4 4V5z" />
      </svg>
    ),
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M4 4h11l4 4v12H4V4z" />
        <path d="M15 4v4h4" />
      </svg>
    ),
  },
  {
    id: 'audit',
    label: 'Audit log',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    id: 'replay',
    label: 'Attack replay',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M1 4v6h6" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
    ),
  },
  {
    id: 'test-runs',
    label: 'Test suite',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </svg>
    ),
  },
]

export default function Sidebar({ activeRoute, onNavigate }) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState(null)

  // Load real backend settings on mount
  const loadSettings = async () => {
    try {
      setError(null)
      const data = await fetchSettings()
      setSettings(data)
    } catch (err) {
      console.error('Failed to load settings in sidebar:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
    // Poll settings every 8 seconds to stay in sync with background runs/resets
    const timer = setInterval(loadSettings, 8000)
    const handleMitigationChange = () => loadSettings()
    window.addEventListener('mitigation-settings-changed', handleMitigationChange)
    return () => {
      clearInterval(timer)
      window.removeEventListener('mitigation-settings-changed', handleMitigationChange)
    }
  }, [])

  // Calculate whether combined mitigation is active from real backend structure
  const m = settings?.mitigations || settings?.active_mitigations
  const isMitigationActive = m
    ? Boolean(m.delimiter || m.sanitization || m.output_filter || m.output_filtering || m.retrieval_score_threshold)
    : false

  const toggleMitigations = async () => {
    if (!settings || updating) return
    const nextState = !isMitigationActive
    setUpdating(true)
    try {
      const updated = await updateSettings({
        delimiter: nextState,
        sanitization: nextState,
        output_filter: nextState,
        retrieval_score_threshold: nextState,
      })
      setSettings(updated)
    } catch (err) {
      console.error('Failed to update mitigation settings:', err)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        </svg>
        <span className="label">Sentinel</span>
      </div>

      <ul className="navlist">
        {NAV_ITEMS.map((item) => {
          const isActive = activeRoute === item.id
          return (
            <li
              key={item.id}
              className={`navitem ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
              data-page={item.id}
            >
              {item.icon}
              <span className="label">{item.label}</span>
            </li>
          )
        })}
      </ul>

      <div className="sidebar-foot">
        <div className="lbl">Mitigation</div>
        <div className="toggle-row">
          <div
            className={`toggle ${isMitigationActive ? 'on' : 'off'} ${updating ? 'opacity-60 cursor-wait' : ''}`}
            onClick={toggleMitigations}
            title={
              loading
                ? 'Loading settings...'
                : error
                ? `Error: ${error}`
                : `Combined mitigation state: ${isMitigationActive ? 'On' : 'Off'} (Click to toggle)`
            }
          >
            <div className="knob" />
          </div>
          <span className="state">
            {loading ? '...' : error ? 'Offline' : isMitigationActive ? 'On' : 'Off'}
          </span>
        </div>
      </div>
    </aside>
  )
}
