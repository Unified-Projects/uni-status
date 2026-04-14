# Changelog

All notable changes to Uni-Status will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.7] - 2026-04-14

### Changed
- Restored report downloads in the dashboard by aligning the reports UI with the proxied `downloadUrl` API response and making the action visible as a labeled download control
- Improved status badge readability across dashboard monitor and embed surfaces by switching operational/degraded/down badges from white-on-solid fills to higher-contrast semantic status colors
- Updated badge template preview rendering to automatically choose a readable foreground color for status text and icons based on the selected status fill color
- Bumped workspace package/runtime version references from `0.2.6` to `0.2.7`

### Tests
- Added enterprise reports API coverage for sanitized report responses to assert `downloadUrl` is returned while `fileUrl` remains hidden

## [0.2.6] - 2026-04-14

### Added
- Added startup warming for published unprotected public status-page shell/live caches with environment-controlled concurrency and page limits

### Changed
- Updated public status-page rendering to load cached shell data on the server, hydrate live monitor and incident data on the client, and keep subscribe sections padded consistently across layouts
- Updated organization uptime analytics to aggregate intervals across multiple monitors for org-wide views while still folding in the latest raw check results for the current interval
- Simplified the dashboard overview so monitor summary cards and the combined uptime history render together without a tab switch, and renamed the uptime section to reflect the org-wide combined view
- Bumped workspace package/runtime version references from `0.2.5` to `0.2.6`

### Tests
- Added coverage for split public status-page shell/live payloads, protected shell/live access enforcement, org-wide uptime interval aggregation, and shell-rendered public status-page content

## [0.2.5] - 2026-04-14

### Added
- Added a dashboard `Uptime` tab with a full-width combined uptime history view, shared hover details, and `45`/`90` day range switching across all organization monitors
- Added a monitor list `Check All` action plus a dedicated `POST /api/v1/monitors/check-all` endpoint to queue checks for every non-paused monitor in an organization

### Changed
- Improved uptime-bar tooltip positioning so hover popups keep a stable readable width and clamp cleanly near the right edge instead of collapsing
- Bumped workspace package/runtime version references from `0.2.4` to `0.2.5`

### Tests
- Added API coverage for the new monitor `check-all` endpoint and its paused-monitor skip behavior

## [0.2.4] - 2026-04-14

### Changed
- Updated public status-page loading to use the cached full payload on first render and relaxed shell-data revalidation to reduce redundant server fetches
- Added extra footer padding on public status pages so the footer no longer sits flush against the viewport edge
- Bumped workspace package/runtime version references from `0.2.3` to `0.2.4`

## [0.2.3] - 2026-04-13

### Added
- Added role-aware organization access enforcement so authenticated users, API keys, federated sessions, WebSocket clients, and monitor SSE subscriptions are validated against real organization membership and ownership context
- Added brute-force protection for public status-page password verification and required real authenticated sessions for OAuth verification on protected public status pages
- Added shared public status-page route shell handling for subpages plus new light/dark `mutedText` theme colors for secondary copy styling
- Added per-monitor TLS behavior controls for HTTP checks and expanded pending-approval responses with `userId`

### Changed
- Unified public status-page access handling across REST, GraphQL, live events, and shell rendering so password- and OAuth-protected pages behave consistently across the API and web app
- Updated monitor list, dashboard analytics, enterprise analytics, and public status-page charts to combine historical aggregate tables with recent raw check data, push dense response-time aggregation into SQL, and reduce unnecessary refetch pressure when realtime connectivity is healthy
- Updated dashboard monitor filtering and web data hooks to use stronger server-side filtering, organization-scoped query keys, and safer invalidation behavior when switching organizations
- Improved certificate listing and related API pagination handling with grouped latest-result queries, clamped pagination parsing, normalized HTTP error payloads, and proxied report download URLs instead of exposing raw file URLs
- Refined public status-page layout, theme editing, uptime visualization, and monitor presentation behavior for more consistent shells, anchored footers, fresher shell data, and more accurate short-range uptime labels
- Bumped workspace package/runtime version references from `0.2.2` to `0.2.3`

