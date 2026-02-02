# Changelog

All notable changes to Uni-Status will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
