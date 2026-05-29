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
import __Layout from './Layout.jsx';

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
    "Notifications": Notifications,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};