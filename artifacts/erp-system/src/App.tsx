import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { AppSettingsProvider } from "@/contexts/app-settings";
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
const FinancialTransactions = lazy(() => import("@/pages/financial-transactions"));
const Tasks                = lazy(() => import("@/pages/tasks"));
const Profits              = lazy(() => import("@/pages/profits"));
const Products             = lazy(() => import("@/pages/products"));
const Inventory            = lazy(() => import("@/pages/inventory"));
const Suppliers            = lazy(() => import("@/pages/suppliers"));

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
    return <Redirect to="/" />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/">
          {() => <Suspense fallback={<PageFallback />}><Dashboard /></Suspense>}
        </Route>
        <Route path="/sales">{() => <Guard path="/sales" component={Sales} />}</Route>
        <Route path="/purchases">{() => <Guard path="/purchases" component={Purchases} />}</Route>
        <Route path="/suppliers">{() => <Guard path="/suppliers" component={Suppliers} />}</Route>
        <Route path="/products">{() => <Guard path="/products" component={Products} />}</Route>
        <Route path="/inventory">{() => <Guard path="/inventory" component={Inventory} />}</Route>
        <Route path="/customers">{() => <Guard path="/customers" component={Customers} />}</Route>
        <Route path="/expenses">{() => <Guard path="/expenses" component={Expenses} />}</Route>
        <Route path="/income">{() => <Guard path="/income" component={Income} />}</Route>
        <Route path="/tasks">
          {() => <Suspense fallback={<PageFallback />}><Tasks /></Suspense>}
        </Route>
        <Route path="/profits">{() => <Guard path="/profits" component={Profits} />}</Route>
        <Route path="/reports">{() => <Guard path="/reports" component={Reports} />}</Route>
        <Route path="/settings">{() => <Guard path="/settings" component={Settings} />}</Route>
        <Route path="/accounts">{() => <Guard path="/accounts" component={Accounts} />}</Route>
        <Route path="/journal-entries">{() => <Guard path="/journal-entries" component={JournalEntries} />}</Route>
        <Route path="/receipt-vouchers">{() => <Guard path="/receipt-vouchers" component={ReceiptVouchers} />}</Route>
        <Route path="/deposit-vouchers">{() => <Guard path="/deposit-vouchers" component={DepositVouchers} />}</Route>
        <Route path="/payment-vouchers">{() => <Guard path="/payment-vouchers" component={PaymentVouchers} />}</Route>
        <Route path="/safe-transfers">{() => <Guard path="/safe-transfers" component={SafeTransfers} />}</Route>
        <Route path="/financial-transactions">{() => <Guard path="/financial-transactions" component={FinancialTransactions} />}</Route>
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
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </AppSettingsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
