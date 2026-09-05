import React, { useState, useEffect, useCallback } from 'react';
import { fetchAuditLogs, exportAuditLogCsv, getExportAuditLogsCsvUrl } from '../api';

function formatTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toTimeString().slice(0, 8);
  } catch (_) {
    return isoString;
  }
}

function badgeColor(status) {
  switch (status?.toLowerCase()) {
    case 'leaked':
      return 'red';
    case 'blocked':
      return 'teal';
    case 'sanitized':
      return 'amber';
    case 'flagged':
      return 'red';
    case 'clean':
      return 'teal';
    default:
      return 'gray';
  }
}

function badgeText(status) {
  if (!status) return 'Logged';
  const s = status.toLowerCase();
  if (s === 'leaked') return 'Prompt leaked';
  if (s === 'blocked') return 'Blocked';
  if (s === 'sanitized') return 'Sanitized';
  if (s === 'clean') return 'Clean';
  if (s === 'flagged') return 'Flagged';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function AuditLog({ onSelectLog }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'flagged'
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [lastExported, setLastExported] = useState(null);

  const loadLogs = useCallback(async (currentFilter) => {
    setLoading(true);
    setError(null);
    try {
      const isFlaggedOnly = currentFilter === 'flagged';
      const data = await fetchAuditLogs({ flagged_only: isFlaggedOnly });
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(filter);
  }, [filter, loadLogs]);

  const handleFilterChange = (newFilter) => {
    if (newFilter !== filter) {
      setFilter(newFilter);
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const isFlaggedOnly = filter === 'flagged';
      const csvContent = await exportAuditLogCsv(isFlaggedOnly);
      setLastExported({
        filter,
        content: csvContent,
        timestamp: new Date().toISOString(),
      });

      if (typeof window !== 'undefined') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL?.createObjectURL
          ? window.URL.createObjectURL(blob)
          : getExportAuditLogsCsvUrl(isFlaggedOnly);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', isFlaggedOnly ? 'audit_logs_flagged.csv' : 'audit_logs.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('Failed to export CSV:', err);
      setError(err.message || 'Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  // Filter in-memory as defense-in-depth to guarantee UI consistency with filter state
  const displayedLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return Boolean(log.is_flagged || (log.final_status && log.final_status.toLowerCase() !== 'clean'));
  });

  return (
    <section className="page active" id="page-audit">
      <div className="pagehead">
        <div>
          <h1>Audit log</h1>
          <div className="sub">Every query, retrieval, and generation — timestamped and exportable</div>
        </div>
        <button
          type="button"
          className="btn ghost"
          id="export-csv-btn"
          data-testid="export-csv-btn"
          onClick={handleExportCsv}
          disabled={isExporting}
        >
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="filterbar" role="tablist" aria-label="Audit log filter">
        <button
          type="button"
          className={`filterbtn ${filter === 'all' ? 'active' : ''}`}
          id="filter-all-btn"
          data-testid="filter-all-btn"
          data-filter="all"
          onClick={() => handleFilterChange('all')}
        >
          All events
        </button>
        <button
          type="button"
          className={`filterbtn ${filter === 'flagged' ? 'active' : ''}`}
          id="filter-flagged-btn"
          data-testid="filter-flagged-btn"
          data-filter="flagged"
          onClick={() => handleFilterChange('flagged')}
        >
          Flagged only
        </button>
      </div>

      {error && (
        <div
          className="banner danger"
          id="audit-error-banner"
          data-testid="audit-error-banner"
          style={{ marginBottom: '14px' }}
        >
          <span>Error loading audit logs: {error}</span>
        </div>
      )}

      <div
        className="card"
        style={{ padding: 0, overflow: 'hidden' }}
        data-testid="audit-table-card"
        data-current-filter={filter}
        data-row-count={displayedLogs.length}
        data-last-exported-filter={lastExported ? lastExported.filter : ''}
      >
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Source document</th>
              <th>Similarity score</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody data-testid="audit-table-body">
            {loading ? (
              <tr className="logrow" data-testid="logrow-loading">
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  Loading audit logs...
                </td>
              </tr>
            ) : displayedLogs.length === 0 ? (
              <tr className="logrow" data-testid="logrow-empty">
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  {filter === 'flagged' ? 'No flagged audit events found' : 'No audit log events found'}
                </td>
              </tr>
            ) : (
              displayedLogs.map((log) => {
                const isFlagged = Boolean(
                  log.is_flagged || (log.final_status && log.final_status.toLowerCase() !== 'clean')
                );
                const simScore =
                  log.similarity_score != null ? Number(log.similarity_score).toFixed(2) : '—';
                const eventName = log.event || 'Generation';

                return (
                  <tr
                    key={log.id}
                    className={`logrow ${isFlagged ? 'flagged' : ''}`}
                    data-testid={`log-row-${log.id}`}
                    data-status={log.final_status}
                    data-is-flagged={String(isFlagged)}
                    onClick={() => onSelectLog && onSelectLog(log)}
                    style={onSelectLog ? { cursor: 'pointer' } : undefined}
                  >
                    <td className="time" title={log.timestamp}>
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="event">{eventName}</td>
                    <td className="source">{log.source_document || '—'}</td>
                    <td className="sim">{simScore}</td>
                    <td>
                      <span className={`badge ${badgeColor(log.final_status)}`}>
                        {badgeText(log.final_status)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
