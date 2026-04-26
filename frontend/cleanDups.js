const fs = require('fs');
const tsPath = 'c:/GIVKOIN/frontend/src/i18n/translations.ts';
let lines = fs.readFileSync(tsPath, 'utf8').split('\n');

let start = -1;
let end = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const EXACT_UI_TEXT_TRANSLATIONS:')) {
    start = i;
  }
  if (start !== -1 && lines[i].trim() === '},' && lines[i+1].trim() === '};') {
    end = i;
    break;
  }
}

console.log('Start:', start, 'End:', end);

const seen = new Set();
const toRemove = new Set();

for (let i = end - 1; i > start; i--) {
  let line = lines[i].trim();
  if (line.startsWith("'")) {
    let keyEnd = line.indexOf("': '");
    if (keyEnd === -1) keyEnd = line.indexOf("':\t'");
    if (keyEnd !== -1) {
      let key = line.substring(1, keyEnd);
      if (seen.has(key)) {
        toRemove.add(i);
      } else {
        seen.add(key);
      }
    }
  }
}

console.log('Duplicates found:', toRemove.size);
const newLines = lines.filter((_, i) => !toRemove.has(i));
fs.writeFileSync(tsPath, newLines.join('\n'));
console.log('Done');
