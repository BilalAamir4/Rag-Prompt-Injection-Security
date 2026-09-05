/**
 * Sentinel RAG — Central API Client
 *
 * This module is the single, centralized place in the frontend that reads
 * import.meta.env.VITE_API_BASE_URL and constructs backend URLs.
 * Every screen and component imports API functions from here.
 */

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export function getApiBaseUrl() {
  return API_BASE_URL;
}

/**
 * Fetch active settings, including active mitigation toggles and flag threshold.
 * Calls GET /settings
 */
export async function fetchSettings() {
  const response = await fetch(`${API_BASE_URL}/settings`);
  if (!response.ok) {
    throw new Error(`Failed to fetch settings: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Update mitigation toggles and/or threshold.
 * Calls POST /settings
 */
export async function updateSettings(settingsUpdate) {
  const response = await fetch(`${API_BASE_URL}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsUpdate),
  });
  if (!response.ok) {
    throw new Error(`Failed to update settings: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Check backend system and database health.
 * Calls GET /health
 */
export async function fetchHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch audit logs with optional pagination and filtering.
 * Calls GET /audit-log
 */
export async function fetchAuditLogs(params = {}) {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', params.limit);
  if (params.offset !== undefined) query.set('offset', params.offset);
  if (params.flagged_only !== undefined) query.set('flagged_only', params.flagged_only);

  const qs = query.toString();
  const url = `${API_BASE_URL}/audit-log${qs ? `?${qs}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audit logs: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch a single audit log entry by ID for Trace Detail / Attack Replay.
 * Calls GET /audit-log/{id}
 */
export async function fetchAuditLogById(logId) {
  const response = await fetch(`${API_BASE_URL}/audit-log/${logId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch audit log ${logId}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Execute query through RAG pipeline.
 * Calls POST /query
 */
export async function sendQuery(payload) {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Query execution failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch knowledge base documents list.
 * Calls GET /documents
 */
export async function fetchDocuments() {
  const response = await fetch(`${API_BASE_URL}/documents`);
  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Upload a document (.md or .txt) and trigger synchronous re-indexing.
 * Calls POST /documents/upload
 */
export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch (_) {}
    throw new Error(`Upload failed: ${errorDetail}`);
  }

  return response.json();
}

/**
 * Returns the full URL for downloading audit logs as CSV.
 * Honors flagged_only filtering.
 */
export function getExportAuditLogsCsvUrl(flagged_only = false) {
  return `${API_BASE_URL}/audit-log/export${flagged_only ? '?flagged_only=true' : ''}`;
}

/**
 * Fetch CSV export text for audit logs.
 * Calls GET /audit-log/export
 */
export async function exportAuditLogCsv(flagged_only = false) {
  const url = getExportAuditLogsCsvUrl(flagged_only);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to export audit logs CSV: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Fetch test suite benchmark results, statistics, and ablation matrix.
 * Calls GET /test-runs
 */
export async function fetchTestRuns() {
  const response = await fetch(`${API_BASE_URL}/test-runs`);
  if (!response.ok) {
    throw new Error(`Failed to fetch test runs: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Trigger a fresh live Promptfoo test suite evaluation.
 * Calls POST /test-runs/run
 */
export async function runTestSuite() {
  const response = await fetch(`${API_BASE_URL}/test-runs/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    let errorDetail = `${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch (_) {}
    throw new Error(`Test suite run failed: ${errorDetail}`);
  }
  return response.json();
}

/**
 * Reset demo data: synchronous wipe & rebuild of Chroma collection,
 * clear SQLite audit log, and restore default mitigation settings.
 * Calls POST /settings/reset
 */
export async function resetDemoData() {
  const response = await fetch(`${API_BASE_URL}/settings/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    let errorDetail = `${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch (_) {}
    throw new Error(`Reset demo data failed: ${errorDetail}`);
  }
  return response.json();
}

