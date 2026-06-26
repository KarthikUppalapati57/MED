import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

export const Layout = React.lazy(() => import('./Layout.jsx'));

// Lazy load all pages
const AutoOrdering = React.lazy(() => import('./pages/AutoOrdering'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Inventory = React.lazy(() => import('./pages/Inventory'));
const Invoices = React.lazy(() => import('./pages/Invoices'));
const Payments = React.lazy(() => import('./pages/Payments'));
const PlatformAdmin = React.lazy(() => import('./pages/PlatformAdmin'));
const Products = React.lazy(() => import('./pages/Products'));
const OnboardingPage = React.lazy(() => import('./pages/OnboardingPage'));
const Recipes = React.lazy(() => import('./pages/Recipes'));
const UserManagement = React.lazy(() => import('./pages/UserManagement'));
const OrgManagement = React.lazy(() => import('./pages/OrgManagement'));
const Vendors = React.lazy(() => import('./pages/Vendors'));
const AuditLogs = React.lazy(() => import('./pages/AuditLogs'));
const PlatformUserManagement = React.lazy(() => import('./pages/PlatformUserManagement'));
const PlatformUsers = React.lazy(() => import('./pages/PlatformUsers'));
const PlatformPlans = React.lazy(() => import('./pages/PlatformPlans'));
const PlatformInvoices = React.lazy(() => import('./pages/PlatformInvoices'));
const PlatformOrganizations = React.lazy(() => import('./pages/PlatformOrganizations'));
const PlatformAuditLogs = React.lazy(() => import('./pages/PlatformAuditLogs'));
const PaymentVerification = React.lazy(() => import('./pages/PaymentVerification'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Labor = React.lazy(() => import('./pages/Labor'));
const Accounting = React.lazy(() => import('./pages/Accounting'));
const AiInsights = React.lazy(() => import('./pages/AiInsights'));
const Integrations = React.lazy(() => import('./pages/Integrations'));
const Notifications = React.lazy(() => import('./pages/Notifications'));
const AvTCosting = React.lazy(() => import('./pages/AvTCosting'));
const Performance = React.lazy(() => import('./pages/Performance'));
const MenuEngineering = React.lazy(() => import('./pages/MenuEngineering'));
const RestaurantSetup = React.lazy(() => import('./pages/RestaurantSetup'));
const DeveloperPortal = React.lazy(() => import('./pages/DeveloperPortal'));
const AuditVault = React.lazy(() => import('./pages/AuditVault'));
const SmartPrep = React.lazy(() => import('./pages/SmartPrep'));
const Commissary = React.lazy(() => import('./pages/Commissary'));
const MobileApp = React.lazy(() => import('./pages/MobileApp'));
const Billing = React.lazy(() => import('./pages/Billing'));
const CustomReports = React.lazy(() => import('./pages/CustomReports'));
const FoodSafety = React.lazy(() => import('./pages/FoodSafety'));
const FranchisorConsole = React.lazy(() => import('./pages/FranchisorConsole'));
const DeliveryAggregator = React.lazy(() => import('./pages/DeliveryAggregator'));
const LaborSchedules = React.lazy(() => import('./pages/LaborSchedules'));
const TimeClock = React.lazy(() => import('./pages/TimeClock'));
const CRM = React.lazy(() => import('./pages/CRM'));
const VendorBidding = React.lazy(() => import('./pages/VendorBidding'));
const ExecutiveBI = React.lazy(() => import('./pages/ExecutiveBI'));
const KDS = React.lazy(() => import('./pages/KDS'));
const DigitalMenu = React.lazy(() => import('./pages/DigitalMenu'));
const PayrollExport = React.lazy(() => import('./pages/PayrollExport'));
const TipPooling = React.lazy(() => import('./pages/TipPooling'));
const ShiftBoard = React.lazy(() => import('./pages/ShiftBoard'));
const OrderOnline = React.lazy(() => import('./pages/OrderOnline'));
const BusinessVerification = React.lazy(() => import('./pages/BusinessVerification'));

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