### Fixed
- Prevented forged identity payloads and unauthenticated requests from silently accessing OAuth-protected status-page verification, monitor SSE streams, and WebSocket routes
- Prevented dashboard setup redirects caused by organization-fetch failures and clarified HTTPS uptime checks so certificate metadata remains separate from dedicated SSL monitor results
- Hardened OIDC discovery validation by rejecting non-public or non-HTTPS discovery targets

### Tests
- Expanded coverage for protected public status pages, realtime auth guards, monitor ingestion aggregate-backed uptime, self-hosted approval/setup flows, upload validation, and entitlement/report response handling
- Replaced certificate scheduling unit coverage with fuller worker integration coverage, updated maintenance-suppression integration flows, and re-enabled previously excluded worker/integration suites in Vitest
- Updated CI TLS test certificates with SAN support and longer validity for containerized SSL coverage

## [0.2.2] - 2026-03-20

### Added
- Added monitor duplication support (`POST /monitors/:id/duplicate`) including dependency cloning, audit logging, and dashboard actions
- Added threshold-aware monitor transition handling in workers using `degradedAfterCount`/`downAfterCount` with consecutive status counters
- Added conditional `ETag`/`304` handling for public status page payload, shell, and live endpoints
- Added optional `includeTrend` support for dashboard analytics payloads to control expensive trend queries
- Added a composite polling index on monitors (`paused`, `nextCheckAt`, `type`) to improve scheduler query performance

### Changed
- Updated worker scheduler loops with batch/concurrency controls, grouped `nextCheckAt` updates, and Redis-backed distributed poll locks
- Updated monitor processors (HTTP/Ping/TCP/DNS/SSL/Email Auth) to use shared transition updates and consistent organization-aware alert evaluation context
- Updated status page response-time payload generation to prefer hourly aggregate tables for large windows before falling back to raw check results
- Updated GraphQL public status-page batch resolution with slug deduplication, bounded request size, and chunked resolution
- Updated enterprise reports verification/download flow to support private object storage reads via S3 SDK and to always proxy downloads through the API
- Updated dashboard/web analytics polling behavior to rely on SSE health and reduced unnecessary refetch load
- Updated SSE routing/query invalidation behavior with indexed client targeting and debounced invalidation handling
- Increased default API rate limit from `100` to `120` requests per minute
- Bumped workspace package/runtime version references from `0.2.1` to `0.2.2`

## [0.2.1] - 2026-03-20

### Added
- Added bulk monitor operations (`pause`, `resume`, `check`, `delete`) with API endpoints, SSE broadcast events, API client methods, and web hooks
- Added Google Chat alert channel support across database enum/types, validators, notification queue routing, test notification payloads, and dashboard channel UI

### Changed
- Updated monitor listing APIs/clients to support multi-filter status/type queries, search, and configurable sorting
- Updated SSE delivery and routing to use authenticated organization context for dashboard streams and organization-aware monitor event fan-out
- Improved scheduler and probe-dispatch workers with bounded-concurrency batch processing for polling, aggregation, maintenance notifications, and dispatch loops
- Improved API CORS origin caching with shared refresh deduplication and set-based origin lookups
- Optimized report generation incident counting by preloading incidents in-range and mapping affected monitors
- Improved OG image resource caching with cache pruning, stale fallback behavior, and entry limits
- Bumped workspace package/runtime version references from `0.2.0` to `0.2.1`

### Fixed
- Prevented alert evaluation and enterprise escalation dispatch while monitors are under active maintenance windows
- Ensured maintenance notification queueing respects subscriber email-channel preferences

### Tests
- Updated SSE API/integration tests to use authenticated stream connections
- Excluded maintenance-suppression integration coverage from containerized test runs that do not mount worker sources

## [0.2.0] - 2026-03-20

### Added
- Added response-time anomaly alert conditions across alert policy UI, API types, validators, and database schemas
- Added anomaly-specific alert history metadata (observed latency, expected threshold, baseline mean/stddev) for triggered updates and new incidents
- Added SLO burn-rate alert detection (fast and slow windows) with queue-driven notifications
- Added report integrity verification endpoint (`GET /reports/:id/verify`) with SHA-256 validation and audit logging
- Added report generation provenance metadata (checksum, runtime/version/environment, generation timestamps, query-window bounds)

