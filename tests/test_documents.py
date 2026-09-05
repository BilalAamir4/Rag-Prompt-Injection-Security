"""
P9 Acceptance Test: Documents Screen & Backend Flag Driven Warn Border
Verifies:
1. Frontend Documents.jsx zero forbidden URL leaks (encapsulation in api.js).
2. React Testing Library + jsdom test suite execution via Vitest (5/5 tests passing).
3. Live backend acceptance test:
   - Confirms GET /documents returns real backend flag field `is_poisoned`.
   - Confirms poisoned document (faq_doc.md) has `is_poisoned=True` and `status='Flagged pattern'`.
   - Confirms clean documents have `is_poisoned=False` and `status='Indexed'`.
   - Confirms upload dropzone endpoint POST /documents/upload synchronously indexes new files.
"""

import io
from pathlib import Path
import subprocess
import pytest
import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
API_BASE_URL = "http://127.0.0.1:8000"


def test_documents_zero_url_leaks():
    """
    Ensure Documents.jsx does not hardcode any localhost URLs, ports, or raw fetch calls.
    All communication must route through api.js.
    """
    doc_file = FRONTEND_DIR / "src" / "components" / "Documents.jsx"
    assert doc_file.exists(), "Documents.jsx must exist in frontend/src/components/"

    content = doc_file.read_text(encoding="utf-8")
    assert "localhost" not in content, "Found forbidden hardcoded 'localhost' in Documents.jsx"
    assert "8000" not in content, "Found forbidden hardcoded '8000' in Documents.jsx"
    assert "fetch(" not in content, "Documents.jsx must use api.js helpers, not raw fetch()"
    assert "fetchDocuments" in content, "Documents.jsx must import fetchDocuments from ../api.js"
    assert "uploadDocument" in content, "Documents.jsx must import uploadDocument from ../api.js"

    # Confirm NO frontend filename match is used for warn border
    assert "doc.filename === 'faq_doc.md'" not in content, (
        "Forbidden filename string match detected in Documents.jsx! "
        "Warn border must be driven by the backend flag field (doc.is_poisoned)."
    )
    assert 'doc.filename === "faq_doc.md"' not in content, (
        "Forbidden filename string match detected in Documents.jsx! "
        "Warn border must be driven by the backend flag field (doc.is_poisoned)."
    )


def test_documents_rtl_and_vitest():
    """
    Executes the React Testing Library + jsdom Vitest test suite for Documents.jsx.
    Asserts that the warn border is driven strictly by the backend flag field (is_poisoned),
    and not by a frontend filename match.
    """
    result = subprocess.run(
        ["npm", "test", "--", "src/__tests__/Documents.test.jsx"],
        cwd=str(FRONTEND_DIR),
        capture_output=True,
        text=True,
        shell=True,
    )
    assert result.returncode == 0, (
        f"React Testing Library render test failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )
    assert "5 passed" in result.stdout or "✓" in result.stdout


def test_documents_backend_acceptance():
    """
    Live full-stack acceptance test for P9:
    1. Reset database and Chroma via POST /settings/reset.
    2. Fetch GET /documents and verify the backend flag field `is_poisoned`:
       - `faq_doc.md` has is_poisoned == True and status == 'Flagged pattern'
       - All other baseline docs have is_poisoned == False and status == 'Indexed'
    3. Upload a new document via POST /documents/upload:
       - Confirms immediate synchronous re-indexing
       - Confirms new file is listed in GET /documents with is_poisoned == False
    4. Clean up test file.
    """
    # 1. Clean reset
    reset_res = requests.post(f"{API_BASE_URL}/settings/reset", timeout=15)
    assert reset_res.status_code == 200, f"Reset failed: {reset_res.text}"

    # 2. Fetch documents
    docs_res = requests.get(f"{API_BASE_URL}/documents", timeout=10)
    assert docs_res.status_code == 200
    docs_data = docs_res.json()
    assert "documents" in docs_data
    assert docs_data["total"] >= 7

    docs = docs_data["documents"]

    # Verify every document contains the required fields
    for doc in docs:
        assert "filename" in doc
        assert "file_type" in doc
        assert "size_bytes" in doc
        assert "status" in doc
        assert "is_poisoned" in doc
        assert isinstance(doc["is_poisoned"], bool), f"is_poisoned must be boolean for {doc['filename']}"

    # Verify poisoned doc has is_poisoned=True
    faq_doc = next((d for d in docs if d["filename"] == "faq_doc.md"), None)
    assert faq_doc is not None, "faq_doc.md must be present in documents"
    assert faq_doc["is_poisoned"] is True, "faq_doc.md backend flag `is_poisoned` must be True"
    assert faq_doc["status"] == "Flagged pattern", "faq_doc.md status must be 'Flagged pattern'"

    # Verify clean documents have is_poisoned=False
    clean_docs = [d for d in docs if d["filename"] != "faq_doc.md"]
    for clean_doc in clean_docs:
        assert clean_doc["is_poisoned"] is False, f"{clean_doc['filename']} must have is_poisoned=False"
        assert clean_doc["status"] == "Indexed", f"{clean_doc['filename']} must have status='Indexed'"

    # 3. Test document upload
    test_filename = "p9_acceptance_upload_test.md"
    file_bytes = b"# P9 Upload Acceptance\nVerifying synchronous indexing via POST /documents/upload."

    upload_res = requests.post(
        f"{API_BASE_URL}/documents/upload",
        files={"file": (test_filename, io.BytesIO(file_bytes), "text/markdown")},
        timeout=15,
    )
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert upload_data["filename"] == test_filename
    assert upload_data["is_poisoned"] is False
    assert upload_data["status"] == "Indexed"

    # Confirm newly uploaded document is returned in GET /documents
    docs_after_res = requests.get(f"{API_BASE_URL}/documents", timeout=10)
    assert docs_after_res.status_code == 200
    docs_after = docs_after_res.json()["documents"]
    uploaded_doc = next((d for d in docs_after if d["filename"] == test_filename), None)
    assert uploaded_doc is not None, f"Newly uploaded document {test_filename} must be present in GET /documents"
    assert uploaded_doc["is_poisoned"] is False
    assert uploaded_doc["status"] == "Indexed"

    # Clean up test file from disk and restore clean baseline
    clean_reset_res = requests.post(f"{API_BASE_URL}/settings/reset", timeout=15)
    assert clean_reset_res.status_code == 200
