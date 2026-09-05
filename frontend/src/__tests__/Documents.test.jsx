import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Documents from '../components/Documents.jsx'
import * as api from '../api.js'

// Mock the api module to assert on pure React DOM rendering and computed classes
vi.mock('../api.js', () => ({
  fetchDocuments: vi.fn(),
  uploadDocument: vi.fn(),
}))

const MOCK_DOCUMENTS_BASELINE = {
  documents: [
    {
      filename: 'employee_handbook.md',
      file_type: 'md',
      size_bytes: 1845,
      status: 'Indexed',
      is_poisoned: false,
      last_modified: '2026-09-04T07:18:24.000000+00:00',
    },
    {
      filename: 'enterprise_terms.md',
      file_type: 'md',
      size_bytes: 2450,
      status: 'Indexed',
      is_poisoned: false,
      last_modified: '2026-09-04T07:18:24.000000+00:00',
    },
    {
      filename: 'faq_doc.md',
      file_type: 'md',
      size_bytes: 3521,
      status: 'Flagged pattern',
      is_poisoned: true,
      last_modified: '2026-09-04T07:18:24.000000+00:00',
    },
    {
      filename: 'incident_runbook.md',
      file_type: 'md',
      size_bytes: 2890,
      status: 'Indexed',
      is_poisoned: false,
      last_modified: '2026-09-04T07:18:24.000000+00:00',
    },
  ],
  total: 4,
}