### Changed
- Added configurable report queue handoff timing and explicit inline fallback controls for report generation
- Updated API Docker runtime to install Chromium and set Puppeteer executable/skip-download environment variables
- Updated dashboard organization selector to display organization logos in desktop and mobile navigation
- Improved alert channel card truncation behavior for long names and webhook/config values
- Normalized light-only status-page custom CSS so `html.dark` reuses light-mode variables
- Updated alert/escalation notification routing to use dedicated Teams, PagerDuty, SMS, and ntfy queues with cached queue instances
- Updated base Node Docker images to `25.8.1-alpine`, refreshed CI action pins, and upgraded dependency/security override sets

### Fixed
- Prevented worker startup from continuing silently when enterprise worker loading fails
- Fixed SLO alert dashboard links to use the SLO dashboard route
- Added guarded queue enqueue handling for escalation notifications to prevent processor failure on per-channel enqueue errors
- Hardened PageSpeed config access paths to avoid undefined-access issues during HTTP checks

### Tests
- Added comprehensive API tests for alert policy anomaly condition create/update flows
- Added public API coverage for light-only theme CSS normalization behavior

## [0.1.6] - 2026-03-18

### Added
- Added `performance` as a supported report type across reports UI, API types, and generation tests
- Added monitor-level alert policy visibility on the dashboard monitor detail page, including policy scope, status, channels, and cooldown metadata
- Added inline loading-state variant for contextual in-panel loading feedback
- Added richer SLA report metadata and summary payload fields (report identity, incident severity counts, downtime, and included settings)

### Changed
- Expanded default analytics/reporting windows from 30 days to 45 days across dashboard uptime, response-time history, deployments stats, monitor uptime stats, public service metrics, and status feeds
- Updated monitor response-time range selection and dashboard labels to reflect 45-day coverage
- Updated status-page footer locale selector behavior to display only when non-English translations are actually configured

### Fixed
- Added atomic report claim logic to prevent duplicate generation attempts when reports are no longer pending
- Added delayed self-healing inline fallback when queued reports remain unclaimed, reducing risk of stuck pending reports
- Added stable report generation queue `jobId` assignment to improve queue handoff reliability and deduplication behavior

## [0.1.5] - 2026-03-18

### Added
- Added event tab count aggregates (`all`, `active`, `resolved`, `incidents`, `maintenance`) to `GET /public/status-pages/:slug/events`
- Added paginated public event history support (`limit`/`offset`) with new API coverage tests
- Added status page metadata to public geo response payloads
- Added synthesized public edge probe markers for monitored/recently active regions

### Changed
- Refactored public events page to URL-driven state for tabs, filters, search, and view mode
- Switched public events UI to infinite pagination with live count refresh and clearer filter reset behavior
- Updated geo UI controls to explicit Edge/Origin mode and improved regional filtering behavior
- Improved geo map viewport handling to auto-fit visible regions, probes, and incidents
- Expanded dashboard analytics payload with monitor issue cards and active incident counts from analytics API
- Updated reports list auto-refresh logic to poll only while reports are `pending` or `generating`
- Prioritized internal status page API calls before proxy fallback for more reliable service-to-service fetches

### Fixed
- Added stale report recovery to avoid reports remaining indefinitely in `pending`/`generating`
- Added inline report generation fallback when queue submission fails to prevent stuck report states
- Added timeout signal to custom-domain slug lookup middleware requests

### Performance
- Reduced public status payload query overhead by selecting only needed monitor columns
- Replaced per-monitor latest-result lookups with grouped SQL queries for SSL, email auth, and heartbeat data
- Optimized response-time chart generation by fetching and grouping monitor check results in bulk
- Parallelized shell and live public status page fetches

### Tests
- Added comprehensive API tests for public geo probe synthesis/private probe assignment filtering
- Added comprehensive API tests for public events counts and pagination behavior

## [0.1.4] - 2026-03-10

