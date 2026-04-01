# Workspace

## Overview
This project is a full-stack Arabic ERP System (نظام ERP) designed for Halal Tech, an Egyptian mobile repair shop. Its primary purpose is to provide a comprehensive management solution with an Arabic RTL interface and a dark glass-morphism UI. Key capabilities include dynamic currency, font, accent color, and company branding, all configurable from the Settings without requiring code changes. The system covers essential business functions such as sales (POS), purchases, inventory management, financial transactions, and reporting.

The system aims to streamline operations, provide accurate financial tracking, and offer robust reporting for businesses, particularly focusing on the specific needs of the Halal Tech repair shop. It provides a complete overview of business operations, from inventory and sales to detailed profit analysis and financial auditing.

## User Preferences
I prefer iterative development with a focus on core features first. I value clear, detailed explanations for complex architectural decisions and new functionalities. Please ask before implementing any major changes or refactoring large portions of the codebase. I expect the agent to prioritize fixing critical bugs and stabilizing existing features before developing new ones. I prefer a communication style that is direct and technical, but also open to discussing alternative approaches.

## System Architecture

The system is built as a monorepo using pnpm workspaces. The architecture separates the API server (`api-server`) from the frontend application (`erp-system`) and defines shared libraries for the database (`db`), API specification (`api-spec`), and generated clients.

**UI/UX Decisions:**
- **Language & Direction:** Arabic RTL interface.
- **Theme:** Dark glass-morphism UI.
- **Customization:** Dynamic currency (EGP/SAR/AED/USD/KWD/BHD), font (Tajawal/Cairo/Almarai/Changa), accent color (6 palettes), company branding (name, slogan, logo), and login background presets are configurable via `AppSettingsProvider` and stored in `localStorage`.
- **Component Design:** Global CSS classes (`erp-table-row`, `btn-icon`, `modal-overlay`, `status-badge`, `glass-input:focus-visible`, etc.) ensure a consistent and premium user experience. Skeleton components (`TableSkeleton`, `CardSkeleton`) provide better loading feedback.

**Technical Implementations:**
- **Authentication & RBAC:** Features a login screen with dynamic branding, JWT-based authentication (HS256), and Role-Based Access Control (RBAC). Roles include `admin`, `manager`, `cashier`, `salesperson`. `Guard` component enforces access control at the route level, and backend routes are protected with middleware.
- **Inventory System:** Implements a double-entry inventory tracking system via `stock_movements` table, supporting various movement types (`opening_balance`, `purchase`, `sale`, `sale_return`, `purchase_return`, `adjustment`). It calculates `current_qty` and checks for discrepancies.
- **Profit Calculation Engine:** Uses a weighted average cost method (`متوسط التكلفة المرجّح`) to update product `cost_price` and store `cost_price` at the moment of sale for accurate historical profit reporting. The `/profits` page displays detailed profit reports, including gross/net profit, margins, and monthly charts.
- **Financial Transaction Engine:** Ensures atomic money movements using `db.transaction()`. All operations are recorded in a central `transactions` ledger with detailed information (type, safe_id, direction, reference_type, reference_id, date).
- **Opening Balance System:** A 4-tab panel in Settings (admin only) allows entering opening balances for treasuries, products, customers, and suppliers, with corresponding API endpoints.
- **Auto-Accounting Link:** `artifacts/api-server/src/lib/auto-account.ts` provides helpers that automatically create linked ledger accounts when customers/suppliers are created. Customer accounts use code `AR-{customer_code}` (type: asset); supplier accounts use `AP-{supplier_code}` (type: liability); safe accounts use `SAFE-{safe_id}`. Receipt vouchers auto-post journal entries (DR Safe / CR Customer). Payment vouchers auto-post (DR Supplier / CR Safe). The `account_id` FK is stored directly on the `customers` and `suppliers` tables. A backfill endpoint `POST /api/admin/backfill-accounts` exists to link existing records.
- **Settings Page:** Comprehensive settings panel with tabs for managing users, safes, warehouses, UI customization, currency, product import/export, and granular database clearing.
- **Monorepo Structure:** Organizes the project into `artifacts` (api-server, erp-system) and `lib` (api-spec, api-client-react, api-zod, db) for better modularity and code generation.
- **Database Schema:** Uses Drizzle ORM to define tables for `products`, `customers`, `suppliers`, `sales`, `purchases`, `expenses`, `income`, and `transactions`, with enforced FK constraints and performance indexes.

**Feature Specifications:**
- **Navigation Pages:** Dashboard, Sales (POS + Returns), Purchases (+ Returns), Customers, Profits, Expenses, Income, Receipt Vouchers, Deposit Vouchers, Safe Transfers, Unified Activity Log, Financial Transactions Ledger, Chart of Accounts, Journal Entries, Reports, Settings, Inventory Audit.
- **Reports Page (4 tabs):**
  1. **الأرباح والخسائر** — P&L with date filter pills (اليوم/أسبوع/شهر/سنة/مخصص), 4 KPI cards, accounting-format P&L statement, Recharts bar chart (P&L breakdown) + line chart (by-month trend), top-5 products by profit, PDF export.
  2. **تقرير المخزن** — Inventory table with low-stock/out-of-stock alerts, category filter pills, 4 summary cards. Clicking any product row opens a slide-in product detail drawer showing movement history (via `/api/inventory/product/:id`).
  3. **فواتير المشتريات** — Purchases table with search, payment-type filter, per-row PDF invoice button (fetches `/api/purchases/:id`), bulk Excel + PDF export.
  4. **فواتير المبيعات** — Sales table with search, payment-type filter, per-row PDF invoice button (fetches `/api/sales/:id`), bulk Excel + PDF export.
