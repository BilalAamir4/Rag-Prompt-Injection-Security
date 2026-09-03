#!/usr/bin/env bash
set -e

echo "=== Sentinel RAG - Development Launcher ==="

# Step 1: Environment files setup
echo "[1/4] Checking environment configurations..."
if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
        echo "  [INFO] Copied backend/.env.example -> backend/.env"
    fi
fi

if [ ! -f "frontend/.env" ]; then
    if [ -f "frontend/.env.example" ]; then
        cp frontend/.env.example frontend/.env
        echo "  [INFO] Copied frontend/.env.example -> frontend/.env"
    fi
fi

if [ -f "backend/.env" ] && [ -f "frontend/.env" ]; then
    echo "  [PASS] Environment files (.env) are ready."
else
    echo "  [FAIL] Missing required .env.example files."
    exit 1
fi

# Step 2: Check Ollama connectivity
echo "[2/4] Checking Ollama connectivity..."
if curl -s -f http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "  [PASS] Ollama is running and reachable at http://localhost:11434"
else
    echo "  [FAIL] Ollama is NOT reachable at http://localhost:11434"
    echo "  Please start Ollama ('ollama serve') before running Sentinel RAG."
    exit 1
fi

# Step 3: Confirm DATA_DIR exists
echo "[3/4] Checking persistent DATA_DIR..."
# Extract DATA_DIR or default to ./data
DATA_DIR_VAL=$(grep -E '^DATA_DIR=' backend/.env | cut -d '=' -f2- | tr -d '\r' || echo "./data")
DATA_DIR_VAL=${DATA_DIR_VAL:-./data}

mkdir -p "$DATA_DIR_VAL/documents"
if [ -d "$DATA_DIR_VAL" ]; then
    echo "  [PASS] DATA_DIR exists at: $DATA_DIR_VAL"
else
    echo "  [FAIL] Could not verify/create DATA_DIR at: $DATA_DIR_VAL"
    exit 1
fi

# Step 4: Launch backend and frontend
echo "[4/4] Starting services..."

cleanup() {
    echo ""
    echo "Shutting down servers..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup INT TERM EXIT

# Start backend
echo "  Starting FastAPI backend on http://localhost:8000..."
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Give backend a moment to bind
sleep 2

# Start frontend
echo "  Starting Vite frontend on http://localhost:5173..."
cd frontend
npm run dev

