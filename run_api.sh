#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Bio-SentinelX – local / Codespace API runner
# Usage:   bash run_api.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/flood_ml_api" && pwd)"

# ── 1. Ensure swap is on (no-op if already active) ──────────────────────────
if ! swapon --show | grep -q '/swapfile'; then
  if [ -f /swapfile ]; then
    echo "▸ Re-enabling swap…"
    sudo swapon /swapfile 2>/dev/null || true
  else
    echo "⚠  No swap file found. Run: bash .devcontainer/setup.sh first."
  fi
fi
echo "▸ Memory status:"
free -h | head -2

# ── 2. Install / upgrade Python deps (skip if already satisfied) ─────────────
echo ""
echo "▸ Checking Python dependencies…"
pip install --quiet -r "$API_DIR/requirements.txt"

# ── 3. Launch uvicorn ────────────────────────────────────────────────────────
# - 1 worker: avoids duplicate training on each worker process
# - --loop asyncio: required for APScheduler + FastAPI lifespan
# - OMP / OpenBLAS thread limits: stop NumPy/sklearn from spawning 4×N threads
export OMP_NUM_THREADS=2
export OPENBLAS_NUM_THREADS=2
export MKL_NUM_THREADS=2
export NUMEXPR_NUM_THREADS=2
export JOBLIB_TEMP_FOLDER=/tmp

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Starting Bio-SentinelX Flood ML API             ║"
echo "║  URL : http://localhost:8000                     ║"
echo "║  Docs: http://localhost:8000/docs                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

cd "$API_DIR"
exec uvicorn main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 1 \
  --loop asyncio \
  --log-level info \
  --reload
