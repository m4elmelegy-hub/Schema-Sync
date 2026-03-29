# Workspace

## Overview

Full-stack Arabic ERP System (نظام ERP) for Halal Tech (Egyptian mobile repair shop). Arabic RTL interface with dark glass-morphism UI. Dynamic currency, font, accent color, and company branding — all configurable from Settings without code changes.

### Navigation Pages
Dashboard, Sales (POS + Returns), Purchases (+ Returns), Customers, **الأرباح (Profits)**, Expenses, Income, سندات القبض (Receipt Vouchers), سندات التوريد (Deposit Vouchers), تحويل الخزائن (Safe Transfers), المهام والعمليات (Unified Activity Log), الحركات المالية (Financial Transactions Ledger), Chart of Accounts, Journal Entries, Reports, Settings, **مراجعة المخزون (Inventory Audit)**.

### Opening Balance System (Settings → أول المدة)
4-tab panel in Settings (admin only) for entering all opening balances at system start:
- **Tab 1 — الخزائن**: `POST /api/opening-balance/treasury` — adds to safe balance + inserts transaction with `reference_type='treasury_opening'`
- **Tab 2 — المنتجات**: `POST /api/inventory/opening-balance` — adds stock, recalculates weighted avg cost, blocks duplicate (one entry per product), logs `movement_type='opening_balance'`
- **Tab 3 — العملاء**: `POST /api/opening-balance/customer` — increases customer balance (debt) + logs transaction with `reference_type='customer_opening'`
- **Tab 4 — الموردون**: `POST /api/opening-balance/supplier` — increases supplier balance (owed) + logs transaction with `reference_type='supplier_opening'`
- All GET endpoints: `/api/opening-balance/product|treasury|customer|supplier`
- Each sub-tab shows existing registered entries and a smart searchable form

### Inventory System (`/inventory`)
Full double-entry inventory tracking via `stock_movements` table:
- **Movement Types**: `opening_balance` (+), `purchase` (+), `sale` (−), `sale_return` (+), `purchase_return` (−), `adjustment` (±)
- **Quantity sign convention**: positive = IN (وارد), negative = OUT (صادر)
- **Formula**: `current_qty = opening + purchases + sale_returns − sales − purchase_returns + adjustments`
- **Discrepancy check**: `calculated_qty` from movements vs `actual_qty` from `products.quantity` — must equal 0
- **APIs**:
  - `GET /api/inventory/audit` — full report for all products with movement breakdown
  - `GET /api/inventory/product/:id` — single product with full movement log + formula proof
  - `POST /api/inventory/adjustment` — manual stock adjustment with automatic movement record
- **Auto-seeding**: existing products seeded with opening_balance on schema push
- **Frontend**: summary cards, sortable audit table, movements history modal per product, manual adjustment modal

### Profit Calculation Engine (Weighted Average Cost)
- **متوسط التكلفة المرجّح**: Every purchase updates `products.cost_price` using:  
  `new_avg = (old_qty × old_cost + new_qty × new_price) / (old_qty + new_qty)`  
- **تكلفة وقت البيع**: `sale_items.cost_price` and `sale_items.cost_total` store the weighted average cost at the moment of sale — enabling accurate historical profit reports  
- **صفحة الأرباح** (`/profits`): Date-range filtered profit report showing:  
  - إجمالي الإيرادات، التكلفة، الربح الإجمالي، هامش الربح، المصاريف، صافي الربح  
  - جدول الأصناف: ربح كل صنف + هامشه + متوسط تكلفته + متوسط سعر بيعه  
  - رسم بياني شهري بشريطين (إيرادات / أرباح)  
  - اختصارات سريعة: هذا الشهر / آخر 7 أيام / آخر 30 يوم / هذا العام / الكل  
- **API**: `GET /api/profits?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`

### App-Wide Settings Context (`src/contexts/app-settings.tsx`)
- `AppSettingsProvider` wraps entire app; reads/writes `halal_erp_settings` from localStorage
- **Currency**: EGP/SAR/AED/USD/KWD/BHD — `formatCurrency()` in `lib/format.ts` reads from localStorage dynamically
- **Font**: Tajawal/Cairo/Almarai/Changa — loaded via Google Fonts link injection + CSS variable `--erp-font`
- **Accent color**: 6 palettes (amber/emerald/violet/sky/rose/orange) — applied to CSS `--primary` and `--ring` custom props
- **Company branding**: name + slogan + custom logo (base64 in localStorage)
- **Login background**: 5 gradient presets

