import posthog from 'posthog-js';

export const initPostHog = () => {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    console.warn('PostHog API key is not set. Analytics are disabled.');
    return;
  }

  posthog.init(apiKey, {
    api_host: apiHost,
    // Enable debug mode in development
    loaded: (posthog) => {
      if (import.meta.env.DEV) posthog.debug();
    },
    // Customize your configuration here (e.g., autocapture)
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
  });
};

export default posthog;
