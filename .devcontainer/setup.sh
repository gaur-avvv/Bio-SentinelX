#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Bio-SentinelX – Codespace post-create setup
# Runs ONCE after container creation.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "╔══════════════════════════════════════════════════╗"
echo "║  Bio-SentinelX: Codespace setup starting…       ║"
echo "╚══════════════════════════════════════════════════╝"

# ── 1. Swap file (prevents OOM kills during ML training) ────────────────────
SWAP_FILE="/swapfile"
SWAP_SIZE="8G"   # Use 8 GB swap; safe on any ≥16 GB Codespace machine

if [ ! -f "$SWAP_FILE" ]; then
  echo "▸ Creating ${SWAP_SIZE} swap file at ${SWAP_FILE}…"
  sudo fallocate -l "$SWAP_SIZE" "$SWAP_FILE"
  sudo chmod 600 "$SWAP_FILE"
  sudo mkswap "$SWAP_FILE"
  sudo swapon "$SWAP_FILE"
  echo "▸ Swap enabled:"
  swapon --show
else
  echo "▸ Swap file already exists – enabling…"
  sudo swapon "$SWAP_FILE" 2>/dev/null || true
fi

# Tune swappiness: prefer RAM, only use swap under pressure
sudo sysctl -w vm.swappiness=10 || true

# ── 2. Python dependencies (ML API) ─────────────────────────────────────────
echo ""
echo "▸ Installing Python dependencies from flood_ml_api/requirements.txt…"
pip install --quiet --upgrade pip
pip install --quiet -r /workspaces/Bio-SentinelX/flood_ml_api/requirements.txt

# ── 3. Node dependencies (frontend) ─────────────────────────────────────────
echo ""
echo "▸ Installing Node dependencies…"
cd /workspaces/Bio-SentinelX && npm install --silent

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Setup complete! Run:                            ║"
echo "║    bash run_api.sh      → start ML API          ║"
echo "║    npm run dev          → start frontend         ║"
echo "╚══════════════════════════════════════════════════╝"
