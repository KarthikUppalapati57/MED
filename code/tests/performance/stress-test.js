import autocannon from 'autocannon';

// Run with: node tests/performance/stress-test.js

const url = process.env.BASE_URL || 'http://localhost:5173';

console.log(`Starting stress test against ${url}...`);

function runTest(connections, duration) {
  return new Promise((resolve) => {
    console.log(`\n--- Running test with ${connections} concurrent users for ${duration}s ---`);
    const instance = autocannon({
      url,
      connections,
      duration,
      pipelining: 1,
    });

    instance.on('done', (result) => {
      console.log(`Test complete. Results for ${connections} users:`);
      console.log(`- Total Requests: ${result.requests.total}`);
      console.log(`- Average Latency: ${result.latency.average} ms`);
      console.log(`- 99th Percentile Latency: ${result.latency.p99} ms`);
      console.log(`- Errors: ${result.errors}`);
      console.log(`- Timeouts: ${result.timeouts}`);
      resolve(result);
    });
  });
}

async function runAllTests() {
  // Test 1: 100 concurrent users
  await runTest(100, 10);
  
  // Test 2: 500 concurrent users
  await runTest(500, 10);
  
  // Test 3: 1000 concurrent users
  await runTest(1000, 10);
  
  console.log('\nAll stress tests completed.');
}

runAllTests().catch(console.error);
