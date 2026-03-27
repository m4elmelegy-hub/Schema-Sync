# Workspace

## Overview

Full-stack Arabic ERP System (نظام ERP) for Halal Tech (Egyptian mobile repair shop). Arabic RTL interface with dark glass-morphism UI, EGP currency, amber theme. Navigation: Dashboard, Sales (POS), Purchases (product management + customer linking), Customers, Expenses, Income, Reports, Settings.

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
