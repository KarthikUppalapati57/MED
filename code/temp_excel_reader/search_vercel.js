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

console.log('Searching for "vercel" inside src...');
walkDir(srcDir, (filePath) => {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.jsx')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.toLowerCase().includes('vercel')) {
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes('vercel')) {
        console.log(`${path.basename(filePath)}:${idx + 1} - ${line.trim()}`);
      }
    });
  }
});
