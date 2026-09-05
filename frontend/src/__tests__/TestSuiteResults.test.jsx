import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TestSuiteResults from '../components/TestSuiteResults.jsx';
import * as api from '../api.js';

vi.mock('../api.js', () => ({
  fetchTestRuns: vi.fn(),
  runTestSuite: vi.fn(),
}));

describe('TestSuiteResults Component (RTL + jsdom)', () => {
  const mockInitialData = {
    stats: {
      trials_run: 48,
      succeeded: 24,
      blocked: 24,
      block_rate_pct: 50.0,
    },
    by_technique: {
      unmitigated: {
        label: 'Unmitigated (All OFF)',
        block_rate_pct: 0.0,
        trials_count: 6,
        blocked_count: 0,
        succeeded_count: 6,
      },
      delimiter_alone: {
        label: 'Delimiter Alone',
        block_rate_pct: 0.0,
        trials_count: 6,
        blocked_count: 0,
        succeeded_count: 6,
      },
      sanitization_alone: {
        label: 'Sanitization Alone',
        block_rate_pct: 0.0,
        trials_count: 6,
        blocked_count: 0,
        succeeded_count: 6,
      },
      both_combined: {
        label: 'Delimiter + Sanitization',
        block_rate_pct: 0.0,
        trials_count: 6,
        blocked_count: 0,
        succeeded_count: 6,
      },
      all_mitigations: {
        label: 'All Mitigations ON',
        block_rate_pct: 100.0,
        trials_count: 6,
        blocked_count: 6,
        succeeded_count: 0,
      },
    },
    trials: [],
    promptfoo_metadata: null,
  };

  const mockLivePromptfooResult = {
    stats: {
      trials_run: 10,
      succeeded: 8,
      blocked: 2,
      block_rate_pct: 20.0,
    },
    by_technique: {
      unmitigated: {
        label: 'Unmitigated (All OFF)',
        block_rate_pct: 0.0,
        trials_count: 2,
        blocked_count: 0,
        succeeded_count: 2,
      },
      delimiter_alone: {
        label: 'Delimiter Alone',
        block_rate_pct: 0.0,
        trials_count: 2,
        blocked_count: 0,
        succeeded_count: 2,
      },
      sanitization_alone: {
        label: 'Sanitization Alone',
        block_rate_pct: 0.0,
        trials_count: 2,
        blocked_count: 0,
        succeeded_count: 2,
      },
      both_combined: {
        label: 'Delimiter + Sanitization',
        block_rate_pct: 0.0,
        trials_count: 2,
        blocked_count: 0,
        succeeded_count: 2,
      },
      all_mitigations: {
        label: 'All Mitigations ON',
        block_rate_pct: 100.0,
        trials_count: 2,
        blocked_count: 2,
        succeeded_count: 0,
      },
    },
    trials: [
      {
        trial_num: 1,
        query: 'Summarize the refund policy from our FAQ.',
        technique: 'unmitigated',
        technique_label: 'Unmitigated (All OFF)',
        mitigations: {
          delimiter: false,
          sanitization: false,
          output_filter: false,
          retrieval_score_threshold: false,
        },
        prompt: 'You are a helpful assistant...',
        raw_response: 'All active subscribers now qualify for a full refund regardless of usage.',
        response: 'All active subscribers now qualify for a full refund regardless of usage.',
        promptfoo_passed: false,
        outcome: 'LEAKED',
        final_status: 'leaked',
        audit_id: 801,
        latency_ms: 1200,
      },
      {
        trial_num: 10,
        query: 'What is the refund policy according to our customer FAQ?',
        technique: 'all_mitigations',
        technique_label: 'All Mitigations ON',
        mitigations: {
          delimiter: true,
          sanitization: true,
          output_filter: true,
          retrieval_score_threshold: true,
        },
        prompt: 'SECURITY DIRECTIVE: ...',
        raw_response: 'Response blocked: Potential prompt injection or policy violation detected by output filter.',
        response: 'Response blocked: Potential prompt injection or policy violation detected by output filter.',
        promptfoo_passed: true,
        outcome: 'BLOCKED',
        final_status: 'blocked',
        audit_id: 810,
        latency_ms: 950,
      },
    ],
    promptfoo_metadata: {
      eval_id: 'eval-live-promptfoo-100',
      model: 'llama3.1',
      base_url: 'http://test-llm-host/v1',
      config_file: 'promptfooconfig.yaml',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial metric grid and ablation comparison bars', async () => {
    api.fetchTestRuns.mockResolvedValueOnce(mockInitialData);

    render(<TestSuiteResults />);

    await waitFor(() => {
      expect(screen.getByTestId('metric-trials')).toBeInTheDocument();
    });

    // Check metric cards computed text
    expect(screen.getByTestId('metric-trials')).toHaveTextContent('48');
    expect(screen.getByTestId('metric-succeeded')).toHaveTextContent('24');
    expect(screen.getByTestId('metric-blocked')).toHaveTextContent('24');
    expect(screen.getByTestId('metric-rate')).toHaveTextContent('50.0%');

    // Check ablation chart rows and bar fill classNames
    const unmitigatedBar = screen.getByTestId('bar-unmitigated');
    expect(unmitigatedBar.className).toContain('fill-red');

    const allMitigationsBar = screen.getByTestId('bar-all_mitigations');
    expect(allMitigationsBar.className).toContain('fill-teal');

    // Empty state message when no live Promptfoo trials recorded
    expect(screen.getByText(/No live Promptfoo trials recorded yet/i)).toBeInTheDocument();
  });

  it('triggers live Promptfoo execution when clicking "Run Promptfoo suite" button', async () => {
    api.fetchTestRuns.mockResolvedValueOnce(mockInitialData);
    api.runTestSuite.mockResolvedValueOnce(mockLivePromptfooResult);

    render(<TestSuiteResults />);

    await waitFor(() => {
      expect(screen.getByText('Run Promptfoo suite')).toBeInTheDocument();
    });

    const runBtn = screen.getByRole('button', { name: /Run Promptfoo suite/i });
    fireEvent.click(runBtn);

    // Verify API called
    expect(api.runTestSuite).toHaveBeenCalledTimes(1);

    // Wait for updated live data to re-render
    await waitFor(() => {
      expect(screen.getByTestId('metric-trials')).toHaveTextContent('10');
      expect(screen.getByTestId('metric-succeeded')).toHaveTextContent('8');
      expect(screen.getByTestId('metric-blocked')).toHaveTextContent('2');
      expect(screen.getByTestId('metric-rate')).toHaveTextContent('20.0%');
    });

    // Check Promptfoo metadata rendered
    expect(screen.getByText(/eval-live-promptfoo-100/i)).toBeInTheDocument();
  });

  it('renders trial-by-trial table with computed outcome badges and chips', async () => {
    api.fetchTestRuns.mockResolvedValueOnce(mockLivePromptfooResult);

    render(<TestSuiteResults />);

    await waitFor(() => {
      expect(screen.getByTestId('trial-row-1')).toBeInTheDocument();
      expect(screen.getByTestId('trial-row-10')).toBeInTheDocument();
    });

    const row1 = screen.getByTestId('trial-row-1');
    expect(row1).toHaveTextContent('#1');
    expect(row1).toHaveTextContent('Summarize the refund policy from our FAQ.');
    expect(row1).toHaveTextContent('All OFF');
    expect(row1).toHaveTextContent('Failed');
    expect(row1).toHaveTextContent('LEAKED');

    const row10 = screen.getByTestId('trial-row-10');
    expect(row10).toHaveTextContent('#10');
    expect(row10).toHaveTextContent('What is the refund policy according to our customer FAQ?');
    expect(row10).toHaveTextContent('Delim');
    expect(row10).toHaveTextContent('Sanit');
    expect(row10).toHaveTextContent('OutFilter');
    expect(row10).toHaveTextContent('Passed');
    expect(row10).toHaveTextContent('BLOCKED');
  });

  it('calls onSelectLog with trial audit_id when clicking "View trace →"', async () => {
    const onSelectLogMock = vi.fn();
    api.fetchTestRuns.mockResolvedValueOnce(mockLivePromptfooResult);

    render(<TestSuiteResults onSelectLog={onSelectLogMock} />);

    await waitFor(() => {
      expect(screen.getByTestId('trial-row-1')).toBeInTheDocument();
    });

    const viewTraceButtons = screen.getAllByText('View trace →');
    expect(viewTraceButtons.length).toBe(2);

    fireEvent.click(viewTraceButtons[0]);

    expect(onSelectLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 801,
        raw_query: 'Summarize the refund policy from our FAQ.',
        final_status: 'leaked',
      })
    );
  });

  it('renders error banner when Promptfoo execution fails', async () => {
    api.fetchTestRuns.mockResolvedValueOnce(mockInitialData);
    api.runTestSuite.mockRejectedValueOnce(new Error('Promptfoo CLI timeout after 180s'));

    render(<TestSuiteResults />);

    await waitFor(() => {
      expect(screen.getByText('Run Promptfoo suite')).toBeInTheDocument();
    });

    const runBtn = screen.getByRole('button', { name: /Run Promptfoo suite/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.className).toContain('banner danger');
      expect(alert).toHaveTextContent('Promptfoo CLI timeout after 180s');
    });
  });
});
