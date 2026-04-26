const fs = require('fs');

async function translateText(text) {
  try {
    const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=en&dt=t&q=' + encodeURIComponent(text));
    if (!res.ok) throw new Error('Bad response');
    const json = await res.json();
    let translated = '';
    for (let i = 0; i < json[0].length; i++) {
      translated += json[0][i][0];
    }
    return translated;
  } catch (e) {
    return text;
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync('c:/GIVKOIN/frontend/ru_strings.json', 'utf8'));
  let translations = {};
  if (fs.existsSync('c:/GIVKOIN/frontend/translations_cache.json')) {
    translations = JSON.parse(fs.readFileSync('c:/GIVKOIN/frontend/translations_cache.json', 'utf8'));
  }
  
  console.log('Total strings to translate:', data.length);
  
  for (let i = 0; i < data.length; i++) {
    const text = data[i];
    if (translations[text]) continue; // Skip if already translated
    const translated = await translateText(text);
    translations[text] = translated;
    process.stdout.write(`\rTranslated ${i + 1}/${data.length}`);
    if (i % 50 === 0) {
      fs.writeFileSync('c:/GIVKOIN/frontend/translations_cache.json', JSON.stringify(translations, null, 2));
    }
    await new Promise(r => setTimeout(r, 50));
  }
  fs.writeFileSync('c:/GIVKOIN/frontend/translations_cache.json', JSON.stringify(translations, null, 2));
  console.log('\nDone translating.');
  
  // Inject into translations.ts
  const tsPath = 'c:/GIVKOIN/frontend/src/i18n/translations.ts';
  let tsContent = fs.readFileSync(tsPath, 'utf8');
  
  const lines = tsContent.split('\n');
  const exactEnIndex = lines.findIndex(l => l.includes('const EXACT_UI_TEXT_TRANSLATIONS:'));
  if (exactEnIndex === -1) {
    console.log('Could not find EXACT_UI_TEXT_TRANSLATIONS');
    return;
  }
  
  const enStart = lines.findIndex((l, i) => i > exactEnIndex && l.includes('en: {'));
  if (enStart === -1) return;
  
  // Find where en: { ends
  let enEnd = -1;
  let braces = 1;
  for (let i = enStart + 1; i < lines.length; i++) {
    if (lines[i].includes('{')) braces++;
    if (lines[i].includes('}')) braces--;
    if (braces === 0) {
      enEnd = i;
      break;
    }
  }
  
  if (enEnd !== -1) {
    let idx = enStart + 1;
    for (const [k, v] of Object.entries(translations)) {
        if (!k.trim()) continue;
        const key = k.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const val = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        lines.splice(idx, 0, `    '${key}': '${val}',`);
        idx++;
    }
    fs.writeFileSync(tsPath, lines.join('\n'));
    console.log('Injected translations into translations.ts');
  }
}

main();
