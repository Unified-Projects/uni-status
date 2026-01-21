#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="${LOG_DIR:-/tests/logs}"
API_BASE_URL="${API_BASE_URL:-http://api:3001}"
WEB_BASE_URL="${WEB_BASE_URL:-http://web:3000}"
HAPROXY_BASE_URL="${HAPROXY_BASE_URL:-http://haproxy}"

# Test target services (using container names within docker network)
HTTPBIN_URL="${HTTPBIN_URL:-http://uni-status-httpbin-test:80}"
RABBITMQ_URL="${RABBITMQ_URL:-http://uni-status-rabbitmq-test:15672}"
MAILHOG_URL="${MAILHOG_URL:-http://uni-status-mailhog-test:8025}"
WS_ECHO_URL="${WS_ECHO_URL:-http://uni-status-ws-echo-test:8080}"

mkdir -p "$LOG_DIR"
timestamp="$(date -u +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/run-$timestamp.txt"

wait_for() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"

  for i in $(seq 1 "$attempts"); do
    if curl -m 5 -sf "$url" >/dev/null 2>&1; then
      echo "[$label] ready" | tee -a "$LOG_FILE"
      return 0
    fi
    echo "[$label] waiting (${i}/${attempts})..." | tee -a "$LOG_FILE"
    sleep 2
  done

  echo "[$label] failed to become ready" | tee -a "$LOG_FILE"
  return 1
}

wait_for "$API_BASE_URL/health" "api-health"
wait_for "$API_BASE_URL/health/ready" "api-ready"
wait_for "$WEB_BASE_URL/health" "web-ui" 180
wait_for "$HAPROXY_BASE_URL" "haproxy" 30

# Wait for test target services (for worker integration tests)
echo "Waiting for test target services..." | tee -a "$LOG_FILE"
wait_for "$HTTPBIN_URL/get" "httpbin" 30 || echo "[httpbin] not available - HTTP worker tests may fail" | tee -a "$LOG_FILE"
wait_for "$RABBITMQ_URL" "rabbitmq-management" 30 || echo "[rabbitmq] not available - AMQP tests may fail" | tee -a "$LOG_FILE"
wait_for "$MAILHOG_URL" "mailhog" 30 || echo "[mailhog] not available - SMTP tests may fail" | tee -a "$LOG_FILE"
wait_for "$WS_ECHO_URL" "ws-echo" 30 || echo "[ws-echo] not available - WebSocket tests may fail" | tee -a "$LOG_FILE"

echo "All services ready, waiting 5s for workers to initialize..." | tee -a "$LOG_FILE"
sleep 5

echo "Starting test suite..." | tee -a "$LOG_FILE"
pnpm test 2>&1 | tee -a "$LOG_FILE"
exit ${PIPESTATUS[0]}
