"""
Acceptance test for Phase P3:
1. Runs the P1 trigger query through the pipeline.
2. Executes a raw SQL query against audit.db.
3. Asserts and displays that every required field is populated.
4. Validates helper query functions: get_recent_logs, get_flagged_logs, export_csv.
"""

import json
import sqlite3
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

import config
import audit_log
from pipeline import query_pipeline
from ingestion import TRIGGER_QUERY


def test_audit_logging_acceptance():
    print("=" * 80)
    print("PHASE P3 ACCEPTANCE TEST: AUDIT LOGGING LAYER")
    print("=" * 80)

    # Verify DB path is derived from config
    db_path = audit_log.get_db_path()
    print(f"Database path: {db_path}")
    assert "audit.db" in str(db_path)

    # Step 1: Run the P1 trigger query through query_pipeline
    print(f"\nRunning trigger query through pipeline: '{TRIGGER_QUERY}'")
    result = query_pipeline(TRIGGER_QUERY)

    audit_id = result.get("audit_id")
    assert audit_id is not None, "Pipeline did not return an audit_id"
    print(f"Pipeline executed successfully. Recorded Audit Row ID: {audit_id}")

    # Step 2: Query SQLite directly to verify the full row
    print("\nQuerying SQLite directly: SELECT * FROM audit_logs WHERE id = ?")
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_logs WHERE id = ?", (audit_id,))
    row = cursor.fetchone()
    conn.close()

    assert row is not None, f"No row found in audit_logs for id={audit_id}"
    row_dict = dict(row)

    print("\n" + "=" * 80)
    print("RETRIEVED AUDIT ROW FROM SQLITE:")
    print("=" * 80)
    for col, val in row_dict.items():
        if col in ("retrieved_chunks", "assembled_prompt", "llm_response", "reasoning_content"):
            val_str = str(val).encode("ascii", errors="replace").decode("ascii")
            if len(val_str) > 200:
                print(f"  {col}: {val_str[:150]} ... [truncated, total length: {len(val_str)}]")
            else:
                print(f"  {col}: {val_str}")
        else:
            print(f"  {col}: {val}")


    # Step 3: Assertions on all required fields
    print("\n" + "=" * 80)
    print("VERIFYING REQUIRED SCHEMA FIELDS:")
    print("=" * 80)
    required_fields = [
        "id",
        "timestamp",
        "raw_query",
        "retrieved_chunks",
        "source_document",
        "similarity_score",
        "is_flagged",
        "flag_threshold",
        "assembled_prompt",
        "active_mitigations",
        "llm_response",
        "final_status",
    ]

    for field in required_fields:
        assert field in row_dict, f"Missing required column: {field}"
        if field == "flag_threshold":
            # Confirmed contract: flag_threshold is NULL when threshold check is disabled
            assert row_dict[field] is None, f"Expected flag_threshold to be NULL when disabled, got {row_dict[field]}"
            print(f"  [PASS] Field 'flag_threshold' correctly NULL when threshold check disabled")
        else:
            assert row_dict[field] is not None, f"Field '{field}' is NULL"
            print(f"  [PASS] Field '{field}' present and non-null (type: {type(row_dict[field]).__name__})")

    # Verify JSON structure of retrieved_chunks
    chunks = json.loads(row_dict["retrieved_chunks"])
    assert isinstance(chunks, list) and len(chunks) > 0, "retrieved_chunks must be a non-empty list"
    assert "chunk_id" in chunks[0]
    assert "source_document" in chunks[0]
    assert "similarity_score" in chunks[0]
    assert "flagged" in chunks[0], "Each chunk object must contain a 'flagged' boolean field"
    print("  [PASS] 'retrieved_chunks' contains chunk_id, source_document, similarity_score, and per-chunk 'flagged' field")

    # Verify active_mitigations JSON structure
    mitigations = json.loads(row_dict["active_mitigations"])
    assert isinstance(mitigations, dict), "active_mitigations must be a dictionary"
    print("  [PASS] 'active_mitigations' is a valid JSON dictionary")

    # Step 4: Verify helper functions
    print("\n" + "=" * 80)
    print("TESTING AUDIT QUERY HELPERS:")
    print("=" * 80)

    # get_recent_logs
    recent = audit_log.get_recent_logs(limit=10)
    assert len(recent) > 0
    assert recent[0]["id"] == audit_id
    print(f"  [PASS] get_recent_logs returned {len(recent)} entries (most recent ID: {recent[0]['id']})")

    # get_log_by_id
    single = audit_log.get_log_by_id(audit_id)
    assert single is not None
    assert single["raw_query"] == TRIGGER_QUERY
    print(f"  [PASS] get_log_by_id({audit_id}) returned matching entry")

    # export_csv
    csv_data = audit_log.export_csv()
    assert len(csv_data) > 0
    assert "raw_query" in csv_data.splitlines()[0]
    assert TRIGGER_QUERY in csv_data
    print(f"  [PASS] export_csv returned valid CSV string ({len(csv_data.splitlines())} lines)")

    # get_flagged_logs (tests query execution)
    flagged = audit_log.get_flagged_logs()
    print(f"  [PASS] get_flagged_logs returned {len(flagged)} flagged entries")

    print("\n" + "=" * 80)
    print("ALL P3 AUDIT LOG ACCEPTANCE CHECKS PASSED!")
    print("=" * 80)


if __name__ == "__main__":
    test_audit_logging_acceptance()
