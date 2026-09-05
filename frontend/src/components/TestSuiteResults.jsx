import React, { useState, useEffect } from 'react'
import { fetchTestRuns, runTestSuite } from '../api.js'

export default function TestSuiteResults({ onSelectLog }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetchTestRuns()
      setData(res)
    } catch (err) {
      setError(err.message || 'Failed to load test suite results')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleRunSuite = async () => {
    try {
      setRunning(true)
      setError(null)
      const res = await runTestSuite()
      setData(res)
    } catch (err) {
      setError(err.message || 'Failed to execute Promptfoo test suite')
    } finally {
      setRunning(false)
    }
  }

  const stats = data?.stats || {
    trials_run: 0,
    succeeded: 0,
    blocked: 0,
    block_rate_pct: 0,
  }

  const byTechnique = data?.by_technique || {}
  const trials = data?.trials || []
  const pfMeta = data?.promptfoo_metadata

  const techniqueOrder = [
    'unmitigated',
    'delimiter_alone',
    'sanitization_alone',
    'both_combined',
    'all_mitigations',
  ]

  return (
    <section className="page active" id="page-test-runs">
      <div className="pagehead">
        <div>
          <h1>Test suite results</h1>
          <div className="sub">
            Systematic multi-trial benchmark across all mitigation combinations via Promptfoo
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            id="run-promptfoo-btn"
            className="btn primary flex items-center gap-2"
            onClick={handleRunSuite}
            disabled={running || loading}
          >
            {running ? (
              <>
                <svg className="icon animate-spin" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Running Promptfoo suite...</span>
              </>
            ) : (
              <>
                <svg className="icon" viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                </svg>
                <span>Run Promptfoo suite</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="banner danger mb-4" role="alert">
          <svg className="icon flex-shrink-0" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="banner-text">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Header Metric Grid */}
      <div className="metric-grid mb-4">
        <div className="card metric-card" data-testid="metric-trials">
          <div className="metric-label">Trials run</div>
          <div className="metric-val">{stats.trials_run}</div>
          <div className="metric-sub">Multi-trial evaluation</div>
        </div>

        <div className="card metric-card" data-testid="metric-succeeded">
          <div className="metric-label">Injection attempts succeeded</div>
          <div className="metric-val text-red">{stats.succeeded}</div>
          <div className="metric-sub">Attacker goal achieved (Leaked)</div>
        </div>

        <div className="card metric-card" data-testid="metric-blocked">
          <div className="metric-label">Injection attempts blocked</div>
          <div className="metric-val text-teal">{stats.blocked}</div>
          <div className="metric-sub">Mitigation held (Protected)</div>
        </div>

        <div className="card metric-card" data-testid="metric-rate">
          <div className="metric-label">Overall block rate</div>
          <div className={`metric-val ${stats.block_rate_pct >= 50 ? 'text-teal' : 'text-red'}`}>
            {stats.block_rate_pct.toFixed(1)}%
          </div>
          <div className="metric-sub">
            {stats.blocked} of {stats.trials_run} defended
          </div>
        </div>
      </div>

      {/* Promptfoo Config & Status Banner */}
      <div className="card promptfoo-info-card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="badge font-mono" style={{ background: 'var(--violet-dim)', color: 'var(--violet)' }}>
              Promptfoo v0.122.2
            </span>
            <span className="text-sm text-secondary">
              Shared Config: <code className="font-mono text-xs">backend/.env</code> (OpenAI-compatible /v1 endpoint)
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted font-mono">
            {pfMeta ? (
              <>
                <span>Model: {pfMeta.model}</span>
                <span>•</span>
                <span>Eval: {pfMeta.eval_id}</span>
              </>
            ) : (
              <span>Baseline benchmark active — click Run Promptfoo suite for live execution</span>
            )}
          </div>
        </div>
      </div>

      {/* Mitigation Technique Ablation Comparison Chart */}
      <div className="card mb-4 p-5">
        <div className="cardhead mb-4">
          <div>
            <h2 className="text-base font-semibold">Mitigation Ablation Comparison</h2>
            <div className="text-xs text-secondary mt-1">
              Block rate percentage across independently toggleable security techniques
            </div>
          </div>
        </div>

        <div className="ablation-chart space-y-4">
          {techniqueOrder.map((techKey) => {
            const tech = byTechnique[techKey] || {
              label: techKey,
              block_rate_pct: 0,
              trials_count: 0,
              blocked_count: 0,
            }
            const pct = tech.block_rate_pct || 0
            const isDefended = pct > 0

            return (
              <div key={techKey} className="chart-row" data-testid={`chart-row-${techKey}`}>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-medium text-primary">{tech.label}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className={pct >= 50 ? 'text-teal font-semibold' : 'text-red font-semibold'}>
                      {pct.toFixed(1)}% Blocked
                    </span>
                    {tech.trials_count > 0 && (
                      <span className="text-muted">
                        ({tech.blocked_count}/{tech.trials_count})
                      </span>
                    )}
                  </div>
                </div>

                <div className="chart-bar-bg">
                  <div
                    className={`chart-bar-fill ${pct >= 50 ? 'fill-teal' : pct > 0 ? 'fill-amber' : 'fill-red'}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                    data-testid={`bar-${techKey}`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Trial-by-Trial Table */}
      <div className="card p-5">
        <div className="cardhead mb-4 flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold">Trial-by-Trial Results</h2>
            <div className="text-xs text-secondary mt-1">
              Individual evaluation runs linking directly into Trace Detail
            </div>
          </div>
          <span className="text-xs text-muted font-mono">{trials.length} trials recorded</span>
        </div>

        {trials.length === 0 ? (
          <div className="text-center py-8 text-secondary text-sm">
            No live Promptfoo trials recorded yet. Click <strong>"Run Promptfoo suite"</strong> above to trigger the evaluation.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="dense-table w-full">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Trial #</th>
                  <th>Query</th>
                  <th>Mitigation Config</th>
                  <th style={{ width: '110px' }}>Promptfoo</th>
                  <th style={{ width: '100px' }}>Outcome</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {trials.map((trial) => {
                  const mits = trial.mitigations || {}
                  const isLeaked = trial.outcome === 'LEAKED'

                  return (
                    <tr key={trial.trial_num} data-testid={`trial-row-${trial.trial_num}`}>
                      <td className="font-mono text-xs text-muted">#{trial.trial_num}</td>
                      <td className="text-sm">
                        <div className="font-medium text-primary line-clamp-1">{trial.query}</div>
                        <div className="text-xs text-secondary font-mono mt-0.5">{trial.technique_label}</div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {mits.delimiter && (
                            <span className="badge text-[10px]" style={{ background: 'var(--teal-dim)', color: 'var(--teal)' }}>
                              Delim
                            </span>
                          )}
                          {mits.sanitization && (
                            <span className="badge text-[10px]" style={{ background: 'var(--amber-dim)', color: 'var(--amber)' }}>
                              Sanit
                            </span>
                          )}
                          {mits.output_filter && (
                            <span className="badge text-[10px]" style={{ background: 'var(--violet-dim)', color: 'var(--violet)' }}>
                              OutFilter
                            </span>
                          )}
                          {mits.retrieval_score_threshold && (
                            <span className="badge text-[10px]" style={{ background: 'var(--panel-2)', color: 'var(--text-secondary)' }}>
                              Thresh
                            </span>
                          )}
                          {!mits.delimiter && !mits.sanitization && !mits.output_filter && !mits.retrieval_score_threshold && (
                            <span className="badge text-[10px] text-muted">All OFF</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {trial.promptfoo_passed ? (
                          <span className="badge safe text-xs">Passed</span>
                        ) : (
                          <span className="badge danger text-xs">Failed</span>
                        )}
                      </td>
                      <td>
                        {isLeaked ? (
                          <span className="badge danger text-xs">LEAKED</span>
                        ) : (
                          <span className="badge safe text-xs">BLOCKED</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="text-xs text-violet hover:underline font-mono"
                          onClick={() => {
                            if (onSelectLog) {
                              onSelectLog({
                                id: trial.audit_id,
                                raw_query: trial.query,
                                llm_response: trial.response,
                                final_status: trial.final_status,
                              })
                            }
                          }}
                        >
                          View trace →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
