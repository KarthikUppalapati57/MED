const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\ukart\\.gemini\\antigravity\\brain\\20c43698-31f4-4ccc-99ff-661215e93a04\\.system_generated\\steps\\51\\content.md';
let content = fs.readFileSync(filePath, 'utf8');

// Strip html tags
let text = content.replace(/<[^>]*>/g, ' ');
// Normalize whitespace
text = text.replace(/\s+/g, ' ');

console.log('Total text length:', text.length);

// Let's search for some strings that might be inside a Gemini conversation
// like "onAuthStateChange" or "session" or "reload" or "token"
const searchTerms = ['auth', 'reload', 'back', 'state', 'cache', 'data', 'supabase', 'profile', 'sessionStorage', 'localStorage', 'queryKey'];

searchTerms.forEach(term => {
  const count = (text.match(new RegExp(term, 'gi')) || []).length;
  console.log(`Keyword "${term}": ${count} matches`);
});

// Let's print out segments of the text that look like actual user prompts or assistant answers
// Gemini shares usually contain the prompt and the answer.
// Let's write a regex to find blocks of text that are readable.
// For example, finding sentences or sequences of words without special characters.
console.log('--- Printing first 2000 chars of cleaned text ---');
console.log(text.substring(0, 2000));

// Let's write to a text file for further viewing if needed
fs.writeFileSync('C:\\Users\\ukart\\.gemini\\antigravity\\brain\\20c43698-31f4-4ccc-99ff-661215e93a04\\.system_generated\\steps\\51\\cleaned_text.txt', text);
