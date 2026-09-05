"""
P6 Acceptance Test: Frontend Shell & Integration Verification
"""
import re
from pathlib import Path
import pytest
import requests

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


def test_grep_localhost_8000_zero_leaks():
    """
    Ensure 'localhost:8000' is NOT hardcoded anywhere in the frontend outside
    api.js and .env files.
    """
    matches = []
    # Inspect all files under frontend/, skipping node_modules and dist
    for file_path in FRONTEND_DIR.rglob("*"):
        if file_path.is_file():
            rel_path = file_path.relative_to(FRONTEND_DIR)
            parts = rel_path.parts
            if "node_modules" in parts or "dist" in parts or ".git" in parts:
                continue

            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            if "localhost:8000" in content:
                # Allowed only in api.js and .env/.env.example
                allowed = (
                    rel_path.name in (".env", ".env.example")
                    or rel_path.as_posix() in ("src/api.js", "src/api.ts")
                )
                if not allowed:
                    matches.append(f"{rel_path.as_posix()}: {content}")

    assert matches == [], f"Found forbidden hardcoded localhost:8000 in: {matches}"


def test_frontend_dev_server_serves_html():
    """
    Verify Vite frontend dev server is running and serves index.html with
    required fonts, meta, and root element.
    """
    url = "http://127.0.0.1:5173/"
    res = requests.get(url, timeout=5)
    assert res.status_code == 200
    html = res.text
    assert "Sentinel RAG" in html
    assert "IBM+Plex+Sans" in html
    assert "IBM+Plex+Mono" in html
    assert 'id="root"' in html


def test_backend_settings_real_data():
    """
    Verify the backend settings endpoint returns real mitigation data
    for the sidebar indicator.
    """
    url = "http://127.0.0.1:8000/settings"
    res = requests.get(url, timeout=5)
    assert res.status_code == 200
    data = res.json()
    assert "mitigations" in data
    assert "delimiter" in data["mitigations"]
    assert "sanitization" in data["mitigations"]
    assert "output_filter" in data["mitigations"]
    assert "retrieval_score_threshold" in data["mitigations"]


def test_sidebar_has_all_7_screens():
    """
    Verify that App.jsx and Sidebar.jsx define all 7 required screens from spec 2.3.
    """
    app_jsx = (FRONTEND_DIR / "src" / "App.jsx").read_text(encoding="utf-8")
    sidebar_jsx = (FRONTEND_DIR / "src" / "components" / "Sidebar.jsx").read_text(encoding="utf-8")

    expected_screens = [
        "trace",       # 1. Live trace
        "chat",        # 2. Chat
        "documents",   # 3. Documents
        "audit",       # 4. Audit log
        "replay",      # 5. Attack replay
        "test-runs",   # 6. Test suite
        "settings",    # 7. Settings
    ]

    for screen_id in expected_screens:
        assert screen_id in app_jsx, f"Missing screen '{screen_id}' in App.jsx"
        assert screen_id in sidebar_jsx, f"Missing screen '{screen_id}' in Sidebar.jsx"


def test_api_js_encapsulation():
    """
    Verify that frontend/src/api.js is the only file that accesses
    import.meta.env.VITE_API_BASE_URL.
    """
    src_dir = FRONTEND_DIR / "src"
    referencing_files = []
    for file_path in src_dir.rglob("*.js*"):
        content = file_path.read_text(encoding="utf-8")
        if "VITE_API_BASE_URL" in content:
            rel = file_path.relative_to(src_dir).as_posix()
            referencing_files.append(rel)

    assert referencing_files == ["api.js"], (
        f"VITE_API_BASE_URL accessed outside api.js: {referencing_files}"
    )
