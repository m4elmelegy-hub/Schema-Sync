import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { AppSettingsProvider } from "@/contexts/app-settings";
import { canAccess, type UserRole } from "@/lib/rbac";
import NotFound from "@/pages/not-found";
import AccessDenied from "@/pages/access-denied";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Sales from "@/pages/sales";
import Purchases from "@/pages/purchases";
import Customers from "@/pages/customers";
import Expenses from "@/pages/expenses";
import Income from "@/pages/income";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import Accounts from "@/pages/accounts";
import JournalEntries from "@/pages/journal-entries";
import ReceiptVouchers from "@/pages/receipt-vouchers";
import DepositVouchers from "@/pages/deposit-vouchers";
import PaymentVouchers from "@/pages/payment-vouchers";
import SafeTransfers from "@/pages/safe-transfers";
import FinancialTransactions from "@/pages/financial-transactions";
import Tasks from "@/pages/tasks";
import Profits from "@/pages/profits";
import Products from "@/pages/products";
import Inventory from "@/pages/inventory";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Guard({ path, component: Component }: { path: string; component: React.ComponentType }) {
  const { user } = useAuth();
  const role = (user?.role ?? "cashier") as UserRole;
  if (!canAccess(role, path)) return <AccessDenied />;
  return <Component />;
}

function Router() {
  const { user } = useAuth();
  const [location] = useLocation();

  if (!user) {
    return location === "/login" ? <Login /> : <Redirect to="/login" />;
  }
  if (location === "/login") {
    return <Redirect to="/" />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/sales">{() => <Guard path="/sales" component={Sales} />}</Route>
        <Route path="/purchases">{() => <Guard path="/purchases" component={Purchases} />}</Route>
        <Route path="/products">{() => <Guard path="/products" component={Products} />}</Route>
        <Route path="/inventory">{() => <Guard path="/inventory" component={Inventory} />}</Route>
        <Route path="/customers">{() => <Guard path="/customers" component={Customers} />}</Route>
        <Route path="/expenses">{() => <Guard path="/expenses" component={Expenses} />}</Route>
        <Route path="/income">{() => <Guard path="/income" component={Income} />}</Route>
        <Route path="/tasks" component={Tasks} />
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
