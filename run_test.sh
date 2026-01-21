#!/usr/bin/env bash
set -euo pipefail

# Convenience wrapper to run the isolated test stack under tests/docker-compose.yml.
# Usage: ./run_test.sh [--ci] [--fix-puppeteer] [extra docker compose args]
# Env flags:
#   BUILD=0          skip rebuilding images (default: 1)
#   KEEP_STACK=1     leave containers/volumes running after tests (default: 0)
# Flags:
#   --ci             Use CI compose overlay (no source mounts, inline configs) - matches GitHub Actions
#   --fix-puppeteer  Use linux/amd64 platform for workers (fixes Puppeteer on Apple Silicon)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${ROOT_DIR}/tests/docker-compose.yml"
COMPOSE_CI_FILE="${ROOT_DIR}/tests/docker-compose.ci.yml"
BUILD="${BUILD:-1}"
KEEP_STACK="${KEEP_STACK:-0}"
FIX_PUPPETEER=0
CI_MODE=0

# Parse arguments
EXTRA_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --ci)
      CI_MODE=1
      ;;
    --fix-puppeteer)
      FIX_PUPPETEER=1
      ;;
    *)
      EXTRA_ARGS+=("$arg")
      ;;
  esac
done

# Build the compose command based on mode
build_compose_files() {
  local files="-f ${COMPOSE_FILE}"
  if [[ "${CI_MODE}" == "1" ]]; then
    files="${files} -f ${COMPOSE_CI_FILE}"
  fi
  if [[ -n "${COMPOSE_OVERRIDE:-}" ]]; then
    files="${files} -f ${COMPOSE_OVERRIDE}"
  fi
  echo "${files}"
}

compose_cmd() {
  eval "docker compose $(build_compose_files)" "$@"
}

UP_ARGS=(up --abort-on-container-exit --force-recreate)
if [[ "${BUILD}" != "0" ]]; then
  UP_ARGS+=(--build)
fi
if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  UP_ARGS+=("${EXTRA_ARGS[@]}")
fi

# If --fix-puppeteer is set, use an override compose file for platform
COMPOSE_OVERRIDE=""
if [[ "${FIX_PUPPETEER}" == "1" ]]; then
  COMPOSE_OVERRIDE="${ROOT_DIR}/tests/docker-compose.puppeteer-fix.yml"
  # Create the override file if it doesn't exist
  if [[ ! -f "${COMPOSE_OVERRIDE}" ]]; then
    cat > "${COMPOSE_OVERRIDE}" << 'EOF'
# Override file to fix Puppeteer on Apple Silicon (M1/M2/M3)
# Forces workers service to run under linux/amd64 emulation
services:
  workers:
    platform: linux/amd64
EOF
    echo "Created ${COMPOSE_OVERRIDE}"
  fi
fi

echo "Using compose file: ${COMPOSE_FILE}"
[[ "${CI_MODE}" == "1" ]] && echo "Using CI overlay: ${COMPOSE_CI_FILE}"
[[ -n "${COMPOSE_OVERRIDE:-}" ]] && echo "Using override file: ${COMPOSE_OVERRIDE}"
echo "BUILD=${BUILD} KEEP_STACK=${KEEP_STACK} FIX_PUPPETEER=${FIX_PUPPETEER} CI_MODE=${CI_MODE}"

# Generate SSL certificates if in CI mode (matches .github/workflows/test.yml)
if [[ "${CI_MODE}" == "1" ]]; then
  CERT_DIR="${ROOT_DIR}/tests/fixtures/nginx/certs"
  mkdir -p "${CERT_DIR}"
  if [[ ! -f "${CERT_DIR}/server.crt" ]] || [[ ! -f "${CERT_DIR}/server.key" ]]; then
    echo "Generating test SSL certificates..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "${CERT_DIR}/server.key" -out "${CERT_DIR}/server.crt" \
      -subj "/CN=localhost/O=Test/C=US" \
      -addext "subjectAltName=DNS:localhost,DNS:nginx-ssl,IP:127.0.0.1" 2>/dev/null || true
  fi
fi

echo "Running: docker compose $(build_compose_files) ${UP_ARGS[*]}"

compose_cmd "${UP_ARGS[@]}"
status=$?

if [[ "${KEEP_STACK}" == "0" ]]; then
  echo "Bringing down test stack..."
  compose_cmd down -v
else
  echo "KEEP_STACK=1 set; leaving containers/volumes running."
fi

exit "${status}"