describe('Documents Component — DOM Rendering, Warn Border & Upload Acceptance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('State 1: Initial Render — displays header, collection chips, dropzone, and document cards', async () => {
    api.fetchDocuments.mockResolvedValueOnce(MOCK_DOCUMENTS_BASELINE)

    render(<Documents />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Documents')
    expect(screen.getByText(/Everything Sentinel can retrieve from/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('doc-grid')).toBeInTheDocument()
      expect(screen.getByTestId('doc-card-employee_handbook.md')).toBeInTheDocument()
      expect(screen.getByTestId('doc-card-faq_doc.md')).toBeInTheDocument()
    })

    // Assert filenames and formatted sizes
    expect(screen.getByText('employee_handbook.md')).toBeInTheDocument()
    expect(screen.getByText('1.8 KB')).toBeInTheDocument()
    expect(screen.getByText('faq_doc.md')).toBeInTheDocument()
    expect(screen.getByText('3.4 KB')).toBeInTheDocument()

    // Assert dropzone exists
    const dropzone = screen.getByTestId('dropzone')
    expect(dropzone).toBeInTheDocument()
    expect(dropzone).toHaveTextContent(/Drag files here/i)
  })

  it('State 2: Acceptance Test — Warn border is driven strictly by backend flag field (is_poisoned), NOT by frontend filename match', async () => {
    // Crucial test:
    // 1. "arbitrary_doc.md" has is_poisoned = true -> MUST get warn border
    // 2. "faq_doc.md" has is_poisoned = false -> MUST NOT get warn border
    const customDocs = {
      documents: [
        {
          filename: 'arbitrary_doc.md',
          file_type: 'md',
          size_bytes: 1200,
          status: 'Flagged pattern',
          is_poisoned: true,
        },
        {
          filename: 'faq_doc.md',
          file_type: 'md',
          size_bytes: 3500,
          status: 'Indexed',
          is_poisoned: false,
        },
      ],
      total: 2,
    }

    api.fetchDocuments.mockResolvedValueOnce(customDocs)

    render(<Documents />)

    await waitFor(() => {
      expect(screen.getByTestId('doc-card-arbitrary_doc.md')).toBeInTheDocument()
    })

    const poisonedCard = screen.getByTestId('doc-card-arbitrary_doc.md')
    const cleanFaqCard = screen.getByTestId('doc-card-faq_doc.md')

    // Poisoned card (is_poisoned: true) must have "doc-card warn"
    expect(poisonedCard.className).toContain('doc-card')
    expect(poisonedCard.className).toContain('warn')
    expect(poisonedCard.getAttribute('data-warn')).toBe('true')
    const poisonedBadge = poisonedCard.querySelector('.badge')
    expect(poisonedBadge.className).toContain('badge red')
    expect(poisonedBadge).toHaveTextContent('Flagged pattern')

    // Clean faq card (is_poisoned: false) must NOT have "warn" class even though filename is "faq_doc.md"
    expect(cleanFaqCard.className).toContain('doc-card')
    expect(cleanFaqCard.className).not.toContain('warn')
    expect(cleanFaqCard.getAttribute('data-warn')).toBe('false')
    const cleanBadge = cleanFaqCard.querySelector('.badge')
    expect(cleanBadge.className).toContain('badge teal')
    expect(cleanBadge).toHaveTextContent('Indexed')
  })

  it('State 3: Upload dropzone interaction and successful synchronous re-indexing', async () => {
    api.fetchDocuments
      .mockResolvedValueOnce(MOCK_DOCUMENTS_BASELINE)
      .mockResolvedValueOnce({
        documents: [
          ...MOCK_DOCUMENTS_BASELINE.documents,
          {
            filename: 'new_policy.md',
            file_type: 'md',
            size_bytes: 512,
            status: 'Indexed',
            is_poisoned: false,
          },
        ],
        total: 5,
      })

    api.uploadDocument.mockResolvedValueOnce({
      filename: 'new_policy.md',
      size_bytes: 512,
      status: 'Indexed',
      is_poisoned: false,
      message: "Document 'new_policy.md' uploaded and indexed successfully.",
    })

    render(<Documents />)

    await waitFor(() => {
      expect(screen.getByTestId('doc-card-faq_doc.md')).toBeInTheDocument()
    })

    const fileInput = screen.getByTestId('document-file-input')
    const file = new File(['# Policy content'], 'new_policy.md', { type: 'text/markdown' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(api.uploadDocument).toHaveBeenCalledWith(file)
    })

    // Confirm success banner is rendered
    await waitFor(() => {
      const banner = screen.getByRole('alert')
      expect(banner.className).toContain('banner safe')
      expect(banner).toHaveTextContent("Document 'new_policy.md' uploaded and indexed successfully.")
    })

    // Confirm fetchDocuments was called again to refresh
    expect(api.fetchDocuments).toHaveBeenCalledTimes(2)
  })

  it('State 4: Drag & Drop upload interaction on dropzone', async () => {
    api.fetchDocuments.mockResolvedValueOnce(MOCK_DOCUMENTS_BASELINE)
    api.uploadDocument.mockResolvedValueOnce({
      filename: 'dropped_notes.txt',
      size_bytes: 256,
      status: 'Indexed',
      is_poisoned: false,
      message: "Document 'dropped_notes.txt' uploaded and indexed successfully.",
    })

    render(<Documents />)

    await waitFor(() => {
      expect(screen.getByTestId('dropzone')).toBeInTheDocument()
    })

    const dropzone = screen.getByTestId('dropzone')
    const file = new File(['Notes content'], 'dropped_notes.txt', { type: 'text/plain' })

    // Simulate drag over
    fireEvent.dragOver(dropzone)
    expect(dropzone.className).toContain('dragover')

    // Simulate drag leave
    fireEvent.dragLeave(dropzone)
    expect(dropzone.className).not.toContain('dragover')

    // Simulate drop
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(api.uploadDocument).toHaveBeenCalledWith(file)
    })
  })

  it('State 5: Unsupported file extension displays error feedback banner', async () => {
    api.fetchDocuments.mockResolvedValueOnce(MOCK_DOCUMENTS_BASELINE)

    render(<Documents />)

    await waitFor(() => {
      expect(screen.getByTestId('doc-grid')).toBeInTheDocument()
    })

    const fileInput = screen.getByTestId('document-file-input')
    const badFile = new File(['binary content'], 'script.exe', { type: 'application/octet-stream' })

    fireEvent.change(fileInput, { target: { files: [badFile] } })

    await waitFor(() => {
      const banner = screen.getByRole('alert')
      expect(banner.className).toContain('banner danger')
      expect(banner).toHaveTextContent(/Only .md and .txt files are supported/i)
    })

    expect(api.uploadDocument).not.toHaveBeenCalled()
  })
})
