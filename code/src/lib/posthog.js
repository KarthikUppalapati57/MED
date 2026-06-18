let posthogPromise = null;
let initPromise = null;

const getPostHog = async () => {
  if (!posthogPromise) {
    posthogPromise = import('posthog-js').then((module) => module.default || module);
  }
  return posthogPromise;
};

export const initPostHog = () => {
  if (initPromise) return initPromise;

  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    console.warn('PostHog API key is not set. Analytics are disabled.');
    initPromise = Promise.resolve(null);
    return initPromise;
  }

  initPromise = getPostHog().then((posthog) => {
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
    return posthog;
  }).catch((error) => {
    console.warn('PostHog failed to initialize:', error);
    return null;
  });

  return initPromise;
};

const posthogProxy = {
  capture: (...args) => {
    initPostHog().then((posthog) => posthog?.capture(...args)).catch(() => {});
  },
  identify: (...args) => {
    initPostHog().then((posthog) => posthog?.identify(...args)).catch(() => {});
  },
  reset: (...args) => {
    initPostHog().then((posthog) => posthog?.reset(...args)).catch(() => {});
  },
};

export default posthogProxy;
