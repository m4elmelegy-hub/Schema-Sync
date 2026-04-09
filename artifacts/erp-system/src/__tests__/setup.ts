import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  useRoute:    () => [false, {}],
  Link:        ({ children, href }: any) => children,
  Route:       ({ children }: any) => children,
  Switch:      ({ children }: any) => children,
}));

// Mock fetch globally
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem:    vi.fn(),
  setItem:    vi.fn(),
  removeItem: vi.fn(),
  clear:      vi.fn(),
};
Object.defineProperty(global, 'localStorage', {
  value:    localStorageMock,
  writable: true,
});

afterEach(() => {
  vi.clearAllMocks();
});
