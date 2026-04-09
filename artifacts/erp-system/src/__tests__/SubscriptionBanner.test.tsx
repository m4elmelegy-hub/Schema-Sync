import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionBanner } from '../components/subscription-banner';

// Mock the auth context
vi.mock('@/contexts/auth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/contexts/auth';

function makeFetchResponse(body: object) {
  return Promise.resolve({
    ok:   true,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.mocked(localStorage.getItem).mockReturnValue('fake-token');
  vi.mocked(global.fetch as any).mockImplementation((url: string) => {
    if (url.includes('/api/settings/system')) {
      return makeFetchResponse({ support_whatsapp: '', support_email: '' });
    }
    return makeFetchResponse({
      days_left:        5,
      is_expiring_soon: true,
      is_active:        true,
      unlimited:        false,
      company_name:     'شركة الاختبار',
    });
  });
});

describe('SubscriptionBanner', () => {
  it('لا يظهر للـ super_admin', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { role: 'super_admin' } } as any);
    const { container } = render(<SubscriptionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('يظهر warning للأيام من 1-7', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1, role: 'company_admin' } } as any);
    vi.mocked(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/settings/system')) {
        return makeFetchResponse({ support_whatsapp: '', support_email: '' });
      }
      return makeFetchResponse({
        days_left:        5,
        is_expiring_soon: true,
        is_active:        true,
        unlimited:        false,
        company_name:     'شركة الاختبار',
      });
    });

    render(<SubscriptionBanner />);
    await waitFor(() => {
      expect(screen.getByText(/ينتهي اشتراك/)).toBeInTheDocument();
    });
  });

  it('يظهر notice للأيام من 8-14', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1, role: 'company_admin' } } as any);
    vi.mocked(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/settings/system')) {
        return makeFetchResponse({ support_whatsapp: '', support_email: '' });
      }
      return makeFetchResponse({
        days_left:        10,
        is_expiring_soon: true,
        is_active:        true,
        unlimited:        false,
        company_name:     'شركة الاختبار',
      });
    });

    render(<SubscriptionBanner />);
    await waitFor(() => {
      expect(screen.getByText(/ينتهي اشتراك/)).toBeInTheDocument();
    });
  });

  it('لا يظهر إذا كانت الأيام أكثر من 14', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1, role: 'company_admin' } } as any);
    vi.mocked(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/settings/system')) {
        return makeFetchResponse({ support_whatsapp: '', support_email: '' });
      }
      return makeFetchResponse({
        days_left:        30,
        is_expiring_soon: false,
        is_active:        true,
        unlimited:        false,
        company_name:     'شركة الاختبار',
      });
    });

    const { container } = render(<SubscriptionBanner />);
    // Wait a tick for any async state, then assert still null
    await new Promise((r) => setTimeout(r, 50));
    expect(container.firstChild).toBeNull();
  });
});
