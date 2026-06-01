import http from 'k6/http';
import { check, sleep } from 'k6';

// Run with: k6 run load-test.js
// Simulates 100 concurrent users performing a typical read workflow

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp up to 20 users
    { duration: '1m', target: 100 }, // Ramp up to 100 users
    { duration: '2m', target: 100 }, // Stay at 100 users for 2 minutes
    { duration: '30s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete within 500ms
    http_req_failed: ['rate<0.01'],   // Error rate must be less than 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173'; // Override via env var
const API_URL = __ENV.API_URL || 'http://127.0.0.1:54321'; // Local supabase

export default function () {
  // 1. Visit the main landing page
  const res = http.get(BASE_URL);
  check(res, {
    'landing page status is 200': (r) => r.status === 200,
  });
  sleep(1);

  // 2. Simulate a call to the Supabase API to fetch a public resource or unauthenticated endpoint
  // Note: For authenticated endpoints, you would need to pass an Authorization Bearer token.
  // We're hitting the root REST endpoint as a basic healthcheck.
  const apiRes = http.get(`${API_URL}/rest/v1/`, {
    headers: {
      'apikey': __ENV.SUPABASE_ANON_KEY || 'YOUR_ANON_KEY',
    }
  });
  
  check(apiRes, {
    'api status is 200': (r) => r.status === 200,
  });
  sleep(2);
}
