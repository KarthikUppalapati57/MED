const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\ukart\\.gemini\\antigravity\\brain\\20c43698-31f4-4ccc-99ff-661215e93a04\\.system_generated\\steps\\51\\content.md';
const content = fs.readFileSync(filePath, 'utf8');

console.log('Searching for keywords...');
const keywords = ['Relaod', 'Reload', 'ui', 'data', 'gemini', 'back', 'displaying'];

keywords.forEach(keyword => {
  const regex = new RegExp(keyword, 'gi');
  let match;
  const matches = [];
  while ((match = regex.exec(content)) !== null) {
    matches.push(match.index);
  }
  console.log(`Keyword "${keyword}": found ${matches.length} matches`);
});

// Let's search for some long text block that looks like conversation. 
// Gemini share page has JSON data usually in a script tag (e.g. AF_initDataCallback or WIZ_global_data or similar).
// Let's search for "AF_initDataCallback" or window.WIZ_global_data.
const initDataRegex = /c:\/|c:\\/gi;
console.log('Occurrences of local path markers:', content.match(initDataRegex)?.length || 0);

// Let's print out what is inside the script tags or JSON-like arrays
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let scriptMatch;
let count = 0;
while ((scriptMatch = scriptRegex.exec(content)) !== null && count < 20) {
  const scriptContent = scriptMatch[1];
  if (scriptContent.includes('c:\/') || scriptContent.includes('c:\\') || scriptContent.includes('Issues') || scriptContent.includes('back') || scriptContent.includes('http')) {
    console.log(`Script ${count} (length ${scriptContent.length}): includes some content`);
  }
  count++;
}
