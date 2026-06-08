# Single Sign-On (SSO) Configuration Guide

To complete Phase 1 and enable Enterprise SSO, you must configure the Identity Providers in your Supabase Dashboard.

## Google SSO

1. Go to the **Google Cloud Console** and create a new project.
2. Navigate to **APIs & Services > Credentials**.
3. Create an **OAuth Client ID** (Application type: Web application).
4. Set the **Authorized redirect URIs** to `https://<project-ref>.supabase.co/auth/v1/callback`
5. Copy your **Client ID** and **Client Secret**.
6. Open your **Supabase Dashboard** -> **Authentication** -> **Providers**.
7. Enable **Google**, paste the Client ID and Secret, and click Save.

## Microsoft / Azure AD SSO

1. Go to the **Azure Active Directory Portal**.
2. Click **App registrations** -> **New registration**.
3. Enter a name (e.g., "MEVS Login").
4. Set the **Redirect URI** (Web) to `https://<project-ref>.supabase.co/auth/v1/callback`
5. After registering, go to **Certificates & secrets** and create a new client secret. Copy the `Value`.
6. Go to **Overview** and copy the **Application (client) ID**.
7. Open your **Supabase Dashboard** -> **Authentication** -> **Providers**.
8. Enable **Azure**, paste the Client ID and Secret, and click Save.

## MFA Update Completed

The application (`App.jsx`) has been updated to **enforce Multi-Factor Authentication (MFA)** *only* for the following high-privilege roles:

- `platform_admin`
- `org_owner`
- `branch_manager`

Lower-privileged roles (like `ground_staff`) will not be forced to set up MFA unless they choose to.
