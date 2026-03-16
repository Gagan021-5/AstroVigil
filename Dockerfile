# ═══════════════════════════════════════════════════════════════════
# Autonomous Constellation Manager (ACM)
# Multi-stage Docker build using ubuntu:22.04 base image
# ═══════════════════════════════════════════════════════════════════
FROM ubuntu:22.04 AS base

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Ensure python3 points to python3.11
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 || true

WORKDIR /app

# ── Stage 1: Build Frontend ───────────────────────────────────────
FROM base AS frontend-build

COPY frontend/package.json frontend/package-lock.json* /app/frontend/
WORKDIR /app/frontend
RUN npm install --production=false

COPY frontend/ /app/frontend/
RUN npm run build

# ── Stage 2: Production Image ─────────────────────────────────────
FROM base AS production

# Install Python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip3 install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend source
COPY backend/ /app/backend/

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Expose API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Start FastAPI server on 0.0.0.0:8000
WORKDIR /app/backend
CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
