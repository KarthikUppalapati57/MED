const fs = require('fs');
const path = require('path');

const filePath = path.resolve('c:/Users/ukart/OneDrive - University of Tennessee/M/INtern/MECURSOR/MEVS/code/src/modules/platform/pages/PlatformAdmin.jsx');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
console.log('Searching for module updates in PlatformAdmin.jsx...');
lines.forEach((line, idx) => {
  if (line.includes('enabled_modules') || line.includes('modules') || line.includes('plan')) {
    if (line.trim().length > 0) {
      console.log(`${idx + 1}: ${line.trim().substring(0, 120)}`);
    }
  }
});
