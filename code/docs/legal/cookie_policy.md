# Cookie Policy

**Last updated:** July 24, 2026
**Source of truth:** [code/src/modules/public/pages/CookiePolicy.jsx](../../src/modules/public/pages/CookiePolicy.jsx) (route `/cookies`) — update both if either changes.

## 1. Necessary Storage

Restops uses strictly necessary browser storage and cookies to keep users signed in, maintain Supabase authentication sessions, remember local UI preferences, support MFA/session flows, and keep the web application functional.

## 2. Analytics and Tracking

PostHog and Sentry are disabled for production alignment and are not approved production subprocessors. This policy does not claim Plausible analytics or other third-party analytics tracking.

## 3. Local Preferences

The app may store non-sensitive local preferences such as theme, pending invite metadata, MFA setup skip state, offline/PWA state, and session workflow markers. These values support product functionality and should not be used for cross-site advertising.

## 4. Managing Storage

Blocking necessary storage may prevent login, MFA, tenant routing, offline support, or secure app workflows from functioning. Optional analytics consent controls are not active because production analytics are currently disabled.
