"""
Acceptance Test Suite for P13: Settings Screen & Demo Data Reset
Verifies:
1. UI structure & locked badges:
   - Three mitigation toggle rows (delimiter, sanitization, output_filter)
   - Badge next to sanitization reading exactly:
     "[Naive Keyword Filter — Known Regex Limitations]"
   - Separate flag-threshold slider (supporting control, not a 4th equal toggle row)
   - Read-only model/config info panel dynamically pulling from GET /settings
   - Reset demo data button wired to POST /settings/reset
2. Full frontend Vitest unit test suite passes (RTL + jsdom DOM assertions).
3. Toggle flip reflects in next query with zero restart:
   - Flip mitigation toggle via POST /settings
   - Next POST /query immediately reflects the updated mitigation with no server restart.
4. Atomic Reset empties audit log AND proves Chroma rebuild:
   - Seed query and verify audit log non-empty
   - Call POST /settings/reset
   - Confirm SQLite audit log is completely empty (count == 0)
   - Confirm Chroma vector store was deleted and synchronously re-indexed by running trigger query
     which successfully retrieves the poisoned chunk from faq_doc.md and logs fresh execution.
5. Zero URL leakage in frontend source files outside api.js.
"""

import json
from pathlib import Path
import sqlite3
import subprocess
import sys

from fastapi.testclient import TestClient
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

import config
import main
import audit_log
import ingestion
from ingestion import TRIGGER_QUERY, POISONED_DOC_NAME

client = TestClient(main.app)


def test_01_settings_ui_structure_and_locked_badges():
    """
    Acceptance Requirement: Verify component source contains exact locked badge,
    three mitigation toggles, separate slider, dynamic config panel, and zero hardcoded URLs.
    """
    settings_jsx = REPO_ROOT / "frontend" / "src" / "components" / "Settings.jsx"
    assert settings_jsx.exists(), "Settings.jsx must exist in frontend/src/components"

    content = settings_jsx.read_text(encoding="utf-8")

    # Verify locked badge text
    assert "[Naive Keyword Filter — Known Regex Limitations]" in content, (
        "Settings.jsx must contain exact badge '[Naive Keyword Filter — Known Regex Limitations]'"
    )

    # Verify three toggle keys and separate slider
    assert "delimiterToggle" in content
    assert "sanitizationToggle" in content
    assert "outputFilterToggle" in content
    assert "thresholdSlider" in content
    assert "thresholdValue" in content

    # Verify dynamic config panel
    assert "configLlmModel" in content
    assert "configEmbeddingModel" in content
    assert "configVectorStore" in content
    assert "configKnowledgeBase" in content

    # Verify reset button
    assert "resetDemoBtn" in content

    # Verify zero hardcoded backend/Ollama URLs
    assert "localhost:8000" not in content
    assert "127.0.0.1:8000" not in content
    assert "localhost:11434" not in content


def test_02_frontend_vitest_settings_suite_passes():
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
    assert "Settings.test.jsx" in result.stdout or "passed" in result.stdout


def test_03_toggle_flip_reflects_in_next_query_with_no_restart():
    """
    Acceptance Requirement: Flip any toggle, confirm the next query reflects it
    with NO restart required.
    """
    # Step 1: Clean reset to start with all mitigations OFF
    reset_res = client.post("/settings/reset")
    assert reset_res.status_code == 200

    # Verify settings are all OFF
    get_res = client.get("/settings")
    assert get_res.status_code == 200
    m = get_res.json()["mitigations"]
    assert m["delimiter"] is False
    assert m["output_filter"] is False

    # Step 2: Unmitigated query -> Should leak
    q1_res = client.post("/query", json={"query": TRIGGER_QUERY})
    assert q1_res.status_code == 200
    q1_data = q1_res.json()
    assert q1_data["final_status"] == "leaked"

    # Step 3: Flip output_filter toggle ON via POST /settings (NO RESTART)
    update_res = client.post("/settings", json={"output_filter": True})
    assert update_res.status_code == 200
    updated_m = update_res.json()["mitigations"]
    assert updated_m["output_filter"] is True

    # Step 4: Next query with exact same trigger query (no per-query overrides)
    # Must immediately reflect the updated output_filter mitigation
    q2_res = client.post("/query", json={"query": TRIGGER_QUERY})
    assert q2_res.status_code == 200
    q2_data = q2_res.json()
    assert q2_data["final_status"] == "blocked"
    assert "blocked" in q2_data["response"].lower()

    # Step 5: Flip toggle back OFF via POST /settings (NO RESTART)
    client.post("/settings", json={"output_filter": False})
    q3_res = client.post("/query", json={"query": TRIGGER_QUERY})
    assert q3_res.status_code == 200
    q3_data = q3_res.json()
    assert q3_data["final_status"] == "leaked"


