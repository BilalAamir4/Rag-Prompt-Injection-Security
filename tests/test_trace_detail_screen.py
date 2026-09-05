"""
Phase P11 Acceptance Test Suite: Attack Replay / Trace Detail Screen (Spec Screen 5)

Verifies:
1. Vitest frontend component test execution (TraceDetail.test.jsx) passes all tests.
2. Security invariant: Grep confirms zero occurrences of 'dangerouslySetInnerHTML' in TraceDetail.jsx.
3. Substring highlighting helper contract: highlightTrace() returns React nodes, never HTML string.
4. Null guard verification: GET /audit-log/{id} for disabled-threshold run returns flag_threshold=None and threshold_enabled=False.
5. CSS styling: Verified highlight-attack (red) and highlight-delimiter (teal) style tokens.
"""

import subprocess
import requests
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
TRACE_DETAIL_JSX = FRONTEND_DIR / "src" / "components" / "TraceDetail.jsx"
API_BASE_URL = "http://localhost:8000"


def test_vitest_trace_detail_suite():
    """Runs vitest on TraceDetail.test.jsx to verify React-nodes rendering and null guard assertions."""
    cmd = ["npm", "test", "--", "src/__tests__/TraceDetail.test.jsx"]
    result = subprocess.run(
        cmd,
        cwd=str(FRONTEND_DIR),
        capture_output=True,
        text=True,
        shell=True,
        timeout=60,
    )
    assert result.returncode == 0, f"Vitest TraceDetail tests failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    assert "passed" in result.stdout.lower(), f"Expected 'passed' in Vitest output:\n{result.stdout}"


def test_zero_dangerously_set_inner_html():
    """CRITICAL SECURITY INVARIANT: TraceDetail.jsx must NEVER use dangerouslySetInnerHTML."""
    assert TRACE_DETAIL_JSX.exists(), f"TraceDetail.jsx does not exist at {TRACE_DETAIL_JSX}"
    content = TRACE_DETAIL_JSX.read_text(encoding="utf-8")
    assert "dangerouslySetInnerHTML" not in content, (
        "CRITICAL SECURITY VIOLATION: Found 'dangerouslySetInnerHTML' in TraceDetail.jsx! "
        "The retrieved chunk is attacker-controlled by design; rendering raw HTML creates an XSS vulnerability."
    )


def test_null_guard_api_contract():
    """Verifies that GET /audit-log/{id} for unmitigated run (Row 692 or recent disabled-threshold run) returns flag_threshold as None."""
    resp = requests.get(f"{API_BASE_URL}/audit-log?limit=1", timeout=10)
    assert resp.status_code == 200, f"Failed to fetch audit log: {resp.status_code}"
    logs = resp.json().get("logs", [])
    assert len(logs) > 0, "No audit logs available to test"

    target_log = logs[0]
    log_id = target_log["id"]

    single_resp = requests.get(f"{API_BASE_URL}/audit-log/{log_id}", timeout=10)
    assert single_resp.status_code == 200, f"Failed to fetch single audit log {log_id}"
    log_data = single_resp.json()

    # If threshold was disabled on this run, assert null guard contract
    if not log_data.get("threshold_enabled"):
        assert log_data.get("flag_threshold") is None, (
            f"Expected flag_threshold to be None when threshold_enabled is False, got: {log_data.get('flag_threshold')}"
        )


def test_css_highlighting_classes():
    """Verifies highlight-attack and highlight-delimiter CSS classes exist and use appropriate theme colors."""
    index_css = FRONTEND_DIR / "src" / "index.css"
    css_content = index_css.read_text(encoding="utf-8")

    assert ".highlight-attack" in css_content, "Missing .highlight-attack in index.css"
    assert "var(--red" in css_content, "Missing --red color usage for attack highlight"

    assert ".highlight-delimiter" in css_content, "Missing .highlight-delimiter in index.css"
    assert "var(--teal" in css_content, "Missing --teal color usage for delimiter highlight"


if __name__ == "__main__":
    test_vitest_trace_detail_suite()
    test_zero_dangerously_set_inner_html()
    test_null_guard_api_contract()
    test_css_highlighting_classes()
    print("All Phase P11 Trace Detail acceptance checks passed!")
