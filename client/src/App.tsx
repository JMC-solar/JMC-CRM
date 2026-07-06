import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmRoot } from "@/lib/confirm";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Contacts from "./pages/Contacts";
import Accounts from "./pages/Accounts";
import Opportunities from "./pages/Opportunities";
import Activities from "./pages/Activities";
import Inventory from "./pages/Inventory";
import StockTransactions from "./pages/StockTransactions";
import PurchaseOrders from "./pages/PurchaseOrders";
import PurchaseOrderCreate from "./pages/PurchaseOrderCreate";
import PurchaseOrderDetail from "./pages/PurchaseOrderDetail";
import BomPackages from "./pages/BomPackages";
import Quotations from "./pages/Quotations";
import Analytics from "./pages/Analytics";
import UserManagement from "./pages/UserManagement";
import Suppliers from "./pages/Suppliers";
import Settings from "./pages/Settings";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import NetMetering from "./pages/NetMetering";
import StockAdjustments from "./pages/StockAdjustments";
import InventoryAuditLog from "./pages/InventoryAuditLog";
import WarehouseTransfers from "./pages/WarehouseTransfers";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import ProjectPayments from "./pages/ProjectPayments";
import NetMeteringPayments from "./pages/NetMeteringPayments";
import SpecialQuotations from "./pages/SpecialQuotations";
import SpecialQuotationEdit from "./pages/SpecialQuotationEdit";
import SpecialQuotationTemplates from "./pages/SpecialQuotationTemplates";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/accounts" component={Accounts} />
      <Route path="/opportunities" component={Opportunities} />
      <Route path="/activities" component={Activities} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/stock-transactions" component={StockTransactions} />
      <Route path="/purchase-orders" component={PurchaseOrders} />
      <Route path="/purchase-orders/new" component={PurchaseOrderCreate} />
      <Route path="/purchase-orders/:id" component={PurchaseOrderDetail} />
      <Route path="/suppliers" component={Suppliers} />
      <Route path="/bom-packages" component={BomPackages} />
      <Route path="/quotations" component={Quotations} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/users" component={UserManagement} />
      <Route path="/projects" component={Projects} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/project-payments" component={ProjectPayments} />
      <Route path="/net-metering" component={NetMetering} />
      <Route path="/nm-payments" component={NetMeteringPayments} />
      <Route path="/special-quotations" component={SpecialQuotations} />
      <Route path="/special-quotations/new" component={SpecialQuotationEdit} />
      <Route path="/special-quotations/:id" component={SpecialQuotationEdit} />
      <Route path="/special-quotation-templates" component={SpecialQuotationTemplates} />
      <Route path="/stock-adjustments" component={StockAdjustments} />
      <Route path="/inventory-audit" component={InventoryAuditLog} />
      <Route path="/warehouse-transfers" component={WarehouseTransfers} />
      <Route path="/settings" component={Settings} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/profile" component={Profile} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <ConfirmRoot />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
