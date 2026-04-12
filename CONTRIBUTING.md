# Contributing to Schema-Sync

## Development Setup

### Prerequisites
- Node.js 20+
- pnpm 9+
- PostgreSQL 15+

### Installation
\\\ash
git clone https://github.com/m4elmelegy-hub/Schema-Sync.git
cd Schema-Sync
pnpm install
cp .env.example .env
pnpm run db:migrate
\\\

## Code Standards
- TypeScript strict mode
- ESLint + Prettier
- Conventional commits
- 75% test coverage minimum

## Commit Format
\\\
feat(scope): description
fix(scope): description
docs: description
\\\

## Testing
\\\ash
pnpm run test:all
pnpm run lint
\\\

Thank you for contributing! 🚀
