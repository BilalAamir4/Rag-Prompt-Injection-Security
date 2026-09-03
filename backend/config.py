"""
Sentinel RAG - Configuration Module
Single source of truth for all environment configuration.
All other modules must import config from here and NEVER call os.environ/os.getenv directly.
"""

from dataclasses import dataclass, field
import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Search for .env in current working dir, backend/ dir, or parent repo root dir
_possible_env_paths = [
    Path.cwd() / ".env",
    Path(__file__).resolve().parent / ".env",
    Path(__file__).resolve().parent.parent / ".env",
]

for _path in _possible_env_paths:
    if _path.is_file():
        load_dotenv(dotenv_path=_path, override=False)
        break
else:
    load_dotenv()

# Read environment variables with defaults matching .env.example
LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_API_KEY: str = os.getenv("LLM_API_KEY", "unused-for-local-ollama")
LLM_MODEL: str = os.getenv("LLM_MODEL", "llama3.1")
DATA_DIR: str = os.getenv("DATA_DIR", "./data")
ALLOWED_ORIGINS_RAW: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS: List[str] = [
    origin.strip() for origin in ALLOWED_ORIGINS_RAW.split(",") if origin.strip()
]


@dataclass(frozen=True)
class Settings:
    LLM_BASE_URL: str = LLM_BASE_URL
    LLM_API_KEY: str = LLM_API_KEY
    LLM_MODEL: str = LLM_MODEL
    DATA_DIR: str = DATA_DIR
    ALLOWED_ORIGINS: List[str] = field(default_factory=lambda: list(ALLOWED_ORIGINS))
    ALLOWED_ORIGINS_RAW: str = ALLOWED_ORIGINS_RAW

    @property
    def data_path(self) -> Path:
        p = Path(self.DATA_DIR)
        if p.is_absolute():
            return p
        repo_root = Path(__file__).resolve().parent.parent
        if (repo_root / p).exists():
            return (repo_root / p).resolve()
        if p.exists():
            return p.resolve()
        return (repo_root / p).resolve()


settings = Settings()
