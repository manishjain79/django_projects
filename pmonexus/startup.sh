#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Calculate optimal workers based on CPU cores (default to 3 if nproc fails)
CORES=$(nproc 2>/dev/null || echo 1)
WORKERS=$(( (CORES * 2) + 1 ))

echo "Starting Gunicorn with $WORKERS worker processes..."

# Execute Gunicorn (exec replaces script process with gunicorn for proper SIGTERM handling)
exec gunicorn \
  --bind 0.0.0.0:8000 \
  --workers $WORKERS \
  --threads 2 \
  --worker-class gthread \
  --max-requests 1000 \
  --max-requests-jitter 50 \
  --timeout 120 \
  --graceful-timeout 30 \
  --access-logfile - \
  --error-logfile - \
  config.wsgi:application