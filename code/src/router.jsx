import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

export const Layout = React.lazy(() => import('./Layout.jsx'));

// Lazy load all pages
const AutoOrdering = React.lazy(() => import('./modules/orders/pages/AutoOrdering'));
const Dashboard = React.lazy(() => import('./modules/dashboard/pages/Dashboard'));
const Inventory = React.lazy(() => import('./modules/inventory/pages/Inventory'));
const Invoices = React.lazy(() => import('./modules/invoices/pages/Invoices'));
const Payments = React.lazy(() => import('./modules/payments/pages/Payments'));
const PlatformAdmin = React.lazy(() => import('./modules/platform/pages/PlatformAdmin'));
const Products = React.lazy(() => import('./modules/products/pages/Products'));
const OnboardingPage = React.lazy(() => import('./modules/setup/pages/OnboardingPage'));
const Recipes = React.lazy(() => import('./modules/recipes/pages/Recipes'));
const UserManagement = React.lazy(() => import('./modules/admin/pages/UserManagement'));
const OrgManagement = React.lazy(() => import('./modules/admin/pages/OrgManagement'));
const Vendors = React.lazy(() => import('./modules/vendors/pages/Vendors'));
const AuditLogs = React.lazy(() => import('./modules/admin/pages/AuditLogs'));
const PlatformUserManagement = React.lazy(() => import('./modules/platform/pages/PlatformUserManagement'));
const PlatformUsers = React.lazy(() => import('./modules/platform/pages/PlatformUsers'));
const PlatformPlans = React.lazy(() => import('./modules/platform/pages/PlatformPlans'));
const PlatformInvoices = React.lazy(() => import('./modules/platform/pages/PlatformInvoices'));
const PlatformOrganizations = React.lazy(() => import('./modules/platform/pages/PlatformOrganizations'));
const PlatformAuditLogs = React.lazy(() => import('./modules/platform/pages/PlatformAuditLogs'));
const PaymentVerification = React.lazy(() => import('./modules/setup/pages/PaymentVerification'));
const Profile = React.lazy(() => import('./modules/dashboard/pages/Profile'));
const Labor = React.lazy(() => import('./modules/labor/pages/Labor'));
const Accounting = React.lazy(() => import('./modules/accounting/pages/Accounting'));
const AiInsights = React.lazy(() => import('./modules/ai_insights/pages/AiInsights'));
const Integrations = React.lazy(() => import('./modules/integrations/pages/Integrations'));
const Notifications = React.lazy(() => import('./modules/dashboard/pages/Notifications'));
const AvTCosting = React.lazy(() => import('./modules/inventory/pages/AvTCosting'));
const Performance = React.lazy(() => import('./modules/performance/pages/Performance'));
const MenuEngineering = React.lazy(() => import('./modules/recipes/pages/MenuEngineering'));
const RestaurantSetup = React.lazy(() => import('./modules/setup/pages/RestaurantSetup'));
const DeveloperPortal = React.lazy(() => import('./modules/integrations/pages/DeveloperPortal'));
const AuditVault = React.lazy(() => import('./modules/platform/pages/AuditVault'));
const SmartPrep = React.lazy(() => import('./modules/smartprep/pages/SmartPrep'));
const Commissary = React.lazy(() => import('./modules/commissary/pages/Commissary'));
const MobileApp = React.lazy(() => import('./modules/dashboard/pages/MobileApp'));
const Billing = React.lazy(() => import('./modules/billing/pages/Billing'));
const CustomReports = React.lazy(() => import('./modules/performance/pages/CustomReports'));
const FoodSafety = React.lazy(() => import('./modules/food_safety/pages/FoodSafety'));
const FranchisorConsole = React.lazy(() => import('./modules/admin/pages/FranchisorConsole'));
const DeliveryAggregator = React.lazy(() => import('./modules/recipes/pages/DeliveryAggregator'));
const LaborSchedules = React.lazy(() => import('./modules/labor/pages/LaborSchedules'));
const TimeClock = React.lazy(() => import('./modules/labor/pages/TimeClock'));
const CRM = React.lazy(() => import('./modules/crm_marketing/pages/CRM'));
const VendorBidding = React.lazy(() => import('./modules/vendors/pages/VendorBidding'));
const ExecutiveBI = React.lazy(() => import('./modules/performance/pages/ExecutiveBI'));
const KDS = React.lazy(() => import('./modules/kitchen_displays/pages/KDS'));
const DigitalMenu = React.lazy(() => import('./modules/kitchen_displays/pages/DigitalMenu'));
const PayrollExport = React.lazy(() => import('./modules/labor/pages/PayrollExport'));
const TipPooling = React.lazy(() => import('./modules/labor/pages/TipPooling'));
const ShiftBoard = React.lazy(() => import('./modules/labor/pages/ShiftBoard'));
const OrderOnline = React.lazy(() => import('./modules/recipes/pages/OrderOnline'));
const BusinessVerification = React.lazy(() => import('./modules/setup/pages/BusinessVerification'));

export const mainPage = "Dashboard";

