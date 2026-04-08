import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { AppSettingsProvider } from "@/contexts/app-settings";
import { WarehouseProvider } from "@/contexts/warehouse";
import { canAccess, type UserRole } from "@/lib/rbac";
import { Spinner } from "@/components/ui/spinner";
import NotFound from "@/pages/not-found";
import AccessDenied from "@/pages/access-denied";

/* ── Lazy-loaded pages ─────────────────────────────────── */
const Login                = lazy(() => import("@/pages/login"));
const Dashboard            = lazy(() => import("@/pages/dashboard"));
const Sales                = lazy(() => import("@/pages/sales"));
const Purchases            = lazy(() => import("@/pages/purchases"));
const Customers            = lazy(() => import("@/pages/customers"));
const Expenses             = lazy(() => import("@/pages/expenses"));
const Income               = lazy(() => import("@/pages/income"));
const Reports              = lazy(() => import("@/pages/reports"));
const Settings             = lazy(() => import("@/pages/settings"));
const Accounts             = lazy(() => import("@/pages/accounts"));
const JournalEntries       = lazy(() => import("@/pages/journal-entries"));
const ReceiptVouchers      = lazy(() => import("@/pages/receipt-vouchers"));
const DepositVouchers      = lazy(() => import("@/pages/deposit-vouchers"));
const PaymentVouchers      = lazy(() => import("@/pages/payment-vouchers"));
const SafeTransfers        = lazy(() => import("@/pages/safe-transfers"));
const Treasury             = lazy(() => import("@/pages/treasury"));
const Products             = lazy(() => import("@/pages/products"));
const Inventory            = lazy(() => import("@/pages/inventory"));
const Vouchers             = lazy(() => import("@/pages/vouchers"));
const POS                  = lazy(() => import("@/pages/pos"));
const SuperAdmin           = lazy(() => import("@/pages/super-admin"));

/* ── QueryClient with staleTime for performance ─────────── */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000, // 30 seconds
    },
  },
});

/* ── Page suspense wrapper ───────────────────────────────── */
function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner className="w-8 h-8 text-amber-500" />
    </div>
  );
}

function Guard({ path, component: Component }: { path: string; component: React.ComponentType }) {
  const { user } = useAuth();
  const role = (user?.role ?? "cashier") as UserRole;
  if (!canAccess(role, path)) return <AccessDenied />;
  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  );
}

function Router() {
  const { user } = useAuth();
  const [location] = useLocation();

  if (!user) {
    return location === "/login"
      ? <Suspense fallback={<PageFallback />}><Login /></Suspense>
      : <Redirect to="/login" />;
  }
  if (location === "/login") {
    return user.role === "super_admin" ? <Redirect to="/super-admin" /> : <Redirect to="/" />;
  }

  /* ── Super admin: isolated full-screen panel ─────────── */
  if (user.role === "super_admin") {
    return (
      <Suspense fallback={<PageFallback />}>
        <SuperAdmin />
      </Suspense>
    );
  }

  /* ── POS: full-screen standalone (no sidebar / layout) ── */
  if (location === "/pos") {
    const posRole = (user?.role ?? "cashier") as UserRole;
    if (!canAccess(posRole, "/pos")) return <AccessDenied />;
    return (
      <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center" style={{ background: "hsl(225,28%,4%)" }}><Spinner className="w-8 h-8 text-amber-500" /></div>}>
        <POS />
      </Suspense>
    );
  }

  return (
    <AppLayout>
      <SubscriptionBanner />
      <Switch>
        <Route path="/">
          {() => <Suspense fallback={<PageFallback />}><Dashboard /></Suspense>}
        </Route>
        <Route path="/sales">{() => <Guard path="/sales" component={Sales} />}</Route>
        <Route path="/purchases">{() => <Guard path="/purchases" component={Purchases} />}</Route>
        <Route path="/suppliers">{() => <Redirect to="/customers" />}</Route>
        <Route path="/products">{() => <Guard path="/products" component={Products} />}</Route>
        <Route path="/inventory">{() => <Guard path="/inventory" component={Inventory} />}</Route>
        <Route path="/customers">{() => <Guard path="/customers" component={Customers} />}</Route>
        <Route path="/expenses">{() => <Guard path="/expenses" component={Expenses} />}</Route>
        <Route path="/income">{() => <Guard path="/income" component={Income} />}</Route>
        <Route path="/treasury">{() => <Guard path="/treasury" component={Treasury} />}</Route>
        <Route path="/tasks">{() => <Redirect to="/treasury" />}</Route>
        <Route path="/profits">{() => <Redirect to="/reports" />}</Route>
        <Route path="/reports">{() => <Guard path="/reports" component={Reports} />}</Route>
        <Route path="/settings">{() => <Guard path="/settings" component={Settings} />}</Route>
        <Route path="/accounts">{() => <Guard path="/accounts" component={Accounts} />}</Route>
        <Route path="/journal-entries">{() => <Guard path="/journal-entries" component={JournalEntries} />}</Route>
        <Route path="/vouchers">{() => <Guard path="/vouchers" component={Vouchers} />}</Route>
        <Route path="/receipt-vouchers">{() => <Redirect to="/vouchers" />}</Route>
        <Route path="/deposit-vouchers">{() => <Redirect to="/vouchers" />}</Route>
        <Route path="/payment-vouchers">{() => <Redirect to="/vouchers" />}</Route>
        <Route path="/safe-transfers">{() => <Redirect to="/vouchers" />}</Route>
        <Route path="/financial-transactions">{() => <Redirect to="/reports" />}</Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppSettingsProvider>
          <WarehouseProvider>
            <AuthProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </AuthProvider>
          </WarehouseProvider>
        </AppSettingsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
