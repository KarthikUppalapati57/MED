const payload = {
    api_key: "phc_Cjb3GUZkfjBAVnkCxdi4j8KgwPuqfPeiueDbWfhSL8uE",
    event: "$pageview",
    distinct_id: "test_user_123"
};

fetch('https://us.i.posthog.com/capture/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
.then(res => res.text())
.then(console.log)
.catch(console.error);
