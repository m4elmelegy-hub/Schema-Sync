import { afterEach, vi } from 'vitest';

// Set env vars before any module imports read them
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Mock pino-http so it doesn't try to use the real pino logger API
vi.mock('pino-http', () => ({
  default: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// Mock the logger so it doesn't print during tests
vi.mock('../lib/logger', () => ({
  logger: {
    info:  vi.fn(),
    error: vi.fn(),
    warn:  vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// Mock backup scheduler
vi.mock('../lib/db-backup', () => ({
  startBackupScheduler:  vi.fn(),
  createDatabaseBackup:  vi.fn().mockResolvedValue('/tmp/test-backup.sql.gz'),
}));

// Mock system monitor
vi.mock('../lib/monitor', () => ({
  startMonitoring: vi.fn(),
  checkHealth: vi.fn().mockResolvedValue({
    status:       'healthy',
    db:           true,
    memory_mb:    50,
    uptime_hours: 1,
    last_check:   new Date().toISOString(),
  }),
}));

beforeAll(() => {
  // env vars already set above at module level
});

afterEach(() => {
  vi.clearAllMocks();
});
