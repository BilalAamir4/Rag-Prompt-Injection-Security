import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import Settings from '../components/Settings.jsx'
import * as api from '../api.js'

vi.mock('../api.js', () => ({
  fetchSettings: vi.fn(),
  updateSettings: vi.fn(),
  resetDemoData: vi.fn(),
}))

describe('Settings Component (RTL + jsdom DOM and State Transition Suite)', () => {
  const mockInitialSettings = {
    mitigations: {
      delimiter: false,
      sanitization: false,
      output_filter: false,
      retrieval_score_threshold: false,
      threshold_value: 0.30,
    },
    system_info: {
      llm_model: 'llama3.1',
      llm_base_url: 'http://localhost:11434/v1',
      embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
      vector_store: 'Chroma',
      active_knowledge_base: 'sentinel_docs',
      data_dir: './data',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    api.fetchSettings.mockResolvedValue(mockInitialSettings)
    api.updateSettings.mockImplementation(async (payload) => ({
      status: 'updated',
      mitigations: { ...mockInitialSettings.mitigations, ...payload },
      system_info: mockInitialSettings.system_info,
    }))
    api.resetDemoData.mockResolvedValue({
      status: 'reset_complete',
      message: 'Vector store re-indexed and SQLite audit logs cleared.',
      documents_indexed: 7,
      removed_uploaded_files: [],
      logs_cleared: 5,
      mitigations_reset: {
        delimiter: false,
        sanitization: false,
        output_filter: false,
        retrieval_score_threshold: false,
        threshold_value: 0.30,
      },
    })
    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
  })

  it('State 1: Initial Render — displays 3 mitigation rows, Naive Filter badge, slider, config panel, and reset button', async () => {
    const { container } = render(<Settings />)

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    // Verify 3 distinct mitigation toggle rows
    const delimiterToggle = container.querySelector('#delimiterToggle')
    const sanitizationToggle = container.querySelector('#sanitizationToggle')
    const outputFilterToggle = container.querySelector('#outputFilterToggle')

    expect(delimiterToggle).toBeInTheDocument()
    expect(delimiterToggle.className).toContain('toggle off')

    expect(sanitizationToggle).toBeInTheDocument()
    expect(sanitizationToggle.className).toContain('toggle off')

    expect(outputFilterToggle).toBeInTheDocument()
    expect(outputFilterToggle.className).toContain('toggle off')

    // Verify Naive Filter badge next to sanitization with EXACT locked text
    const naiveBadge = container.querySelector('#naiveFilterBadge')
    expect(naiveBadge).toBeInTheDocument()
    expect(naiveBadge.textContent.trim()).toBe('[Naive Keyword Filter — Known Regex Limitations]')
    expect(naiveBadge.className).toContain('badge')

    // Verify separate flag threshold slider (not a 4th toggle row)
    const slider = container.querySelector('#thresholdSlider')
    const sliderReadout = container.querySelector('#thresholdValue')
    expect(slider).toBeInTheDocument()
    expect(slider.getAttribute('type')).toBe('range')
    expect(sliderReadout).toBeInTheDocument()
    expect(sliderReadout.textContent.trim()).toBe('0.30')

    // Verify read-only model/stack config info panel populated from GET /settings
    expect(container.querySelector('#configLlmModel').textContent).toBe('llama3.1')
    expect(container.querySelector('#configEmbeddingModel').textContent).toBe('sentence-transformers/all-MiniLM-L6-v2')
    expect(container.querySelector('#configVectorStore').textContent).toBe('Chroma')
    expect(container.querySelector('#configKnowledgeBase').textContent).toBe('sentinel_docs')

    // Verify Reset demo data button
    const resetBtn = container.querySelector('#resetDemoBtn')
    expect(resetBtn).toBeInTheDocument()
    expect(resetBtn.textContent.trim()).toBe('Reset')
  })

  it('State 2: Toggle Interaction — flips individual mitigation toggles and calls updateSettings with no restart', async () => {
    const { container } = render(<Settings />)

    await waitFor(() => {
      expect(container.querySelector('#delimiterToggle')).toBeInTheDocument()
    })

    const delimiterToggle = container.querySelector('#delimiterToggle')
    expect(delimiterToggle.className).toContain('toggle off')

    // Click delimiter toggle
    fireEvent.click(delimiterToggle)

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({ delimiter: true })
      expect(delimiterToggle.className).toContain('toggle on')
    })

    // Click sanitization toggle
    const sanitizationToggle = container.querySelector('#sanitizationToggle')
    fireEvent.click(sanitizationToggle)

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({ sanitization: true })
      expect(sanitizationToggle.className).toContain('toggle on')
    })

    // Click output filter toggle
    const outputFilterToggle = container.querySelector('#outputFilterToggle')
    fireEvent.click(outputFilterToggle)

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({ output_filter: true })
      expect(outputFilterToggle.className).toContain('toggle on')
    })
  })

  it('State 3: Flag Threshold Slider — live numeric readout updates and commits to backend via updateSettings', async () => {
    const { container } = render(<Settings />)

    await waitFor(() => {
      expect(container.querySelector('#thresholdSlider')).toBeInTheDocument()
    })

    const slider = container.querySelector('#thresholdSlider')
    const readout = container.querySelector('#thresholdValue')

    // Slide threshold to 0.45
    fireEvent.change(slider, { target: { value: '0.45' } })
    expect(readout.textContent.trim()).toBe('0.45')

    // Commit change on mouseup
    fireEvent.mouseUp(slider, { target: { value: '0.45' } })

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        threshold_value: 0.45,
        retrieval_score_threshold: true,
      })
    })
  })

  it('State 4: Reset Demo Data — calls resetDemoData, shows feedback banner, and restores baseline state', async () => {
    const { container } = render(<Settings />)

    await waitFor(() => {
      expect(container.querySelector('#resetDemoBtn')).toBeInTheDocument()
    })

    const resetBtn = container.querySelector('#resetDemoBtn')
    fireEvent.click(resetBtn)

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled()
      expect(api.resetDemoData).toHaveBeenCalled()
    })

    // Verify success banner appears
    await waitFor(() => {
      expect(screen.getByText(/Vector store re-indexed and SQLite audit logs cleared/i)).toBeInTheDocument()
      expect(screen.getByText(/7 baseline documents indexed/i)).toBeInTheDocument()
    })

    // Verify toggles remain in clean default state
    expect(container.querySelector('#delimiterToggle').className).toContain('toggle off')
    expect(container.querySelector('#sanitizationToggle').className).toContain('toggle off')
    expect(container.querySelector('#outputFilterToggle').className).toContain('toggle off')
  })

  it('State 5: Config Info Panel Dynamic Provider Swap Reflection — updates automatically from API data', async () => {
    // Mock future provider swap response (e.g. OpenAI GPT-4o-mini provider)
    api.fetchSettings.mockResolvedValueOnce({
      mitigations: mockInitialSettings.mitigations,
      system_info: {
        llm_model: 'gpt-4o-mini',
        llm_base_url: 'https://api.openai.com/v1',
        embedding_model: 'text-embedding-3-small',
        vector_store: 'Chroma Persistent',
        active_knowledge_base: 'enterprise_collection',
        data_dir: '/mnt/volume/data',
      },
    })

    const { container } = render(<Settings />)

    await waitFor(() => {
      expect(container.querySelector('#configLlmModel').textContent).toBe('gpt-4o-mini')
    })

    expect(container.querySelector('#configEmbeddingModel').textContent).toBe('text-embedding-3-small')
    expect(container.querySelector('#configVectorStore').textContent).toBe('Chroma Persistent')
    expect(container.querySelector('#configKnowledgeBase').textContent).toBe('enterprise_collection')
  })
})
