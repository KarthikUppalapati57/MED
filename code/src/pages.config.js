/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 */
import React from 'react';
const __Layout = React.lazy(() => import('./Layout.jsx'));

// Dynamically import pages using React.lazy for code-splitting
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

export const PAGES = {
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
    "KDS": KDS,
    "DigitalMenu": DigitalMenu,
    "PayrollExport": PayrollExport,
    "TipPooling": TipPooling,
    "ShiftBoard": ShiftBoard,
    "OrderOnline": OrderOnline
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
