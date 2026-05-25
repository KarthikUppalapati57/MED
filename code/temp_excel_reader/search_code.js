const fs = require('fs');
const path = require('path');

const srcDir = path.resolve('c:/Users/ukart/OneDrive - University of Tennessee/M/INtern/MECURSOR/MEVS/code/src');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

const keywords = ['reload', 'refresh', 'history', 'back', 'state'];
console.log('Searching in files...');

walkDir(srcDir, (filePath) => {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.jsx')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  
  keywords.forEach(keyword => {
    if (content.toLowerCase().includes(keyword)) {
      // Find line number and print matching lines
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(keyword)) {
          console.log(`${path.basename(filePath)}:${idx + 1} - matches "${keyword}": ${line.trim().substring(0, 100)}`);
        }
      });
    }
  });
});
