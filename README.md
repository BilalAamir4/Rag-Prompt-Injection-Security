# Sentinel RAG — Security & Prompt Injection Defense Platform

Sentinel RAG is a security research and evaluation harness designed to test, demonstrate, and mitigate indirect prompt injection attacks against Retrieval-Augmented Generation (RAG) pipelines.

## Development Setup & Server Startup

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- Ollama running locally (`ollama serve`) with `llama3.1` model pulled (`ollama pull llama3.1`)

---

### IMPORTANT: Windows Startup Note
> [!IMPORTANT]
> **Windows Shell Compatibility**:
> On Windows systems, plain PowerShell and Command Prompt do not have `bash` on `PATH` by default. Invoking `start-dev.sh` directly from PowerShell will fail with:
> `bash: The term 'bash' is not recognized as the name of a cmdlet, function, script file, or operable program.`
>
> To run the development environment on Windows, use one of the following two working startup paths:
> 1. **Native PowerShell Script (Recommended)**:
>    ```powershell
>    .\start-dev.ps1
>    ```
> 2. **Git Bash directly**:
>    ```powershell
>    & "D:\Uni Softwares\Git\Git\bin\bash.exe" start-dev.sh
>    ```
>    *(or from within a Git Bash terminal: `./start-dev.sh`)*

---

### Starting the Development Servers
Running either launcher above will:
1. Validate or initialize `.env` files from `.env.example` in `backend/` and `frontend/`.
2. Check connectivity to local Ollama (`http://localhost:11434`).
3. Ensure the persistent `DATA_DIR` directory exists (`./data/documents`).
4. Start the FastAPI backend on `http://localhost:8000`.
5. Start the Vite React frontend on `http://localhost:5173`.

### Architecture & Endpoints
- **Frontend**: `http://localhost:5173` (React 18 + Vite)
- **Backend API**: `http://localhost:8000` (FastAPI + Uvicorn)
- **API Health**: `GET http://localhost:8000/health`
- **Audit Log**: `GET http://localhost:8000/audit-log`
- **CSV Export**: `GET http://localhost:8000/audit-log/export`
