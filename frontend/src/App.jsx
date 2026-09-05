import React, { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import LiveTrace from './components/LiveTrace.jsx'
import Chat from './components/Chat.jsx'
import Documents from './components/Documents.jsx'
import AuditLog from './components/AuditLog.jsx'
import TraceDetail from './components/TraceDetail.jsx'

const SCREENS = {
  trace: {
    id: 'trace',
    title: 'Live trace',
    subtitle: 'Real-time view of the RAG security pipeline',
  },
  chat: {
    id: 'chat',
    title: 'Chat',
    subtitle: 'Ask questions grounded in your knowledge base',
  },
  documents: {
    id: 'documents',
    title: 'Documents',
    subtitle: 'Everything Sentinel can retrieve from, grouped into collections',
  },
  audit: {
    id: 'audit',
    title: 'Audit log',
    subtitle: 'Every query, retrieval, and generation — timestamped and exportable',
  },
  replay: {
    id: 'replay',
    title: 'Attack replay',
    subtitle: 'Side-by-side technical trace comparing unmitigated vs. mitigated execution',
  },
  'test-runs': {
    id: 'test-runs',
    title: 'Test suite results',
    subtitle: 'Systematic multi-trial benchmark across all mitigation combinations',
  },
  settings: {
    id: 'settings',
    title: 'Settings',
    subtitle: 'Mitigation techniques, thresholds, and model configuration',
  },
}

function getRouteFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return SCREENS[hash] ? hash : 'trace'
}

export default function App() {
  const [activeRoute, setActiveRoute] = useState(getRouteFromHash)
  const [selectedLog, setSelectedLog] = useState(null)

  useEffect(() => {
    const handleHashChange = () => {
      setActiveRoute(getRouteFromHash())
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigateTo = (routeId) => {
    if (SCREENS[routeId]) {
      window.location.hash = `#/${routeId}`
      setActiveRoute(routeId)
    }
  }

  const handleSelectLog = (log) => {
    setSelectedLog(log)
    navigateTo('replay')
  }

  const currentScreen = SCREENS[activeRoute] || SCREENS.trace

  return (
    <div className="app">
      <Sidebar activeRoute={activeRoute} onNavigate={navigateTo} />

      <main className="content">
        {activeRoute === 'trace' ? (
          <LiveTrace onSelectLog={handleSelectLog} />
        ) : activeRoute === 'chat' ? (
          <Chat />
        ) : activeRoute === 'documents' ? (
          <Documents />
        ) : activeRoute === 'audit' ? (
          <AuditLog onSelectLog={handleSelectLog} />
        ) : activeRoute === 'replay' ? (
          <TraceDetail
            initialLog={selectedLog}
            onBack={() => navigateTo('audit')}
          />
        ) : (
          <section className="page active" id={`page-${currentScreen.id}`}>
            <div className="pagehead">
              <div>
                <h1>{currentScreen.title}</h1>
                <div className="sub">{currentScreen.subtitle}</div>
              </div>
            </div>

            <div className="card">
              <div className="text-sm text-text-secondary">
                Placeholder for {currentScreen.title} screen
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

