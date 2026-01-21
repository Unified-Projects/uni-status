#!/bin/sh
set -e

echo "[entrypoint] Starting environment variable replacement..."

# Replace placeholders in built Next.js files
if [ -n "$UNI_STATUS_URL" ]; then
  # Remove trailing slash if present
  UNI_STATUS_URL="${UNI_STATUS_URL%/}"

  echo "[entrypoint] Replacing URL placeholders with: $UNI_STATUS_URL"

  # Derive API URL
  API_URL="$UNI_STATUS_URL/api"

  # Replace app URL placeholder (valid URL format for build-time)
  find /app -type f -name "*.js" -exec sed -i "s|http://PLACEHOLDER_UNI_STATUS_URL/api|$API_URL|g" {} + 2>/dev/null || true
  find /app -type f -name "*.js" -exec sed -i "s|http://PLACEHOLDER_UNI_STATUS_URL|$UNI_STATUS_URL|g" {} + 2>/dev/null || true

  echo "[entrypoint] URL replacement complete"
else
  echo "[entrypoint] Warning: UNI_STATUS_URL not set, using build-time defaults"
fi

echo "[entrypoint] Starting Next.js server..."
# Bind to all interfaces so healthchecks can reach localhost
export HOSTNAME="0.0.0.0"
exec "$@"
