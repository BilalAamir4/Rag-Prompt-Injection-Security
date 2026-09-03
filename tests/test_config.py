import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

import config


def test_config_exports():
    assert hasattr(config, "LLM_BASE_URL")
    assert hasattr(config, "LLM_API_KEY")
    assert hasattr(config, "LLM_MODEL")
    assert hasattr(config, "DATA_DIR")
    assert hasattr(config, "ALLOWED_ORIGINS")
    assert hasattr(config, "settings")


def test_settings_values():
    s = config.settings
    assert s.LLM_BASE_URL.startswith("http")
    assert s.LLM_MODEL != ""
    assert isinstance(s.ALLOWED_ORIGINS, list)
    assert len(s.ALLOWED_ORIGINS) > 0


def test_no_raw_env_calls_outside_config():
    """Verify that no file in backend/ calls os.environ or os.getenv except config.py."""
    violations = []
    for py_file in backend_dir.glob("*.py"):
        if py_file.name == "config.py":
            continue
        content = py_file.read_text(encoding="utf-8")
        if "os.environ" in content or "os.getenv" in content:
            violations.append(str(py_file.name))

    assert (
        violations == []
    ), f"Files calling os.environ/os.getenv directly outside config.py: {violations}"
