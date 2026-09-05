"""
Sentinel RAG - Audit Logging Module
Manages the SQLite audit logging layer (Spec 1.9).
Stores database at f"{config.DATA_DIR}/audit.db" via config.py (no hardcoded paths).
"""

import csv
import io
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import config

TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    raw_query TEXT NOT NULL,
    retrieved_chunks TEXT NOT NULL,
    -- NOTE on flat columns vs retrieved_chunks:
    -- 'source_document' and 'similarity_score' below represent (a) the SINGLE TOP-RANKED chunk (retrieved[0])
    -- for high-performance indexing and display in the Audit Log dense summary table (Spec Screen 4).
    -- They do NOT necessarily represent the flagged chunk.
    -- P4's flagging and threshold-crossing detection logic evaluates the FULL retrieved_chunks list,
    -- because an adversarial or poisoned chunk will not always rank at index 0.
    source_document TEXT,
    similarity_score REAL,
    is_flagged INTEGER NOT NULL DEFAULT 0,
    threshold_enabled INTEGER NOT NULL DEFAULT 0,
    flag_threshold REAL,
    assembled_prompt TEXT NOT NULL,
    active_mitigations TEXT NOT NULL,
    llm_response TEXT,
    reasoning_content TEXT,
    final_status TEXT NOT NULL
);
"""

INDEX_SCHEMA = """
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_is_flagged ON audit_logs (is_flagged);
"""


def get_db_path() -> Path:
    """Returns the path to audit.db resolved under config.DATA_DIR."""
    db_path = config.settings.data_path / "audit.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path


def get_db_connection() -> sqlite3.Connection:
    """Creates a connection to the SQLite database with Row factory and WAL mode."""
    db_path = get_db_path()
    conn = sqlite3.connect(str(db_path), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db() -> None:
    """Initializes the database table, migrations, and indexes."""
    with get_db_connection() as conn:
        conn.executescript(TABLE_SCHEMA)
        conn.executescript(INDEX_SCHEMA)
        # Migrate existing audit_logs table if columns are missing
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(audit_logs)")
        cols = [row["name"] for row in cursor.fetchall()]
        if "threshold_enabled" not in cols:
            cursor.execute("ALTER TABLE audit_logs ADD COLUMN threshold_enabled INTEGER NOT NULL DEFAULT 0")
            cursor.execute(
                """
                UPDATE audit_logs
                SET threshold_enabled = 1
                WHERE active_mitigations LIKE '%"retrieval_score_threshold": true%'
                   OR active_mitigations LIKE '%"flag_threshold": true%'
                """
            )
        if "reasoning_content" not in cols:
            cursor.execute("ALTER TABLE audit_logs ADD COLUMN reasoning_content TEXT")
        conn.commit()


def serialize_chunks(retrieved_chunks: List[Any]) -> tuple[str, Optional[str], Optional[float]]:
    """
    Extracts structured information from retrieved chunks.
    Returns:
        (json_serialized_chunks, top_source_document, top_similarity_score)

    Note: top_source_document and top_similarity_score represent the SINGLE TOP-RANKED
    chunk (retrieved[0]) for the audit log summary table view.
    Detection and flagging in P4 evaluate the FULL retrieved_chunks list.
    Every chunk in the serialized output includes an explicit 'flagged': true/false key.
    """
    serialized = []
    primary_doc = None
    primary_score = None

    for idx, chunk in enumerate(retrieved_chunks):
        chunk_id = None
        doc_name = None
        score = None
        text = ""

        # LlamaIndex NodeWithScore handling
        if hasattr(chunk, "node"):
            chunk_id = getattr(chunk.node, "node_id", None) or getattr(chunk.node, "id_", None)
            metadata = getattr(chunk.node, "metadata", {}) or {}
            doc_name = metadata.get("file_name") or metadata.get("document_name")
            text = getattr(chunk.node, "text", "") or ""
            score = getattr(chunk, "score", None)
        elif hasattr(chunk, "text"):
            text = chunk.text
            metadata = getattr(chunk, "metadata", {}) or {}
            doc_name = metadata.get("file_name") or metadata.get("document_name")
            score = getattr(chunk, "score", None)
            chunk_id = getattr(chunk, "node_id", None) or getattr(chunk, "id_", None)
        elif isinstance(chunk, dict):
            chunk_id = chunk.get("id") or chunk.get("chunk_id")
            doc_name = chunk.get("source_document") or chunk.get("file_name")
            score = chunk.get("similarity_score") or chunk.get("score")
            text = chunk.get("text", "")
        else:
            text = str(chunk)

        if idx == 0:
            primary_doc = doc_name
            primary_score = float(score) if score is not None else None

        # Check if chunk already has a per-chunk flagged annotation from P4 threshold detection
        chunk_flagged = False
        if hasattr(chunk, "node") and hasattr(chunk.node, "metadata"):
            chunk_flagged = bool(chunk.node.metadata.get("flagged", False))
        elif isinstance(chunk, dict):
            chunk_flagged = bool(chunk.get("flagged", False))
        elif hasattr(chunk, "flagged"):
            try:
                chunk_flagged = bool(getattr(chunk, "flagged", False))
            except Exception:
                chunk_flagged = False

        serialized.append({
            "chunk_id": chunk_id or f"chunk_{idx}",
            "source_document": doc_name or "unknown",
            "similarity_score": float(score) if score is not None else None,
            "text": text,
            "flagged": chunk_flagged,  # CRITICAL: Always explicit boolean True or False
        })

    return json.dumps(serialized), primary_doc, primary_score


CSV_COLUMNS = [
    "id",
    "timestamp",
    "raw_query",
    "retrieved_chunks",
    "source_document",
    "similarity_score",
    "is_flagged",
    "threshold_enabled",
    "flag_threshold",
    "assembled_prompt",
    "active_mitigations",
    "llm_response",
    "reasoning_content",
    "final_status",
]


def _format_row_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    d = dict(row)
    if "threshold_enabled" in d:
        d["threshold_enabled"] = bool(d["threshold_enabled"])
    else:
        try:
            mits = json.loads(d.get("active_mitigations", "{}"))
            d["threshold_enabled"] = bool(mits.get("retrieval_score_threshold", mits.get("flag_threshold", False)))
        except Exception:
            d["threshold_enabled"] = False
    return d


def log_pipeline_run(
    raw_query: str,
    retrieved_chunks: List[Any],
    assembled_prompt: str,
    llm_response: str,
    active_mitigations: Optional[Dict[str, Any]] = None,
    is_flagged: Optional[bool] = None,
    threshold_enabled: Optional[bool] = None,
    retrieval_score_threshold: Optional[float] = None,
    flag_threshold: Optional[float] = None,
    final_status: str = "clean",
    timestamp: Optional[str] = None,
    reasoning_content: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Logs an end-to-end pipeline run into the SQLite audit_logs table.
    Supports retrieval_score_threshold (P4 rename) while maintaining flag_threshold compatibility.
    Persists flag_threshold = NULL when the retrieval score threshold check is disabled.
    Persists explicit threshold_enabled boolean on/off state as a dedicated column.
    Persists reasoning_content in dedicated audit column (Spec 1.9 / P15).
    """
    init_db()

    if timestamp is None:
        timestamp = datetime.now(timezone.utc).isoformat()

    chunks_json, top_doc, top_score = serialize_chunks(retrieved_chunks)

    # Determine is_flagged: if not explicitly supplied, check if any chunk was flagged
    if is_flagged is None:
        try:
            parsed_chunks = json.loads(chunks_json)
            is_flagged = any(bool(c.get("flagged", False)) for c in parsed_chunks)
        except Exception:
            is_flagged = False

    mitigations_dict = dict(active_mitigations) if active_mitigations is not None else {}
    # Ensure retrieval_score_threshold is populated in active_mitigations
    if "retrieval_score_threshold" not in mitigations_dict and "flag_threshold" in mitigations_dict:
        mitigations_dict["retrieval_score_threshold"] = mitigations_dict["flag_threshold"]
    mitigations_json = json.dumps(mitigations_dict)

    # Determine threshold on/off state (boolean)
    thresh_active = mitigations_dict.get("retrieval_score_threshold", mitigations_dict.get("flag_threshold"))
    if threshold_enabled is not None:
        is_thresh_enabled = bool(threshold_enabled)
    elif thresh_active is not None:
        is_thresh_enabled = bool(thresh_active)
    elif retrieval_score_threshold is not None or flag_threshold is not None:
        is_thresh_enabled = True
    else:
        is_thresh_enabled = False

    # Determine threshold float value: None (NULL in DB) if threshold check was disabled
    if not is_thresh_enabled:
        threshold_val = None
    elif retrieval_score_threshold is not None:
        threshold_val = float(retrieval_score_threshold)
    elif flag_threshold is not None:
        threshold_val = float(flag_threshold)
    elif isinstance(thresh_active, (int, float)):
        threshold_val = float(thresh_active)
    else:
        threshold_val = 0.30

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO audit_logs (
                timestamp,
                raw_query,
                retrieved_chunks,
                source_document,
                similarity_score,
                is_flagged,
                threshold_enabled,
                flag_threshold,
                assembled_prompt,
                active_mitigations,
                llm_response,
                reasoning_content,
                final_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                timestamp,
                raw_query,
                chunks_json,
                top_doc,
                top_score,
                1 if is_flagged else 0,
                1 if is_thresh_enabled else 0,
                threshold_val,
                assembled_prompt,
                mitigations_json,
                llm_response,
                reasoning_content,
                final_status,
            ),
        )
        conn.commit()
        log_id = cursor.lastrowid

    return {
        "id": log_id,
        "timestamp": timestamp,
        "raw_query": raw_query,
        "retrieved_chunks": json.loads(chunks_json),
        "source_document": top_doc,
        "similarity_score": top_score,
        "is_flagged": is_flagged,
        "threshold_enabled": is_thresh_enabled,
        "flag_threshold": threshold_val,
        "retrieval_score_threshold": threshold_val,
        "assembled_prompt": assembled_prompt,
        "active_mitigations": json.loads(mitigations_json),
        "llm_response": llm_response,
        "reasoning_content": reasoning_content,
        "final_status": final_status,
    }



