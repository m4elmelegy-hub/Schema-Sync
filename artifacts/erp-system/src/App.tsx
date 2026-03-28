import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { AppSettingsProvider } from "@/contexts/app-settings";
import NotFound from "@/pages/not-found";

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
import SafeTransfers from "@/pages/safe-transfers";
import FinancialTransactions from "@/pages/financial-transactions";
import Tasks from "@/pages/tasks";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();

  if (!user) {
    if (location !== "/login") setLocation("/login");
    return <Login />;
  }
  if (location === "/login") {
    setLocation("/");
    return null;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/sales" component={Sales} />
        <Route path="/purchases" component={Purchases} />
        <Route path="/customers" component={Customers} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/income" component={Income} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/journal-entries" component={JournalEntries} />
        <Route path="/receipt-vouchers" component={ReceiptVouchers} />
        <Route path="/deposit-vouchers" component={DepositVouchers} />
        <Route path="/safe-transfers" component={SafeTransfers} />
        <Route path="/financial-transactions" component={FinancialTransactions} />
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
