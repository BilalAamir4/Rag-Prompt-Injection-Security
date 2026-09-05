import React, { useState, useEffect, useRef } from 'react'
import { fetchDocuments, uploadDocument } from '../api.js'

function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

function getFileTagClass(type) {
  const t = (type || '').toLowerCase()
  if (t === 'pdf') return 'filetag pdf'
  if (t === 'doc' || t === 'docx') return 'filetag doc'
  if (t === 'txt') return 'filetag txt'
  return 'filetag md'
}

function getStatusBadge(doc) {
  const status = doc.status || (doc.is_poisoned ? 'Flagged pattern' : 'Indexed')
  if (status === 'Flagged pattern') {
    return <span className="badge red">Flagged pattern</span>
  }
  if (status === 'Processing') {
    return <span className="badge amber">Processing</span>
  }
  if (status === 'Failed') {
    return <span className="badge gray">Failed</span>
  }
  return <span className="badge teal">Indexed</span>
}

export default function Documents() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [banner, setBanner] = useState(null)
  const [activeCollection, setActiveCollection] = useState('product')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const data = await fetchDocuments()
      setDocuments(data.documents || [])
    } catch (err) {
      setBanner({
        type: 'danger',
        message: `Failed to load documents: ${err.message}`,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  const handleUploadFile = async (file) => {
    if (!file) return

    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.md') && !lowerName.endsWith('.txt')) {
      setBanner({
        type: 'danger',
        message: `Unsupported file '${file.name}'. Only .md and .txt files are supported.`,
      })
      return
    }

    try {
      setUploading(true)
      setBanner(null)
      const res = await uploadDocument(file)
      setBanner({
        type: 'safe',
        message: res.message || `Document '${file.name}' uploaded and indexed successfully.`,
      })
      await loadDocuments()
    } catch (err) {
      setBanner({
        type: 'danger',
        message: err.message || 'Failed to upload document',
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUploadFile(file)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) {
      handleUploadFile(file)
    }
  }

  const triggerFileBrowser = () => {
    if (fileInputRef.current && !uploading) {
      fileInputRef.current.click()
    }
  }

  return (
    <section className="page active" id="page-documents">
      <div className="pagehead">
        <div>
          <h1>Documents</h1>
          <div className="sub">
            Everything Sentinel can retrieve from, grouped into collections
          </div>
        </div>
        <button
          className="btn primary"
          onClick={triggerFileBrowser}
          disabled={uploading}
          type="button"
        >
          {uploading ? 'Indexing...' : 'Upload files'}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt"
        className="hidden"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        data-testid="document-file-input"
      />

      {banner && (
        <div
          className={`banner ${banner.type}`}
          style={{ marginBottom: '16px', width: '100%' }}
          role="alert"
        >
          <svg className="icon" viewBox="0 0 24 24">
            {banner.type === 'safe' ? (
              <>
                <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </>
            )}
          </svg>
          <span>{banner.message}</span>
        </div>
      )}

      {/* Collection chips row */}
      <div className="collection-row">
        <div
          className={`collection-chip ${activeCollection === 'product' ? 'active' : ''}`}
          onClick={() => setActiveCollection('product')}
          role="button"
          tabIndex={0}
        >
          Product docs · {documents.length || 7}
        </div>
        <div
          className={`collection-chip ${activeCollection === 'legal' ? 'active' : ''}`}
          onClick={() => setActiveCollection('legal')}
          role="button"
          tabIndex={0}
        >
          Legal contracts · 42
        </div>
        <div
          className={`collection-chip ${activeCollection === 'support' ? 'active' : ''}`}
          onClick={() => setActiveCollection('support')}
          role="button"
          tabIndex={0}
        >
          Support tickets · 356
        </div>
        <div
          className={`collection-chip ${activeCollection === 'meeting' ? 'active' : ''}`}
          onClick={() => setActiveCollection('meeting')}
          role="button"
          tabIndex={0}
        >
          Meeting notes · 89
        </div>
      </div>

      {/* Document Grid */}
      <div className="doc-grid" data-testid="doc-grid">
        {documents.map((doc) => {
          // The warn border is strictly driven by the backend flag field `is_poisoned` (or status 'Flagged pattern').
          const isWarn = Boolean(doc.is_poisoned || doc.status === 'Flagged pattern')

          return (
            <div
              key={doc.filename}
              className={`doc-card ${isWarn ? 'warn' : ''}`}
              data-testid={`doc-card-${doc.filename}`}
              data-warn={isWarn ? 'true' : 'false'}
            >
              <div className="doc-top">
                <span className={getFileTagClass(doc.file_type)}>
                  {(doc.file_type || 'txt').toUpperCase()}
                </span>
                <div>
                  <div className="fname">{doc.filename}</div>
                  <div className="fmeta">{formatFileSize(doc.size_bytes)}</div>
                </div>
              </div>
              {getStatusBadge(doc)}
            </div>
          )
        })}

        {/* Upload dropzone spanning bottom */}
        <div
          className={`dropzone ${isDragOver ? 'dragover' : ''}`}
          onClick={triggerFileBrowser}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="dropzone"
          role="button"
          tabIndex={0}
        >
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M12 16V6M8 10l4-4 4 4" />
            <path d="M4 18h16" />
          </svg>
          <div>
            {uploading ? (
              <strong style={{ color: 'var(--violet)' }}>
                Uploading & indexing document into Chroma...
              </strong>
            ) : (
              <>
                <strong style={{ color: 'var(--text-secondary)' }}>
                  Drag files here
                </strong>{' '}
                or browse to add them to this collection
              </>
            )}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginTop: '4px',
            }}
          >
            Supports .md and .txt files
          </div>
        </div>
      </div>
    </section>
  )
}