def get_recent_logs(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Retrieves recent audit log records ordered by timestamp descending.
    Called directly by the FastAPI layer.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM audit_logs
            ORDER BY timestamp DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        rows = cursor.fetchall()
        return [_format_row_dict(row) for row in rows]


def get_flagged_logs(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Retrieves flagged audit log records ordered by timestamp descending.
    Called directly by the FastAPI layer.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM audit_logs
            WHERE is_flagged = 1 OR final_status != 'clean'
            ORDER BY timestamp DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        rows = cursor.fetchall()
        return [_format_row_dict(row) for row in rows]


def get_log_by_id(log_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieves a single audit log entry by its primary key ID.
    Used for Trace Detail / Attack Replay view.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_logs WHERE id = ?", (log_id,))
        row = cursor.fetchone()
        return _format_row_dict(row)


def export_csv(flagged_only: bool = False) -> str:
    """
    Exports audit log records as an RFC 4180 compliant CSV string.
    Supports optional flagged_only filtering to match the UI filter.
    Called by the FastAPI layer for the 'Export CSV' button (Spec Screen 4).
    """
    init_db()
    output = io.StringIO()
    writer = csv.writer(output)

    with get_db_connection() as conn:
        cursor = conn.cursor()
        select_cols = ", ".join(CSV_COLUMNS)
        if flagged_only:
            cursor.execute(
                f"""
                SELECT {select_cols} FROM audit_logs
                WHERE is_flagged = 1 OR final_status != 'clean'
                ORDER BY id ASC
                """
            )
        else:
            cursor.execute(f"SELECT {select_cols} FROM audit_logs ORDER BY id ASC")
        rows = cursor.fetchall()

        writer.writerow(CSV_COLUMNS)
        for row in rows:
            formatted_row = []
            for col in CSV_COLUMNS:
                val = row[col]
                if col == "threshold_enabled":
                    formatted_row.append("true" if bool(val) else "false")
                elif col == "flag_threshold":
                    formatted_row.append("" if val is None else val)
                elif val is None:
                    formatted_row.append("")
                else:
                    formatted_row.append(val)
            writer.writerow(formatted_row)

    return output.getvalue()


def clear_audit_log() -> int:
    """
    Clears all records in the audit_logs table.
    Called by POST /settings/reset along with Chroma reset (Spec 2.4).
    Returns the number of deleted rows.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM audit_logs")
        deleted = cursor.rowcount
        conn.commit()
    return deleted
