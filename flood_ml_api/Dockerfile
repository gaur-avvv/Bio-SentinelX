# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM python:3.11.9-slim AS builder

LABEL org.opencontainers.image.title="Bio-SentinelX Flood ML API" \
      org.opencontainers.image.description="GIS-integrated ML engine for urban flood micro-hotspot identification" \
      org.opencontainers.image.version="2.1.0" \
      org.opencontainers.image.source="https://github.com/your-org/bio-sentinelx"

WORKDIR /app

# System deps for LightGBM / XGBoost native builds + curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libgomp1 libgfortran5 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.11.9-slim

WORKDIR /app

# Runtime system deps only (curl for HEALTHCHECK, libgomp for XGBoost/LightGBM)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY . .

# Create directories for persistent data
RUN mkdir -p saved_models

# Non-root user for security
RUN useradd -m -u 1000 flooduser && chown -R flooduser:flooduser /app
USER flooduser

# Expose port (Railway's $PORT env var overrides this at runtime)
EXPOSE 8000

# Health check via curl — faster than Python httpx import on every interval
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -sf "http://localhost:${PORT:-8000}/health" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='healthy' else 1)"

# Start command — use $PORT for Railway, default 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --loop asyncio --log-level warning"]
