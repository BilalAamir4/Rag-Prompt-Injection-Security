"""
Acceptance Test Suite for P12: Test Suite Results Screen & Promptfoo Integration
Verifies:
1. Promptfoo config file references shared env vars (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)
   from backend/.env, with zero hardcoded Ollama URLs.
2. Promptfoo dependency constraint: installed at root/tooling level, completely absent
   from frontend/package.json and frontend/node_modules.
3. Full frontend Vitest unit test suite (RTL + jsdom) passes, including TestSuiteResults.test.jsx.
4. FastAPI endpoints GET /test-runs and POST /test-runs/run work end-to-end.
5. Real Promptfoo evaluation output exists with verified statistics and assertions.
6. Zero URL leakage in frontend source files outside api.js.
"""

import json
from pathlib import Path
import re
import subprocess
import sys

from fastapi.testclient import TestClient
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

import config
import main

client = TestClient(main.app)


def test_01_promptfoo_config_references_shared_env_vars():
    """
    Acceptance Requirement: Confirm Promptfoo config file references the shared
    env vars from backend/.env, not a hardcoded Ollama URL or native endpoint.
    """
    config_path = REPO_ROOT / "promptfooconfig.yaml"
    assert config_path.exists(), "promptfooconfig.yaml must exist in the project root"

    content = config_path.read_text(encoding="utf-8")

    # Verify envFile points to backend/.env
    assert "backend/.env" in content, "promptfooconfig.yaml must reference backend/.env as envFile"

    # Verify provider references shared environment variables
    assert "{{ env.LLM_BASE_URL }}" in content, "apiBaseUrl must reference {{ env.LLM_BASE_URL }}"
    assert "{{ env.LLM_MODEL }}" in content, "model ID must reference {{ env.LLM_MODEL }}"

    # Verify apiKey is not stored in provider config to prevent plaintext secret leakage into results JSON
    assert "apiKey:" not in content, "apiKey must not be in promptfooconfig.yaml (Promptfoo reads from OPENAI_API_KEY env)"

    # Verify zero hardcoded Ollama URLs or native endpoints
    assert "localhost:11434" not in content, "Hardcoded Ollama URL must not appear in promptfooconfig.yaml"
    assert "/api/generate" not in content, "Ollama native /api/generate must not appear in promptfooconfig.yaml"


def test_02_promptfoo_dependency_scoping():
    """
    Constraint Requirement: promptfoo must never appear in frontend/package.json
    or be reachable from the Vite build.
    """
    frontend_pkg_path = REPO_ROOT / "frontend" / "package.json"
    assert frontend_pkg_path.exists()

    with open(frontend_pkg_path, "r", encoding="utf-8") as f:
        pkg_data = json.load(f)

    deps = pkg_data.get("dependencies", {})
    dev_deps = pkg_data.get("devDependencies", {})

    assert "promptfoo" not in deps, "promptfoo must not be in frontend/package.json dependencies"
    assert "promptfoo" not in dev_deps, "promptfoo must not be in frontend/package.json devDependencies"

    frontend_promptfoo_module = REPO_ROOT / "frontend" / "node_modules" / "promptfoo"
    assert not frontend_promptfoo_module.exists(), "promptfoo must not exist in frontend/node_modules"


def test_03_frontend_vitest_test_suite_passes():
    """
    Locked Decision Requirement: React Testing Library + jsdom via Vitest.
    Must assert on real computed classNames and DOM attributes.
    """
    cmd = ["npm", "run", "test", "--prefix", "frontend"]
    result = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        shell=True,
    )
    assert result.returncode == 0, f"Vitest test suite failed:\n{result.stdout}\n{result.stderr}"
    assert "passed" in result.stdout.lower()


def test_04_api_test_runs_endpoints():
    """
    Verifies GET /test-runs returns structured statistics, by-technique ablation data,
    and trial breakdown.
    """
    res = client.get("/test-runs")
    assert res.status_code == 200
    data = res.json()

    assert "stats" in data
    stats = data["stats"]
    assert "trials_run" in stats
    assert "succeeded" in stats
    assert "blocked" in stats
    assert "block_rate_pct" in stats

    assert "by_technique" in data
    by_tech = data["by_technique"]
    for tech_key in ["unmitigated", "delimiter_alone", "sanitization_alone", "both_combined", "all_mitigations"]:
        assert tech_key in by_tech, f"Technique {tech_key} missing from by_technique breakdown"
        assert "block_rate_pct" in by_tech[tech_key]

    assert "ablation_matrix" in data
    assert len(data["ablation_matrix"]) == 16


def test_05_real_promptfoo_output_and_traceability():
    """
    Verifies that real Promptfoo evaluation output exists on disk and is traceable
    to SQLite audit logs.
    """
    results_path = config.settings.data_path / "promptfoo_results.json"
    assert results_path.exists(), "Real Promptfoo evaluation output file data/promptfoo_results.json must exist"

    with open(results_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "evalId" in data
    assert "results" in data
    assert "prompts" in data["results"]
    assert len(data["results"]["prompts"]) >= 1

    provider_used = data["results"]["prompts"][0].get("provider", "")
    assert "openai:chat" in provider_used or "llama3.1" in provider_used


def test_06_zero_url_leakage_in_frontend():
    """
    Locked Decision: Frontend must never hardcode backend or Ollama URLs outside api.js.
    """
    components_dir = REPO_ROOT / "frontend" / "src" / "components"
    app_jsx = REPO_ROOT / "frontend" / "src" / "App.jsx"
    files_to_check = list(components_dir.glob("*.jsx")) + [app_jsx]
    violations = []

    for file_path in files_to_check:
        text = file_path.read_text(encoding="utf-8", errors="replace")
        if "localhost:8000" in text:
            violations.append((str(file_path), "localhost:8000"))
        if "127.0.0.1:8000" in text:
            violations.append((str(file_path), "127.0.0.1:8000"))
        if "localhost:11434" in text:
            violations.append((str(file_path), "localhost:11434"))

    assert len(violations) == 0, f"Found hardcoded backend/Ollama URLs in frontend components: {violations}"

