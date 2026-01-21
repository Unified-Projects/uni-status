# Isolated test stack

This folder contains an isolated docker-compose stack plus a test-runner container that waits for the full app to boot, executes the test suite, and writes logs to `tests/logs/*.txt`.

## Running

- Start everything (build images the first time):
  - `docker compose -f tests/docker-compose.yml up --build --abort-on-container-exit --force-recreate`
- Logs are mirrored into `tests/logs/run-<timestamp>.txt` via a bind mount.
- Stop and clean volumes when done:
  - `docker compose -f tests/docker-compose.yml down -v`

## What’s inside

- **Stack parity:** copies of Postgres, Redis, migrations, API, Web, Workers, Mailhog, BullBoard, and HAProxy with `-test` container names and no host port bindings to avoid clashing with your dev stack. The test runner talks to services via their container names (e.g., `uni-status-api-test`).
- **Test runner:** `tests/Dockerfile` builds a Node-based runner with Vitest. Entry point `run-tests.sh` waits for the API/web to respond, then runs the suite and tees output into the mounted `logs` directory.
- **Config:** `vitest.config.ts` + `tsconfig.json` set up a Node test environment. Update `tests/package.json` to add libs you need for deeper checks (e.g., Playwright, supertest).
- **DB seeding:** `tests/src/helpers/context.ts` inserts a fresh org/user/api-key directly into Postgres for each test file, giving you authenticated API access without touching production data.
- **Coverage today:** smoke coverage for API health, web landing page, monitors CRUD, incidents, status pages, alerts (channels/policies), escalations, maintenance windows, on-call rotations, analytics uptime summaries, report settings, uploads, SSE connectivity, public endpoints (regions + published status pages), and probes (create/list/assign + agent heartbeat/jobs/results/stats).

## Adding feature coverage

- Add spec files under `tests/src/<feature>/<name>.test.ts`.
- Use the `API_BASE_URL`, `WEB_BASE_URL`, and `HAPROXY_BASE_URL` env vars (already set in `docker-compose.yml`) to talk to services from inside the runner.
- Keep assertions focused on user-visible behavior (API responses, rendered pages, queues/jobs). Extend `run-tests.sh` if you need extra readiness checks or seeded fixtures.

## Notes

- This suite is intentionally independent from the root compose; it uses separate data volumes (`*_test`) and container names.
- If you need host access to the services while the suite runs, add ports to the test compose or run `docker compose logs -f`.
