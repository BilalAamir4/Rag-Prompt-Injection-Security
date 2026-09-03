# Sentinel RAG - Development Launcher (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "=== Sentinel RAG - Development Launcher ===" -ForegroundColor Cyan

# Step 1: Environment files setup
Write-Host "[1/4] Checking environment configurations..."
if (-not (Test-Path "backend/.env")) {
    if (Test-Path "backend/.env.example") {
        Copy-Item "backend/.env.example" "backend/.env"
        Write-Host "  [INFO] Copied backend/.env.example -> backend/.env" -ForegroundColor Yellow
    }
}

if (-not (Test-Path "frontend/.env")) {
    if (Test-Path "frontend/.env.example") {
        Copy-Item "frontend/.env.example" "frontend/.env"
        Write-Host "  [INFO] Copied frontend/.env.example -> frontend/.env" -ForegroundColor Yellow
    }
}

if ((Test-Path "backend/.env") -and (Test-Path "frontend/.env")) {
    Write-Host "  [PASS] Environment files (.env) are ready." -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Missing required .env.example files." -ForegroundColor Red
    exit 1
}

# Step 2: Check Ollama connectivity
Write-Host "[2/4] Checking Ollama connectivity..."
try {
    $res = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  [PASS] Ollama is running and reachable at http://localhost:11434" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Ollama is NOT reachable at http://localhost:11434" -ForegroundColor Red
    Write-Host "  Please start Ollama ('ollama serve') before running Sentinel RAG."
    exit 1
}

# Step 3: Confirm DATA_DIR exists
Write-Host "[3/4] Checking persistent DATA_DIR..."
$dataDir = "./data"
if (Test-Path "backend/.env") {
    $envLines = Get-Content "backend/.env"
    foreach ($line in $envLines) {
        if ($line -match "^DATA_DIR=(.*)$") {
            $dataDir = $matches[1].Trim()
        }
    }
}

$documentsDir = Join-Path $dataDir "documents"
if (-not (Test-Path $documentsDir)) {
    New-Item -ItemType Directory -Path $documentsDir -Force | Out-Null
}

if (Test-Path $dataDir) {
    Write-Host "  [PASS] DATA_DIR exists at: $dataDir" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Could not verify/create DATA_DIR at: $dataDir" -ForegroundColor Red
    exit 1
}

# Step 4: Launch backend and frontend
Write-Host "[4/4] Starting services..." -ForegroundColor Cyan

$backendProcess = Start-Process -FilePath "python" -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--reload" -WorkingDirectory "backend" -PassThru

Write-Host "  Starting FastAPI backend on http://localhost:8000 (PID: $($backendProcess.Id))..." -ForegroundColor Green
Start-Sleep -Seconds 2

try {
    Write-Host "  Starting Vite frontend on http://localhost:5173..." -ForegroundColor Green
    Set-Location "frontend"
    npm run dev
} finally {
    Write-Host "`nStopping backend process (PID: $($backendProcess.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    Set-Location ".."
}