- **export-pdf.ts** — Added `printSaleInvoice()`, `printPurchaseInvoice()`, and `printPLReport()` functions using browser print-window approach for correct Arabic RTL rendering.
- **POS Enhancements:** Auto-selection of warehouse, salesperson auto-set to logged-in user, and professional invoice printing.

## Customer/Supplier Coding System (April 2026)

- **Auto-Generated Codes:** Customers get sequential codes starting at **1001**, suppliers start at **2001**. New codes auto-increment from the current max.
- **Normalized Name Deduplication:** On create and update, names are normalized (trimmed, whitespace collapsed, Arabic diacritics unified: أإآ→ا, ة→ه, ى→ي) and compared against the `normalized_name` column — the backend returns a clear Arabic error if a duplicate is detected.
- **DB Schema:** `customer_code INTEGER UNIQUE` and `normalized_name TEXT` added to `customersTable`; `supplier_code INTEGER UNIQUE` and `normalized_name TEXT` added to `suppliersTable`. Existing records backfilled.
- **Zod Schemas Updated:** `GetCustomersResponseItem`, `UpdateCustomerResponse`, `GetSuppliersResponseItem`, `UpdateSupplierResponse` all expose the new code fields.
- **Customers Page:** Added "الكود" column showing amber-tinted code badge; search now also matches by code number.
- **Suppliers Page:** Added "الكود" column showing violet-tinted code badge; search now also matches by code number.
- **All Dropdowns Updated:** Customer dropdowns in Sales, Sales Returns, Receipt Vouchers, Payment Vouchers, and Supplier dropdowns in Purchases all show `[CODE]` prefix before the name for quick identification.

## Posting Control System (April 2026)

All financial documents (sales, purchases, deposit vouchers, payment vouchers, receipt vouchers) now follow a strict 3-state lifecycle controlled by the user — no automatic journal entries on create.

**States:** `draft` → `posted` → `cancelled`
- **draft**: Record saved, customer/supplier balances updated (AR/AP), inventory moved. No journal entry created yet.
- **posted**: User explicitly posts the record. A journal entry (JE) is created at this moment and the record is locked (cannot be edited/deleted).
- **cancelled**: Only available for posted records. A reverse JE is created to negate the original. Record is permanently locked.
- **DELETE**: Only allowed on `draft` records.

**Backend Changes:**
- `posting_status TEXT NOT NULL DEFAULT 'draft'` column added to all voucher tables via raw SQL migration.
- Auto-JE creation removed from all `POST /api/...` (create) endpoints.
- `/post` and `/cancel` endpoints added to: `sales.ts`, `purchases.ts`, `deposit-vouchers.ts`, `payment-vouchers.ts`, `receipt-vouchers.ts`.
- `buildXxxJournalLines()` helper extracted in each route for reuse by both `/post` and `/cancel`.

**Frontend Changes:**
- `PostingBadge` / `SalesPostingBadge` component shows مسودة / مرحَّل / ملغى colored chips.
- Post button (✅ CheckCircle) visible on draft records; Cancel button (XCircle) visible on posted records.
- History panels with post/cancel UI added to: `deposit-vouchers.tsx`, `payment-vouchers.tsx`, `purchases.tsx` (via "سجل الفواتير" tab), `sales.tsx` (via "سجل الفواتير" tab).

## Security & Performance Improvements (March 2026)

- **TypeScript**: Built `lib/db` and `lib/api-zod` declaration files — 0 TypeScript errors across entire codebase
- **Helmet.js**: Added security headers (X-Frame-Options: DENY, noSniff, HSTS, CSP) to all API responses
- **Rate Limiting**: General 100 req/min per IP; Auth endpoints limited to 10 req/min per IP
- **Login Lockout**: Max 5 failed PIN attempts → 15-minute account lockout (in-memory per userId)
- **JWT_SECRET**: Moved to environment variable (no hardcoded fallback in production)
- **CORS**: Configurable via `ALLOWED_ORIGINS` env var; safe for Replit proxy (trust proxy: 1)
- **PIN Masking**: Admin `/settings/users` endpoint returns `****` instead of raw PIN
- **Light Mode CSS**: Added CSS custom properties for light mode, smooth theme transitions (250ms), typography improvements (Cairo font, tabular numbers, readable contrast)
- **React.lazy**: All pages are now lazy-loaded with Suspense — reduces initial bundle size
- **staleTime**: TanStack Query globally set to 30 seconds — reduces redundant API calls

## External Dependencies

- **Node.js**: Version 24
- **Package Manager**: pnpm
- **TypeScript**: Version 5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build Tool**: esbuild (CJS bundle)
- **Frontend Framework**: React
- **Bundler**: Vite
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Charting**: Recharts
- **Icons**: Lucide icons
- **Fonts**: Google Fonts
- **Data Export/Import**: XLSX (for product export/import)