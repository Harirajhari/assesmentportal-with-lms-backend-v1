const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

const allFiles = walk('.');
const realPaths = new Set(allFiles.map(f => f.replace(/\\/g, '/').replace(/^\.\//, '')));

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const requires = [...content.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)].map(m => m[1]);
  for (const req of requires) {
    let resolved = path.normalize(path.join(path.dirname(file), req)).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!resolved.endsWith('.js')) resolved += '.js';
    if (!realPaths.has(resolved)) {
      console.log('MISMATCH in ' + file + ':\n  requires ' + req + '\n  resolved to ' + resolved + ' — not found\n');
    }
  }
}