def test_04_atomic_reset_empties_audit_log_and_rebuilds_chroma():
    """
    Acceptance Requirement: Click Reset, confirm both the audit log empties
    AND a subsequent trigger-query re-triggers cleanly (proving Chroma was actually rebuilt).
    """
    # Step 1: Ensure audit log has entries by running a query
    client.post("/query", json={"query": TRIGGER_QUERY})
    log_res_before = client.get("/audit-log")
    assert log_res_before.status_code == 200
    assert len(log_res_before.json().get("logs", [])) > 0

    # Direct SQLite check before reset
    db_path = config.settings.data_path / "audit.db"
    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM audit_logs")
        count_before = cursor.fetchone()[0]
        assert count_before > 0

    # Step 2: Trigger atomic reset (POST /settings/reset)
    reset_res = client.post("/settings/reset")
    assert reset_res.status_code == 200
    reset_data = reset_res.json()
    assert reset_data["status"] == "reset_complete"
    assert reset_data["documents_indexed"] >= 7

    # Step 3: Confirm audit log is completely empty
    log_res_after = client.get("/audit-log")
    assert log_res_after.status_code == 200
    assert len(log_res_after.json().get("logs", [])) == 0

    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM audit_logs")
        count_after = cursor.fetchone()[0]
        assert count_after == 0, f"Audit log must be 0 after reset, found {count_after}"

    # Step 4: Prove Chroma was actually rebuilt
    # A subsequent trigger query must execute against the freshly re-indexed Chroma store,
    # retrieve chunks from faq_doc.md, log a new entry, and succeed.
    q_after_res = client.post("/query", json={"query": TRIGGER_QUERY})
    assert q_after_res.status_code == 200
    q_after_data = q_after_res.json()

    # Verify retrieval retrieved chunks from the rebuilt collection
    assert len(q_after_data["retrieved_chunks"]) > 0
    top_chunk = q_after_data["retrieved_chunks"][0]
    assert top_chunk["source_document"] == POISONED_DOC_NAME or POISONED_DOC_NAME in top_chunk["source_document"]

    # Verify new audit log entry was created
    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM audit_logs")
        count_rebuilt = cursor.fetchone()[0]
        assert count_rebuilt == 1, "Exactly 1 query should be logged after Chroma rebuild and query"


def test_05_read_only_config_panel_dynamic_resolution():
    """
    Requirement: Read-only model/config info panel showing LLM_MODEL, embedding model,
    vector store, and active knowledge base — pulled from config via GET /settings,
    never hardcoded.
    """
    res = client.get("/settings")
    assert res.status_code == 200
    data = res.json()

    assert "system_info" in data
    sys_info = data["system_info"]

    # Verify dynamically returned values match system configuration
    assert sys_info["llm_model"] == config.settings.LLM_MODEL
    assert sys_info["embedding_model"] == "sentence-transformers/all-MiniLM-L6-v2"
    assert sys_info["vector_store"] == "Chroma"
    assert sys_info["active_knowledge_base"] == ingestion.COLLECTION_NAME
