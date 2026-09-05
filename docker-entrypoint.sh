#!/bin/sh
set -e

DATA_PATH="${DATA_DIR:-/data}"
DOCS_PATH="$DATA_PATH/documents"

mkdir -p "$DOCS_PATH"
mkdir -p "$DATA_PATH/chroma"

# Seed baseline documents into persistent volume if missing
if [ ! -f "$DOCS_PATH/faq_doc.md" ]; then
    echo "[Entrypoint] Initializing baseline documents into persistent volume: $DOCS_PATH"
    cp -r /app/baseline_data/documents/* "$DOCS_PATH/" 2>/dev/null || true
fi

PORT="${PORT:-8000}"
echo "[Entrypoint] Starting Sentinel RAG backend on port $PORT with DATA_DIR=$DATA_PATH"
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
