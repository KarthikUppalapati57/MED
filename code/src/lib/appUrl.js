const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

export const APP_ORIGIN = trimTrailingSlash(
  import.meta.env.VITE_APP_URL ||
    import.meta.env.VITE_APP_BASE_URL ||
    window.location.origin
);

export function buildAppUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_ORIGIN}${normalizedPath}`;
}

export function buildSignupUrl(token) {
  return buildAppUrl(`/signup/${encodeURIComponent(token)}`);
}
