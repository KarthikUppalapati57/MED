const fs = require('fs');
const path = require('path');
const dir = 'src/pages';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

console.log('=== MEVS Platform Realtime Audit ===\n');
let totalChannels = 0;
let totalCleanups = 0;

files.forEach(f => {
  const c = fs.readFileSync(path.join(dir, f), 'utf8');
  const channels = (c.match(/supabase[\s\r\n]*\.[\s\r\n]*channel\(/g) || []).length;
  const cleanup = (c.match(/removeChannel/g) || []).length;
  totalChannels += channels;
  totalCleanups += cleanup;
  
  const status = channels > 0 ? '✅' : '⬜';
  console.log(`${status} ${f.padEnd(32)} channels=${channels}  cleanup=${cleanup}`);
});

console.log(`\n📊 Total: ${totalChannels} channels, ${totalCleanups} cleanups`);
console.log(totalChannels === totalCleanups ? '✅ All channels properly cleaned up' : '⚠️ Channel/cleanup mismatch!');
