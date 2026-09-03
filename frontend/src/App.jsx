import React from 'react'

function App() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'Not configured'

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold text-[#8B7FE8]">Sentinel RAG</h1>
        <p className="text-sm text-[#8A8CA0]">
          API Base URL:{' '}
          <span className="font-mono text-[#6FBFA0]">{apiBaseUrl}</span>
        </p>
      </div>
    </main>
  )
}

export default App