### Settings Page (7 Tabs)
- **المستخدمون**: CRUD for users with roles + permissions checkboxes
- **الخزائن**: Add/delete safes + inter-safe transfers
- **المخازن**: Add/delete warehouse locations
- **الواجهة**: Font picker, accent color grid, logo upload (500 KB limit), login background selector, company name/slogan
- **العملة**: Live currency card grid with preview of formatted numbers
- **الأصناف**: Excel export (XLSX) of all products + bulk import from xlsx/xls/csv + template download
- **البيانات**: Granular table-level clearing (10 tables) + full database reset
- API endpoint: `POST /api/admin/clear { tables: string[] }` — clears any subset of tables

### Authentication & RBAC (Role-Based Access Control)
- Login screen on app startup — uses AppSettings: dynamic company name, slogan, logo, background
- User selects name from dropdown (from `GET /api/auth/users` — returns `pinLength`, NOT raw PIN), enters PIN
- Server validates PIN via `POST /api/auth/login` — returns signed JWT (HS256, secret via `JWT_SECRET` env var)
- JWT stored in localStorage under `erp_auth_token`; `setAuthTokenGetter` in `main.tsx` makes every API mutation send `Authorization: Bearer <token>`
- Roles: `admin`, `manager`, `cashier`, `salesperson` — defined in `src/lib/rbac.ts`
- `ROUTE_ROLES` map controls which roles can access each page; `canAccess(role, path)` used in Guard + nav filtering
- `Guard` component in `App.tsx` checks role before rendering any route — redirects to `/access-denied` if unauthorized
- Sidebar nav filtered dynamically by role via `canAccess` — unauthorized items hidden
- Admin-only backend routes protected with `authenticate + requireRole("admin")` middleware
- Self-escalation prevention (can't promote yourself) and self-delete prevention enforced on backend
- Context: `src/contexts/auth.tsx`, Login page: `src/pages/login.tsx`, RBAC: `src/lib/rbac.ts`

### POS Enhancements (sales.tsx NewSalePanel)
- Warehouse #1 auto-selected on mount via `useEffect`
- Salesperson auto-set to logged-in user (read-only, can't be changed)
- Professional invoice print opens in new window with company header, table, totals

### Financial Transaction Engine
Every money movement uses `db.transaction()` atomically:
1. Atomic safe balance updates (never partial updates)
2. Central `transactions` ledger recording every operation (type, safe_id, direction, reference_type, reference_id, date)
3. Supported transaction types: sale_cash/credit/partial, expense, income, receipt_voucher, deposit_voucher, transfer_in/out, voucher_receipt/payment
4. New tables: `receipt_vouchers` (سند قبض), `deposit_vouchers` (سند توريد)
5. Safe transfers recorded in transactions table with reference_type="safe_transfer"

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, Tailwind CSS, Framer Motion, Recharts, Lucide icons

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (all ERP routes)
│   └── erp-system/         # React Arabic RTL frontend
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── products.ts
│           ├── customers.ts
│           ├── suppliers.ts
│           ├── sales.ts        (salesTable + saleItemsTable)
│           ├── purchases.ts    (purchasesTable + purchaseItemsTable)
│           ├── expenses.ts
│           ├── income.ts
│           └── transactions.ts
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## ERP System Features

### Database Tables
- **products**: name, sku, category, quantity, cost_price, sale_price, low_stock_threshold
- **customers**: name, phone, balance (auto-calculated debt)
- **suppliers**: name, phone, balance (auto-calculated debt)
- **sales**: invoice_no, customer_name, customer_id, payment_type (cash/credit/partial), total_amount, paid_amount, remaining_amount, status (paid/partial/unpaid), notes
- **sale_items**: sale_id, product_id, product_name, quantity, unit_price, total_price
- **purchases**: same as sales but for suppliers
- **purchase_items**: same as sale_items but for purchases
- **expenses**: category, amount, description
- **income**: source, amount, description
- **transactions**: type (sale/purchase/expense/income/receipt/payment), amount, description, reference_type, reference_id, safe_id, customer_id, direction, date

### Code Quality
- All route handlers use `wrap()` from `lib/async-handler` — errors bubble to Express error middleware
- All validation errors use `httpError(status, message)` — never raw `try/catch` in route handlers
- `inventory.ts` raw SQL results typed via `AuditRow` interface — no `any[]` casts
- All React Query `queryFn`s check `r.ok` before calling `.json()` — throw on non-2xx
- `useFirstSafeId` hook includes `safeId` in `useEffect` dependency array — no missing-dep warnings

### Database Health (completed cleanup)
- **Removed `transactions.related_id`**: deprecated duplicate of `reference_id` (was always set = reference_id, never queried distinctly). Removed from schema + all 12 INSERT call-sites across routes.
- **Removed `purchases.customer_payment_type`**: unused duplicate of `payment_type` (written once, never read). Removed from schema + purchases route.
- **21 performance indexes added**: covering all FK columns and high-frequency filter/order columns across every table (transactions, sales, purchases, expenses, income, vouchers, returns, stock_movements, safes, accounts, journal entries, etc.).
- **11 FK constraints enforced**: `sale_items→sales`, `sale_items→products`, `purchase_items→purchases`, `purchase_items→products`, `sale_return_items→sales_returns`, `sale_return_items→products`, `purchase_return_items→purchase_returns`, `purchase_return_items→products`, `journal_entry_lines→journal_entries`, `journal_entry_lines→accounts`, `stock_movements→products`.
- Zero orphan records confirmed before adding constraints.

### API Routes
- `GET/POST /api/products`, `PUT/DELETE /api/products/:id`
- `GET/POST /api/customers`, `PUT/DELETE /api/customers/:id`, `POST /api/customers/:id/receipt`
- `GET/POST /api/suppliers`, `PUT/DELETE /api/suppliers/:id`, `POST /api/suppliers/:id/payment`
- `GET/POST /api/sales`, `GET /api/sales/:id`
- `GET/POST /api/purchases`, `GET /api/purchases/:id`
- `GET/POST /api/expenses`, `DELETE /api/expenses/:id`
- `GET/POST /api/income`, `DELETE /api/income/:id`
- `GET /api/transactions`
- `GET /api/dashboard/stats`

### Frontend Pages
- Dashboard (لوحة القيادة) - stats, charts, low stock alerts
- POS (نقطة البيع) - cart system with cash/credit/partial payment
- Products (المنتجات) - CRUD with low stock threshold
- Sales (المبيعات) - invoice list with status badges
- Purchases (المشتريات) - purchase orders
- Customers (العملاء) - with debt tracking + receipt vouchers
- Suppliers (الموردون) - with debt tracking + payment vouchers
- Expenses (المصروفات)
- Income (الإيرادات)
- Reports (التقارير) - profit calculations

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes in `src/routes/` use `@workspace/api-zod` for validation and `@workspace/db` for persistence.

### `artifacts/erp-system` (`@workspace/erp-system`)

React + Vite Arabic RTL frontend. Uses `@workspace/api-client-react` for React Query hooks.

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM. Push schema: `pnpm --filter @workspace/db run push`

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI spec + Orval codegen. Run: `pnpm --filter @workspace/api-spec run codegen`

## UX Design System (`artifacts/erp-system/src/index.css`)

Global CSS classes for consistent premium UX across all pages:

| Class | Purpose |
|---|---|
| `erp-table-row` | Table row hover highlight + amber border accent |
| `btn-icon` | Base 32×32 icon button |
| `btn-icon-danger/primary/info/green` | Colored icon button variants with scale hover |
| `modal-overlay` | Fade-in animation for modal backdrops |
| `modal-panel` | Spring-pop animation for modal inner panels |
| `slide-down` | Slide-in for collapsible form sections |
| `skeleton-shimmer` | Shimmer loading skeleton animation |
| `interactive-card` | Lift + glow on hover for stat cards |
| `status-badge` | Pill badge base |
| `status-paid/unpaid/partial` | Payment status color tokens |
| `value-appear` | Count-up animation for numeric values |
| `glass-input:focus-visible` | Amber glow ring on focused inputs |

## Skeleton Components (`src/components/skeletons.tsx`)

- `TableSkeleton({ cols, rows })` — shimmer rows for any table
- `CardSkeleton({ count })` — shimmer stat card grid
- `StatCardSkeleton()` — single stat card skeleton

All pages use `<TableSkeleton />` instead of plain "جاري التحميل..." text rows.
