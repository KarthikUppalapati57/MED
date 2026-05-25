const fs = require('fs');
const filePath = 'C:\\Users\\ukart\\.gemini\\antigravity\\brain\\20c43698-31f4-4ccc-99ff-661215e93a04\\.system_generated\\steps\\51\\content.md';
const content = fs.readFileSync(filePath, 'utf8');

// Let's find if "76bc1b6f6e5c" appears anywhere in the content
const index = content.indexOf('76bc1b6f6e5c');
console.log('Index of share ID in HTML:', index);

// Let's find all URLs that look like they could be related to the conversation or data
const urls = content.match(/https?:\/\/[^\s"'<>]+/g) || [];
console.log('Total URLs found:', urls.length);
console.log('Sample URLs:', urls.slice(0, 20));
