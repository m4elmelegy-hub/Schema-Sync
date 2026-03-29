# Workspace

## Overview

Full-stack Arabic ERP System (نظام ERP) for Halal Tech (Egyptian mobile repair shop). Arabic RTL interface with dark glass-morphism UI. Dynamic currency, font, accent color, and company branding — all configurable from Settings without code changes.

### Navigation Pages
Dashboard, Sales (POS + Returns), Purchases (+ Returns), Customers, **الأرباح (Profits)**, Expenses, Income, سندات القبض (Receipt Vouchers), سندات التوريد (Deposit Vouchers), تحويل الخزائن (Safe Transfers), المهام والعمليات (Unified Activity Log), الحركات المالية (Financial Transactions Ledger), Chart of Accounts, Journal Entries, Reports, Settings, **مراجعة المخزون (Inventory Audit)**.

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

### Authentication (Auth)
- Login screen on app startup — uses AppSettings: dynamic company name, slogan, logo, background
- User selects name from dropdown (from `erp_users` table), enters PIN
- AuthContext stores user in localStorage, persists across sessions
- All routes protected — redirects to `/login` if not logged in
- Sidebar and header show current logged-in user + logout button
- Context: `src/contexts/auth.tsx`, Login page: `src/pages/login.tsx`

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
- **transactions**: type (sale/purchase/expense/income/receipt/payment), amount, description, related_id

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