### Performance
- Split public status page API into static `shell` and dynamic `live` endpoints
- Added cached shell delivery (`/public/status-pages/:slug/shell`) and short-TTL live payload caching (`/public/status-pages/:slug/live`)
- Updated web status-page loader to merge shell + live data and avoid rebuilding full payload for metadata/layout requests
- Switched public status layout and metadata generation to shell-only fetches to remove duplicate heavy data builds per request
- Batched monitor-level status payload lookups and replaced repeated array scans with set lookups to reduce backend latency on larger pages

### Added
- New public endpoints: `GET /public/status-pages/:slug/shell` and `GET /public/status-pages/:slug/live`

## [0.1.3] - 2026-03-07

### Performance
- Deduplicate status page API fetch with React `cache()` — eliminates double server-side call per request
- Add in-memory TTL cache for custom domain slug lookups in middleware (5 min hits, 30s misses)
- Add shared `layout.tsx` for all `[slug]/*` routes — theme, color mode, and custom CSS applied server-side once; monitors and page name passed via React context, eliminating client-side status page fetches on events and services sub-pages
- Reduce fetch timeout from 15s to 8s and retries from 3 to 1
- Add `useDeferredValue` on services page search to keep input responsive under load

### Fixed
- Services page name always showing "Status" due to incorrect response field path

### Refactored
- Extract server-side API types, theme utilities, and `getStatusPageData` to `lib/public-status-page-api.ts` as single shared source of truth

### Dependencies
- Updated Docker base images: `node:25.6.0-alpine` to `node:25.8.0-alpine` across all services; `oven/bun:1.3.8-alpine` to `oven/bun:1.3.10-alpine` in api and workers
- Updated GitHub Actions: `actions/checkout` v6.0.2, `actions/upload-artifact` v7.0.0, `actions/setup-node` v6.3.0, `oven-sh/setup-bun` v2.1.3, `docker/login-action` v4, `docker/setup-qemu-action` v4, `docker/setup-buildx-action` v4, `docker/metadata-action` v6, `docker/build-push-action` v7
- Updated production dependencies: `@aws-sdk/client-s3` 3.1004.0, `@better-auth/core` + `better-auth` 1.5.4, `@elastic/elasticsearch` 9.3.4, `@hono/swagger-ui` 0.6.0, `@hono/zod-openapi` 1.2.2, `bullmq` 5.70.4, `graphql` 16.13.1, `graphql-yoga` 5.18.1, `hono` 4.12.5, `@hono/node-server` 1.19.11, `ioredis` 5.10.0, `mongodb` 7.1.0, `mysql2` 3.19.0, `nodemailer` 8.0.1, `pg` 8.20.0, `pino` 10.3.1, `puppeteer` 24.38.0, `react` 19.2.4, `react-day-picker` 9.14.0, `react-email` + `@react-email/components` 5.2.9/1.0.8, `react-hook-form` 7.71.2, `react-leaflet` 5.0.0, `recharts` 3.8.0, `resend` 6.9.3, `satori` 0.25.0, `@vercel/og` 0.11.1
- Updated dev dependencies: `@tanstack/react-query` 5.90.21, `@types/bun` 1.3.10, `@types/node` 25.3.5, `@types/nodemailer` 7.0.11, `@types/react` 19.2.14, `drizzle-kit` 0.31.9, `esbuild` 0.27.3, `framer-motion` 12.35.0, `lucide-react` 0.577.0, `postcss` 8.5.8, `tailwindcss` + `@tailwindcss/postcss` 4.2.1, `tailwind-merge` 3.5.0, `turbo` 2.8.14, `typescript-eslint` 8.56.1, `bun-types` 1.3.10, `autoprefixer` 10.4.27

## [0.1.2] - 2026-02-25

### Security
- Updated Next.js to >=16.1.5 to address HTTP request deserialization DoS vulnerability
- Updated Next.js to >=16.1.5 to fix unbounded memory consumption via PPR Resume endpoint
- Updated Next.js to >=16.1.5 to fix DoS via Image Optimizer remotePatterns configuration
- Updated esbuild to >=0.25.0 to address development server access vulnerability
- Updated lodash to >=4.17.23 to resolve prototype pollution vulnerability in _.unset and _.omit
- Updated @isaacs/brace-expansion to >=5.0.1 to resolve uncontrolled resource consumption vulnerability

