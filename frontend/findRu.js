const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    if (file.includes('node_modules') || file.includes('.next')) return;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      results.push(file);
    }
  });
  return results;
}

const files = walk('c:/GIVKOIN/frontend/src').filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
const ruRe1 = />([^<]*[А-Яа-яЁё]+[^<]*)</g;
const ruRe2 = /['"`]+([^'"`]*[А-Яа-яЁё]+[^'"`]*)['"`]+/g;

const found = new Set();
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = ruRe1.exec(content)) !== null) {
    found.add(m[1].trim());
  }
  while ((m = ruRe2.exec(content)) !== null) {
    found.add(m[1].trim());
  }
}

// Remove empty or junk strings
const cleanFound = Array.from(found).filter(s => /[А-Яа-яЁё]/.test(s) && !s.includes('\n'));

fs.writeFileSync('c:/GIVKOIN/frontend/ru_strings.json', JSON.stringify(cleanFound, null, 2));
console.log('Saved to ru_strings.json: ' + cleanFound.length + ' strings');
