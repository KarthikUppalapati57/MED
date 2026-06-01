import http from 'k6/http';
import { check, sleep } from 'k6';

// Run with: k6 run stress-test.js
// Simulates extreme load to find the breaking point of the system

export const options = {
  stages: [
    { duration: '1m', target: 100 }, // Ramp up to 100 users
    { duration: '2m', target: 500 }, // Ramp up to 500 users
    { duration: '2m', target: 1000 }, // Ramp up to 1000 users (Peak traffic simulation)
    { duration: '2m', target: 1000 }, // Stay at 1000 users
    { duration: '1m', target: 0 },    // Ramp down rapidly
  ],
  thresholds: {
    // Under extreme stress, we might allow higher latencies but keep track of it
    http_req_duration: ['p(95)<1500'], 
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
const API_URL = __ENV.API_URL || 'http://127.0.0.1:54321';

export default function () {
  const res = http.get(BASE_URL);
  check(res, {
    'landing page status is 200': (r) => r.status === 200,
  });
  
  sleep(Math.random() * 2); // Random sleep between 0-2s to simulate human randomness
}
