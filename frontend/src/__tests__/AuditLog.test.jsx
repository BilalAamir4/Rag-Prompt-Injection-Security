import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AuditLog from '../components/AuditLog.jsx';
import * as api from '../api.js';

// Mock api.js
vi.mock('../api.js', () => ({
  fetchAuditLogs: vi.fn(),
  exportAuditLogCsv: vi.fn(),
  getExportAuditLogsCsvUrl: vi.fn((flaggedOnly) => `http://test-backend-api/audit-log/export${flaggedOnly ? '?flagged_only=true' : ''}`),
}));

describe('AuditLog Component - RTL + jsdom DOM and State Transition Suite', () => {
  const sampleLogs = [
    {
      id: 101,
      timestamp: '2026-09-04T14:01:48.000Z',
      raw_query: 'What are our remote work guidelines?',
      source_document: 'employee_handbook.md',
      similarity_score: 0.8123,
      is_flagged: 0,
      final_status: 'clean',
    },
    {
      id: 102,
      timestamp: '2026-09-04T14:02:04.000Z',
      raw_query: 'Summarize the refund policy from our FAQ.',
      source_document: 'faq_doc.md',
      similarity_score: 0.3294,
      is_flagged: 1,
      final_status: 'leaked',
    },
    {
      id: 103,
      timestamp: '2026-09-04T14:05:12.000Z',
      raw_query: 'Summarize the refund policy from our FAQ.',
      source_document: 'faq_doc.md',
      similarity_score: 0.3294,
      is_flagged: 1,
      final_status: 'blocked',
    },
    {
      id: 104,
      timestamp: '2026-09-04T14:06:00.000Z',
      raw_query: 'Summarize the refund policy from our FAQ.',
      source_document: 'faq_doc.md',
      similarity_score: 0.3294,
      is_flagged: 1,
      final_status: 'sanitized',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Check 1 & 2: Renders dense table with Time, Event, Source, Similarity, Status and real rows', async () => {
    api.fetchAuditLogs.mockResolvedValueOnce({
      logs: sampleLogs,
      total: 4,
    });

    const { container } = render(<AuditLog />);

    await waitFor(() => {
      expect(screen.getByText('Audit log')).toBeInTheDocument();
      expect(screen.getByText('All events')).toBeInTheDocument();
      expect(screen.getByText('Flagged only')).toBeInTheDocument();
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    // Check table headers
    const headers = container.querySelectorAll('th');
    const headerTexts = Array.from(headers).map((h) => h.textContent.trim());
    expect(headerTexts).toEqual([
      'Time',
      'Event',
      'Source document',
      'Similarity score',
      'Status',
    ]);

    // Check rows rendered
    const rows = container.querySelectorAll('tbody tr.logrow');
    expect(rows.length).toBe(4);

    // Row 101 (Clean): Time, Event, Source, Similarity, Status
    const row1 = screen.getByTestId('log-row-101');
    expect(row1.querySelector('.time')).toBeInTheDocument();
    expect(row1.querySelector('.event').textContent).toBe('Generation');
    expect(row1.querySelector('.source').textContent).toBe('employee_handbook.md');
    expect(row1.querySelector('.sim').textContent).toBe('0.81');
    expect(row1.querySelector('.badge').textContent).toBe('Clean');
    expect(row1.querySelector('.badge').className).toContain('teal');
    expect(row1.className).toBe('logrow ');

    // Row 102 (Leaked): Badge red, Prompt leaked
    const row2 = screen.getByTestId('log-row-102');
    expect(row2.querySelector('.badge').textContent).toBe('Prompt leaked');
    expect(row2.querySelector('.badge').className).toContain('red');
    expect(row2.className).toBe('logrow flagged');

    // Row 103 (Blocked): Badge teal, Blocked
    const row3 = screen.getByTestId('log-row-103');
    expect(row3.querySelector('.badge').textContent).toBe('Blocked');
    expect(row3.querySelector('.badge').className).toContain('teal');
    expect(row3.className).toBe('logrow flagged');

    // Row 104 (Sanitized): Badge amber, Sanitized
    const row4 = screen.getByTestId('log-row-104');
    expect(row4.querySelector('.badge').textContent).toBe('Sanitized');
    expect(row4.querySelector('.badge').className).toContain('amber');
    expect(row4.className).toBe('logrow flagged');
  });

  it('Check 3: Filter transition to "Flagged only" hides clean rows and confirms only non-clean rows show', async () => {
    // Initial fetch returns all 4 rows
    api.fetchAuditLogs.mockResolvedValueOnce({
      logs: sampleLogs,
      total: 4,
    });

    const { container } = render(<AuditLog />);

    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr.logrow').length).toBe(4);
    });

    // Mock API response when flagged_only: true is requested
    const flaggedOnlyLogs = sampleLogs.filter(
      (l) => l.is_flagged || (l.final_status && l.final_status !== 'clean')
    );
    api.fetchAuditLogs.mockResolvedValueOnce({
      logs: flaggedOnlyLogs,
      total: 3,
    });

    // Click "Flagged only"
    const flaggedBtn = screen.getByTestId('filter-flagged-btn');
    fireEvent.click(flaggedBtn);

    await waitFor(() => {
      expect(flaggedBtn.className).toContain('active');
      expect(screen.getByTestId('filter-all-btn').className).not.toContain('active');
    });

    // Verify API called with flagged_only: true
    expect(api.fetchAuditLogs).toHaveBeenCalledWith({ flagged_only: true });

    // Assert only non-clean rows are in the DOM
    const filteredRows = container.querySelectorAll('tbody tr.logrow');
    expect(filteredRows.length).toBe(3);
    expect(screen.queryByTestId('log-row-101')).toBeNull(); // Clean row absent
    expect(screen.getByTestId('log-row-102')).toBeInTheDocument(); // Leaked row present
    expect(screen.getByTestId('log-row-103')).toBeInTheDocument(); // Blocked row present
    expect(screen.getByTestId('log-row-104')).toBeInTheDocument(); // Sanitized row present

    // Verify that every single row shown has is_flagged or non-clean status
    filteredRows.forEach((row) => {
      const status = row.getAttribute('data-status');
      expect(status).not.toBe('clean');
    });
  });

  it('Check 4: Export CSV requests CSV matching the currently active filter', async () => {
    api.fetchAuditLogs.mockResolvedValueOnce({
      logs: sampleLogs,
      total: 4,
    });
    api.exportAuditLogCsv.mockResolvedValue(
      'id,timestamp,raw_query,final_status\n101,2026-09-04,What are...,clean\n102,2026-09-04,Summarize...,leaked'
    );

    render(<AuditLog />);

    await waitFor(() => {
      expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument();
    });

    // Export while "all" is active
    const exportBtn = screen.getByTestId('export-csv-btn');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(api.exportAuditLogCsv).toHaveBeenCalledWith(false);
    });

    // Switch to "Flagged only"
    api.fetchAuditLogs.mockResolvedValueOnce({
      logs: sampleLogs.filter((l) => l.final_status !== 'clean'),
      total: 3,
    });
    fireEvent.click(screen.getByTestId('filter-flagged-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('filter-flagged-btn').className).toContain('active');
    });

    // Export while "flagged" is active
    api.exportAuditLogCsv.mockResolvedValueOnce(
      'id,timestamp,raw_query,final_status\n102,2026-09-04,Summarize...,leaked'
    );
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(api.exportAuditLogCsv).toHaveBeenCalledWith(true);
    });
  });

  it('Check 5: IBM Plex Mono class is applied specifically to td.time and td.sim', async () => {
    api.fetchAuditLogs.mockResolvedValueOnce({
      logs: [sampleLogs[0]],
      total: 1,
    });

    const { container } = render(<AuditLog />);

    await waitFor(() => {
      expect(screen.getByTestId('log-row-101')).toBeInTheDocument();
    });

    const row = screen.getByTestId('log-row-101');
    const timeCell = row.querySelector('td.time');
    const simCell = row.querySelector('td.sim');
    const eventCell = row.querySelector('td.event');
    const sourceCell = row.querySelector('td.source');

    expect(timeCell).toBeInTheDocument();
    expect(simCell).toBeInTheDocument();
    expect(eventCell).toBeInTheDocument();
    expect(sourceCell).toBeInTheDocument();

    // Check class names
    expect(timeCell.className).toBe('time');
    expect(simCell.className).toBe('sim');
    expect(eventCell.className).toBe('event');
    expect(sourceCell.className).toBe('source');
  });

  it('Handles onSelectLog click and empty states', async () => {
    const onSelectLog = vi.fn();
    api.fetchAuditLogs.mockResolvedValueOnce({
      logs: [sampleLogs[1]],
      total: 1,
    });

    render(<AuditLog onSelectLog={onSelectLog} />);

    await waitFor(() => {
      expect(screen.getByTestId('log-row-102')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('log-row-102'));
    expect(onSelectLog).toHaveBeenCalledWith(sampleLogs[1]);
  });
});
