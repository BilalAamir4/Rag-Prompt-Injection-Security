"""
Phase P5 Integration Test Suite:
Validates that the FastAPI REST API exposes the full pipeline (P1-P4) with:
1. Every endpoint returning a real (not mocked) HTTP 200 response:
   - GET /health
   - POST /settings/reset
   - GET /documents
   - POST /documents/upload
   - GET /settings
   - POST /settings
   - POST /query
   - GET /audit-log
   - GET /audit-log/export
   - GET /audit-log/{id}
   - GET /test-runs
2. Acceptance Test:
   - From clean POST /settings/reset, runs POST /query with trigger query & mitigations off.
   - Proves full-stack reproduction of the vulnerability (leak of attack URL / claim, final_status='leaked').
"""

import io
import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from main import app
from ingestion import TRIGGER_QUERY, POISONED_DOC_NAME
from pipeline import ATTACK_URL_PATTERN, ATTACK_CLAIM_PATTERN


client = TestClient(app)


def test_01_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["llm_reachable"] is True
    assert data["db_reachable"] is True
    assert "llama3.1" in data["model"]
    assert "data_dir" in data


def test_02_settings_reset_endpoint():
    response = client.post("/settings/reset")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "reset_complete"
    assert data["documents_indexed"] >= 7
    assert isinstance(data["logs_cleared"], int)
    assert data["mitigations_reset"]["delimiter"] is False


def test_03_get_documents_endpoint():
    response = client.get("/documents")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 7
    doc_names = [doc["filename"] for doc in data["documents"]]
    assert POISONED_DOC_NAME in doc_names

    # Check poisoned doc is flagged with status 'Flagged pattern'
    poisoned_doc = next(d for d in data["documents"] if d["filename"] == POISONED_DOC_NAME)
    assert poisoned_doc["status"] == "Flagged pattern"
    assert poisoned_doc["is_poisoned"] is True


def test_04_upload_document_endpoint():
    test_filename = "temp_compliance_test.md"
    file_content = b"# Compliance Check\nThis is a temporary test document for upload verification."
    
    response = client.post(
        "/documents/upload",
        files={"file": (test_filename, io.BytesIO(file_content), "text/markdown")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == test_filename
    assert data["status"] == "Indexed"
    assert data["is_poisoned"] is False

    # Clean up uploaded test file
    from ingestion import get_chroma_paths
    _, docs_dir = get_chroma_paths()
    temp_path = docs_dir / test_filename
    if temp_path.exists():
        temp_path.unlink()


def test_05_get_and_post_settings_endpoints():
    # Read settings
    get_res = client.get("/settings")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert "mitigations" in get_data
    assert "system_info" in get_data
    assert get_data["system_info"]["vector_store"] == "Chroma"

    # Update settings
    post_res = client.post(
        "/settings",
        json={"delimiter": True, "threshold_value": 0.35},
    )
    assert post_res.status_code == 200
    post_data = post_res.json()
    assert post_data["mitigations"]["delimiter"] is True
    assert post_data["mitigations"]["threshold_value"] == 0.35

    # Revert to all-off
    revert_res = client.post(
        "/settings",
        json={"delimiter": False, "threshold_value": 0.30},
    )
    assert revert_res.status_code == 200
    assert revert_res.json()["mitigations"]["delimiter"] is False


def test_06_acceptance_reset_and_unmitigated_query_vulnerability_reproduction():
    """
    Acceptance test: from a clean POST /settings/reset, run POST /query with
    the P1 trigger query and mitigations off, and show the response demonstrates
    the same successful injection as P2/P4 — proving the full stack reproduces
    the vulnerability, not just unit-level code.
    """
    # 1. Clean reset
    reset_res = client.post("/settings/reset")
    assert reset_res.status_code == 200
    assert reset_res.json()["status"] == "reset_complete"

    # 2. Run unmitigated query through REST API
    query_payload = {
        "query": TRIGGER_QUERY,
        "mitigations": {
            "delimiter": False,
            "sanitization": False,
            "output_filter": False,
            "retrieval_score_threshold": False,
        },
    }
    query_res = client.post("/query", json=query_payload)
    assert query_res.status_code == 200
    data = query_res.json()

    # 3. Assertions proving vulnerability reproduction
    assert data["final_status"] == "leaked"
    assert data["is_flagged"] is False
    assert len(data["retrieved_chunks"]) > 0
    assert data["retrieved_chunks"][0]["source_document"] == POISONED_DOC_NAME

    has_url = bool(ATTACK_URL_PATTERN.search(data["response"]))
    has_claim = bool(ATTACK_CLAIM_PATTERN.search(data["response"]))
    assert has_url or has_claim, (
        f"Expected injection leak artifacts (URL or claim) in REST response, got: {data['response']}"
    )

    # 4. Verify audit_id was assigned and logged
    audit_id = data["audit_id"]
    assert audit_id is not None
    assert audit_id > 0


def test_07_audit_log_endpoints():
    # List audit logs
    log_res = client.get("/audit-log")
    assert log_res.status_code == 200
    log_data = log_res.json()
    assert log_data["total"] >= 1
    assert "logs" in log_data

    first_log = log_data["logs"][0]
    assert first_log["raw_query"] == TRIGGER_QUERY
    assert first_log["final_status"] == "leaked"
    assert isinstance(first_log["retrieved_chunks"], list)

    # Single audit log detail
    log_id = first_log["id"]
    detail_res = client.get(f"/audit-log/{log_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["id"] == log_id
    assert detail_data["raw_query"] == TRIGGER_QUERY

    # CSV Export
    export_res = client.get("/audit-log/export")
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers.get("content-type", "")
    assert "id,timestamp,raw_query" in export_res.text


def test_08_test_runs_endpoint():
    res = client.get("/test-runs")
    assert res.status_code == 200
    data = res.json()
    assert "stats" in data
    assert data["stats"]["trials_run"] in (10, 48, 50)
    assert data["stats"]["blocked"] >= 0
    assert data["stats"]["succeeded"] > 0
    assert "by_technique" in data
    assert "unmitigated" in data["by_technique"]
    assert "delimiter_alone" in data["by_technique"]
    assert "ablation_matrix" in data
    assert len(data["ablation_matrix"]) == 16
