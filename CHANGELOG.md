# Changelog

All notable changes to Uni-Status will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
