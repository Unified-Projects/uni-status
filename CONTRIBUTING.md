# Contributing to Uni-Status

Thank you for your interest in contributing to Uni-Status! This document outlines the process for contributing to this project.

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker and Docker Compose

### Development Setup

This project uses Docker for local development with hot-reload support. The docker-compose.yml mounts your local codebase into the containers, so changes to the source code are reflected immediately.

1. Fork the repository from `dev/main` branch
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Uni-Status.git
   cd Uni-Status
   ```
3. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
4. Start the development environment:
   ```bash
   docker compose up -d
   ```
5. The services will be available at:
   - Web: http://localhost
   - API: http://localhost/api
   - Bull Board (job queue dashboard): http://localhost:3002
   - Mailhog (email testing): http://localhost:8025

Changes made to files in `apps/*/src` and `packages/*` will be automatically reflected.

## Pull Request Process

1. Create a new branch from `dev/main` for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and ensure all tests pass:
   ```bash
   pnpm test
   ```

3. Run linting and type checks:
   ```bash
   pnpm lint
   pnpm type-check
   ```

4. Format your code:
   ```bash
   pnpm format
   ```

5. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Open a Pull Request against the `dev/main` branch

7. Ensure your PR description clearly describes the problem and solution

## Reporting Issues

When reporting issues, please include:

- A clear description of the problem
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Any relevant error messages or logs
- Environment details (OS, Node version, etc.)

## License Agreement

By contributing to Uni-Status, you agree that your contributions will be licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

Contributions must be your original work or you must have the right to submit it under this license.

## Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.