// For easy iteration in App.jsx to render ProtectedModule wrappers
export const legacyRoutes = {
    "AutoOrdering": AutoOrdering,
    "Dashboard": Dashboard,
    "Inventory": Inventory,
    "Invoices": Invoices,
    "OnboardingPage": OnboardingPage,
    "Payments": Payments,
    "PlatformAdmin": PlatformAdmin,
    "Products": Products,
    "Recipes": Recipes,
    "OrgManagement": OrgManagement,
    "UserManagement": UserManagement,
    "Vendors": Vendors,
    "AuditLogs": AuditLogs,
    "PlatformUserManagement": PlatformUserManagement,
    "PlatformUsers": PlatformUsers,
    "PlatformPlans": PlatformPlans,
    "PlatformInvoices": PlatformInvoices,
    "PlatformOrganizations": PlatformOrganizations,
    "PlatformAuditLogs": PlatformAuditLogs,
    "PaymentVerification": PaymentVerification,
    "Profile": Profile,
    "Labor": Labor,
    "Accounting": Accounting,
    "AiInsights": AiInsights,
    "Integrations": Integrations,
    "Notifications": Notifications,
    "AvTCosting": AvTCosting,
    "Performance": Performance,
    "MenuEngineering": MenuEngineering,
    "RestaurantSetup": RestaurantSetup,
    "DeveloperPortal": DeveloperPortal,
    "AuditVault": AuditVault,
    "KDS": KDS,
    "DigitalMenu": DigitalMenu,
    "PayrollExport": PayrollExport,
    "SmartPrep": SmartPrep,
    "Commissary": Commissary,
    "MobileApp": MobileApp,
    "Billing": Billing,
    "CustomReports": CustomReports,
    "FoodSafety": FoodSafety,
    "FranchisorConsole": FranchisorConsole,
    "DeliveryAggregator": DeliveryAggregator,
    "LaborSchedules": LaborSchedules,
    "TimeClock": TimeClock,
    "CRM": CRM,
    "VendorBidding": VendorBidding,
    "ExecutiveBI": ExecutiveBI,
    "TipPooling": TipPooling,
    "ShiftBoard": ShiftBoard,
    "OrderOnline": OrderOnline
};
export const canonicalRoutes = [
    { path: "dashboard", pageName: "Dashboard", Page: Dashboard },
    { path: "performance/:view?", pageName: "Performance", Page: Performance },
    { path: "inbox", pageName: "Notifications", Page: Notifications },
    { path: "invoices/:view?", pageName: "Invoices", Page: Invoices },
    { path: "payments/:view?", pageName: "Payments", Page: Payments },
    { path: "products/:view?", pageName: "Products", Page: Products },
    { path: "inventory/:view?", pageName: "Inventory", Page: Inventory },
    { path: "orders/:view?", pageName: "AutoOrdering", Page: AutoOrdering },
    { path: "smart-prep/:view?", pageName: "SmartPrep", Page: SmartPrep },
    { path: "commissary/:view?", pageName: "Commissary", Page: Commissary },
    { path: "recipes/:view?", pageName: "Recipes", Page: Recipes },
    { path: "vendors/:view?", pageName: "Vendors", Page: Vendors },
    { path: "labor/:view?", pageName: "Labor", Page: Labor },
    { path: "accounting/:view?", pageName: "Accounting", Page: Accounting },
    { path: "settings/:view?", pageName: "OrgManagement", Page: OrgManagement },
    { path: "team-members/:view?", pageName: "UserManagement", Page: UserManagement },
    { path: "restaurant-setup/:view?", pageName: "RestaurantSetup", Page: RestaurantSetup },
    { path: "integrations/:view?", pageName: "Integrations", Page: Integrations },
    { path: "audit-logs/:view?", pageName: "AuditLogs", Page: AuditLogs },
    { path: "ai-insights/:view?", pageName: "AiInsights", Page: AiInsights },
    { path: "avt-costing/:view?", pageName: "AvTCosting", Page: AvTCosting },
    { path: "menu-engineering/:view?", pageName: "MenuEngineering", Page: MenuEngineering },
    { path: "developer-portal/:view?", pageName: "DeveloperPortal", Page: DeveloperPortal },
    { path: "audit-vault/:view?", pageName: "AuditVault", Page: AuditVault },
    { path: "mobile-app/:view?", pageName: "MobileApp", Page: MobileApp },
    { path: "billing/:view?", pageName: "Billing", Page: Billing },
    { path: "custom-reports/:view?", pageName: "CustomReports", Page: CustomReports },
    { path: "food-safety/:view?", pageName: "FoodSafety", Page: FoodSafety },
    { path: "franchisor-console/:view?", pageName: "FranchisorConsole", Page: FranchisorConsole },
    { path: "delivery-aggregator/:view?", pageName: "DeliveryAggregator", Page: DeliveryAggregator },
    { path: "labor-schedules/:view?", pageName: "LaborSchedules", Page: LaborSchedules },
    { path: "time-clock/:view?", pageName: "TimeClock", Page: TimeClock },
    { path: "crm/:view?", pageName: "CRM", Page: CRM },
    { path: "vendor-bidding/:view?", pageName: "VendorBidding", Page: VendorBidding },
    { path: "executive-bi/:view?", pageName: "ExecutiveBI", Page: ExecutiveBI },
    { path: "kds/:view?", pageName: "KDS", Page: KDS },
    { path: "digital-menu/:view?", pageName: "DigitalMenu", Page: DigitalMenu },
    { path: "payroll-export/:view?", pageName: "PayrollExport", Page: PayrollExport },
    { path: "tip-pooling/:view?", pageName: "TipPooling", Page: TipPooling },
    { path: "shift-board/:view?", pageName: "ShiftBoard", Page: ShiftBoard },
    { path: "order-online/:view?", pageName: "OrderOnline", Page: OrderOnline },
];

export const setupRoutes = {
    BusinessVerification,
    PaymentVerification,
    OnboardingPage,
};
