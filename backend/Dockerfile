# Use a slim Python base image to keep the build lean
FROM python:3.11-slim

# Install system-level dependencies:
# - ngspice: required for circuit simulation
# - build-essential: needed because some Python packages compile native code during install
RUN apt-get update && apt-get install -y --no-install-recommends \
    ngspice \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# NOTE: this Dockerfile is now built from the REPO ROOT, not from inside backend/.
# On Render, Root Directory must be set to blank (repo root), not "backend".

# Copy only requirements first for better layer caching
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend code into /app (so main.py etc. end up at /app/main.py)
COPY backend/ .

# Copy the models directory as a sibling of backend's contents, matching what
# fault_analyzer.py expects at Path(__file__).parent.parent / "models"
# IMPORTANT: this assumes fault_analyzer.py lives directly at backend/fault_analyzer.py
# (one level deep). If it's nested further, e.g. backend/app/fault_analyzer.py,
# this path needs adjusting — see note below before deploying.
COPY models/ /models

CMD uvicorn main:app --host 0.0.0.0 --port $PORT
