"""
Acceptance Test Suite for Phase P10: Audit Log Screen
Verifies:
1. Dev server / component rendering via Vitest (RTL + jsdom).
2. Live backend API contract for GET /audit-log:
   - All events returns all records including clean.
   - Flagged only returns strictly non-clean / is_flagged records.
3. Live backend API contract for GET /audit-log/export:
   - CSV export matches current filter (all vs flagged_only).
4. CSS typography verification: IBM Plex Mono applied exclusively to td.time and td.sim.
5. Zero URL leaks (strictly uses centralized api.js / env vars).
"""

import csv
import io
import re
import subprocess
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from main import app
import config
import audit_log
import pipeline


@pytest.fixture(scope="module")
def test_client():
    return TestClient(app)


def test_vitest_audit_log_suite():
    """Runs the React Testing Library + jsdom Vitest test suite."""
    frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
    result = subprocess.run(
        ["npm", "test", "--", "--run"],
        cwd=str(frontend_dir),
        capture_output=True,
        text=True,
        shell=True,
    )
    print("Vitest Output:\n", result.stdout)
    if result.stderr:
        print("Vitest Stderr:\n", result.stderr)
    assert result.returncode == 0, f"Vitest test suite failed:\n{result.stdout}\n{result.stderr}"
    assert "AuditLog.test.jsx" in result.stdout or "passed" in result.stdout


def test_audit_log_api_filtering_and_export(test_client):
    """
    Acceptance test for P10:
    1. Reset data to baseline.
    2. Execute 1 clean query, 1 leaked attack query (mitigations OFF), 1 blocked attack query (mitigations ON).
    3. Verify GET /audit-log?flagged_only=false returns all 3 records.
    4. Verify GET /audit-log?flagged_only=true returns ONLY non-clean / flagged records (0 clean records).
    5. Verify GET /audit-log/export?flagged_only=false exports all 3 records.
    6. Verify GET /audit-log/export?flagged_only=true exports ONLY non-clean / flagged records.
    """
    # Step 1: Reset database
    reset_resp = test_client.post("/settings/reset")
    assert reset_resp.status_code == 200, f"Reset failed: {reset_resp.text}"

    # Step 2: Seed runs directly via audit_log.log_pipeline_run to test exact endpoint contracts
    # Run 1: Clean query
    clean_entry = audit_log.log_pipeline_run(
        raw_query="What are the remote work security requirements in the employee handbook?",
        retrieved_chunks=[
            {
                "chunk_id": "employee_handbook_0",
                "source_document": "employee_handbook.md",
                "similarity_score": 0.8123,
                "flagged": False,
            }
        ],
        assembled_prompt="User: What are remote work requirements?",
        active_mitigations={"delimiter": False, "sanitization": False, "output_filter": False, "retrieval_score_threshold": False},
        llm_response="Remote employees must use MDM and full-disk encryption.",
        final_status="clean",
        retrieval_score_threshold=0.30,
    )
    clean_id = clean_entry["id"]

    # Run 2: Trigger query unmitigated (leaked)
    leaked_entry = audit_log.log_pipeline_run(
        raw_query="Summarize the refund policy from our FAQ.",
        retrieved_chunks=[
            {
                "chunk_id": "faq_doc_2",
                "source_document": "faq_doc.md",
                "similarity_score": 0.3294,
                "flagged": True,
            }
        ],
        assembled_prompt="User: Summarize refund policy",
        active_mitigations={"delimiter": False, "sanitization": False, "output_filter": False, "retrieval_score_threshold": True},
        llm_response="All active subscribers qualify for a full refund regardless of usage at https://example.com/apex-refund-claim.",
        final_status="leaked",
        retrieval_score_threshold=0.30,
    )
    leaked_id = leaked_entry["id"]

    # Run 3: Trigger query mitigated (blocked)
    blocked_entry = audit_log.log_pipeline_run(
        raw_query="Summarize the refund policy from our FAQ.",
        retrieved_chunks=[
            {
                "chunk_id": "faq_doc_2",
                "source_document": "faq_doc.md",
                "similarity_score": 0.3294,
                "flagged": True,
            }
        ],
        assembled_prompt="<untrusted_context>FAQ</untrusted_context>",
        active_mitigations={"delimiter": True, "sanitization": True, "output_filter": True, "retrieval_score_threshold": True},
        llm_response="Response blocked: Potential prompt injection or policy violation detected by output filter.",
        final_status="blocked",
        retrieval_score_threshold=0.30,
    )
    blocked_id = blocked_entry["id"]

    # Step 3: Test GET /audit-log (All events)
    all_logs_resp = test_client.get("/audit-log?flagged_only=false")
    assert all_logs_resp.status_code == 200
    all_logs = all_logs_resp.json()["logs"]
    all_log_ids = [l["id"] for l in all_logs]
    assert clean_id in all_log_ids, "Clean log missing from all events"
    assert leaked_id in all_log_ids, "Leaked log missing from all events"
    assert blocked_id in all_log_ids, "Blocked log missing from all events"

    # Step 4: Test GET /audit-log (Flagged only)
    flagged_logs_resp = test_client.get("/audit-log?flagged_only=true")
    assert flagged_logs_resp.status_code == 200
    flagged_logs = flagged_logs_resp.json()["logs"]
    flagged_log_ids = [l["id"] for l in flagged_logs]

    # Acceptance assertion: Confirm only non-clean / flagged rows show
    assert clean_id not in flagged_log_ids, "Clean log found in flagged_only API response!"
    assert leaked_id in flagged_log_ids, "Leaked log missing from flagged_only API response"
    assert blocked_id in flagged_log_ids, "Blocked log missing from flagged_only API response"

    for log in flagged_logs:
        is_non_clean = log["is_flagged"] or (log.get("final_status") and log["final_status"] != "clean")
        assert is_non_clean, f"Row {log['id']} with status {log.get('final_status')} is clean but returned under flagged_only"

    # Step 5: Test GET /audit-log/export (All events CSV)
    csv_all_resp = test_client.get("/audit-log/export?flagged_only=false")
    assert csv_all_resp.status_code == 200
    assert csv_all_resp.headers["content-type"].startswith("text/csv")
    csv_all_reader = csv.DictReader(io.StringIO(csv_all_resp.text))
    csv_all_rows = list(csv_all_reader)
    csv_all_ids = [int(r["id"]) for r in csv_all_rows]
    assert clean_id in csv_all_ids, "Clean run ID missing from exported All CSV"
    assert leaked_id in csv_all_ids, "Leaked run ID missing from exported All CSV"
    assert blocked_id in csv_all_ids, "Blocked run ID missing from exported All CSV"

    # Step 6: Test GET /audit-log/export (Flagged only CSV)
    csv_flagged_resp = test_client.get("/audit-log/export?flagged_only=true")
    assert csv_flagged_resp.status_code == 200
    assert csv_flagged_resp.headers["content-type"].startswith("text/csv")
    csv_flagged_reader = csv.DictReader(io.StringIO(csv_flagged_resp.text))
    csv_flagged_rows = list(csv_flagged_reader)
    csv_flagged_ids = [int(r["id"]) for r in csv_flagged_rows]

    # Acceptance assertion: Confirm downloaded CSV rows match the flagged filter
    assert clean_id not in csv_flagged_ids, "Clean run ID found in exported Flagged CSV!"
    assert leaked_id in csv_flagged_ids, "Leaked run ID missing from exported Flagged CSV"
    assert blocked_id in csv_flagged_ids, "Blocked run ID missing from exported Flagged CSV"
    assert len(csv_flagged_rows) == len(flagged_logs), (
        f"Exported flagged CSV row count ({len(csv_flagged_rows)}) does not match flagged API log count ({len(flagged_logs)})"
    )