### Added
- Independent PageSpeed schedule (runs separately from HTTP checks, default 24 hours)
- Logo and theme support for email templates
- Organization logo as default favicon for status pages

### Fixed
- Alert channel card URL overflow with long webhook URLs
- Status page fetch errors with timeout and retry logic
- Server-side caching for status page API responses

## [0.1.1] - 2026-02-03

### Added
- Probe to release builds with health check endpoints

### Fixed
- CodeQL security vulnerabilities in URL validation and sanitization
- TypeScript type-check errors in CI
- System and test issues
- ESLint prefer-const violations in uptime-bar component
- Zod v4 compatibility with explicit type assertions

### Changed
- Upgraded major dependencies: date-fns v4, recharts v3, vitest v4, mongodb v7
- Fixed recharts compatibility after upgrade
- Updated Docker images across multiple services
- Bumped GitHub Actions dependencies
- Updated dev dependencies (7 packages)
- Updated production dependencies (26 packages)

## [0.1.0] - 2026-02-02

### Added

#### Status Page Features
- Theme Manager UI with customizable color schemes and visual editor
- Color mode toggle (light/dark/system) with persistence
- Custom CSS injection for advanced styling
- Custom domain support for embedded status pages
- Logo and favicon customization with fallback handling
- Enhanced SEO configuration with custom meta tags
- Proportional uptime bar visualization

#### Alert System
- Complete alert policies with advanced trigger conditions (consecutive failures, time windows)
- Multi-channel alert routing (Email, Slack, Discord, MS Teams, PagerDuty, webhooks, SMS, ntfy, IRC, Twitter)
- Alert channel management with test notification capability
- Alert history tracking with status transitions (triggered, acknowledged, resolved)
- Notification builder with channel-specific templates
- Alert evaluator with cooldown periods and recovery detection
- Alert audit logging with before/after state tracking

#### OG (Open Graph) Image Generation
- Backend-based OG image generation using Satori + Resvg
- Theme-aware OG templates matching status page design
- Dynamic branding with logo integration
- Color detection and contrast optimization
- Cache management with 24-hour TTL

#### Embeds & Components
- Embed code generator with live preview
- Custom embed domain support
- Responsive embed layouts
- Enhanced dashboard navigation
- Loading state components
- Mobile-responsive header and navigation

#### Monitoring Enhancements
- Regions API for distributed monitoring
- Default region configuration
- Monitor form with extended configuration options
- Credentials form for integration management

#### Enterprise Features
- Audit log foundation for enterprise tracking
- On-call management system foundation
- Extended role management capabilities

### Changed

- Moved OG image generation from frontend to backend for improved performance and caching
- Enhanced SMTP configuration to properly preserve TLS/SSL settings
- Improved theme CSS injection using design system variables
- Refactored status page settings merge logic to preserve existing configuration
- Optimized asset loading with corrected base URLs
- Enhanced webhook configuration and validation
- Improved mobile responsiveness across all pages
- Migrated entire backend to structured logging using Pino (461 log statements)
- Replaced console statements with structured JSON logging for production log aggregation

### Fixed

- Alert policy configuration and validation issues
- OG template rendering consistency with theme colors
- Workers JSX runtime resolution errors
- Theme color picker border styling
- Theme detection when editing status pages
- Color mode script injection timing
- SMTP email job data validation
- Uptime percentage calculations
- Webhook signing and delivery
- Status page config saving
- Embed designer URL generation
- Checkbox double-toggle behavior
- Asset base URL references
- OG icon loading and event theming
- Status page SEO structure alignment between web and API
- Duplicate PRO_ENTITLEMENTS import in enterprise test file
- PDF report generation stubs with fake data (removed all stub functions)
- Incident notification processor throwing "not implemented" error"

## [0.0.1] - 2026-01-21

### Added

- Initial release of Uni-Status
- Core status monitoring infrastructure
- Docker-based development environment
- Turborepo monorepo setup
- Database integration with Prisma
- API server (Express)
- Web application (React)
- Probe service for health checks
- Worker service for background jobs
- Email notification package
- Shared utilities and validators