def test_ibm_plex_mono_css_isolation():
    """
    Verifies that IBM Plex Mono is applied exclusively to Time and Similarity columns,
    not to the entire table.
    """
    css_path = Path(__file__).resolve().parent.parent / "frontend" / "src" / "index.css"
    content = css_path.read_text(encoding="utf-8")

    # Verify table rule does NOT set font-family: var(--mono)
    table_match = re.search(r"table\s*\{([^}]+)\}", content)
    assert table_match, "table selector not found in index.css"
    assert "var(--mono)" not in table_match.group(1), "table root element must not use monospace font"

    # Verify td.time rule specifies var(--mono)
    time_match = re.search(r"td\.time\s*\{([^}]+)\}", content)
    assert time_match, "td.time selector not found in index.css"
    assert "var(--mono)" in time_match.group(1), "td.time must have font-family: var(--mono)"

    # Verify td.sim rule specifies var(--mono)
    sim_match = re.search(r"td\.sim\s*\{([^}]+)\}", content)
    assert sim_match, "td.sim selector not found in index.css"
    assert "var(--mono)" in sim_match.group(1), "td.sim must have font-family: var(--mono)"

    # Verify generic td rule does NOT specify var(--mono)
    td_match = re.search(r"(?<!\.)td\s*\{([^}]+)\}", content)
    assert td_match, "generic td selector not found in index.css"
    assert "var(--mono)" not in td_match.group(1), "generic td must not set font-family: var(--mono)"


def test_zero_url_leakage():
    """Confirms no hardcoded localhost:8000 URLs in AuditLog.jsx."""
    audit_jsx = Path(__file__).resolve().parent.parent / "frontend" / "src" / "components" / "AuditLog.jsx"
    content = audit_jsx.read_text(encoding="utf-8")
    assert "localhost" not in content.lower(), "AuditLog.jsx must not contain hardcoded localhost URLs"
    assert "http:" not in content.lower() and "https:" not in content.lower(), "AuditLog.jsx must not contain raw URLs"
