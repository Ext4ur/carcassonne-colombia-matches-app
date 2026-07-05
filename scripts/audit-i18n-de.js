import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../src/renderer/i18n/locales');
const files = ['es.json', 'en.json', 'de.json', 'hu.json'];

const data = {};
for (const file of files) {
  data[file] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
}

function getKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const full = prefix + key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getKeys(obj[key], full + '.'));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

function getVal(obj, pathString) {
  return pathString.split('.').reduce((o, k) => o?.[k], obj);
}

const keySets = Object.fromEntries(files.map((f) => [f, new Set(getKeys(data[f]))]));
const allKeys = new Set();
for (const ks of Object.values(keySets)) ks.forEach((k) => allKeys.add(k));

console.log('=== Key counts ===');
for (const f of files) console.log(`  ${f}: ${keySets[f].size}`);

console.log('\n=== Cross-file missing keys ===');
let parityOk = true;
for (const f of files) {
  const missing = [...allKeys].filter((k) => !keySets[f].has(k));
  if (missing.length) {
    parityOk = false;
    console.log(`  ${f} missing ${missing.length}:`, missing.slice(0, 10).join(', '));
  }
}
if (parityOk) console.log('  All files have identical key sets.');

const identical = [];
for (const k of keySets['en.json']) {
  const en = getVal(data['en.json'], k);
  const de = getVal(data['de.json'], k);
  if (typeof en === 'string' && en === de) identical.push({ k, en });
}

const allowSame = (s) => {
  if (s.length <= 2) return true;
  if (/^[🌙☀️👥📊⚔️📈📉🏆🎲\\-]+$/.test(s)) return true;
  if (/^(BGA|JSON|Excel|PNG|CSV|PDF|GitHub|Supabase|Devir|Online|Offline|VS|vs|pts|PTS|Name|Status|Email|Top|Swiss|KO|Micro|Nano|Rest\.)$/i.test(s)) return true;
  if (/^DEVIR-/.test(s)) return true;
  if (/^R\d+$/.test(s)) return true;
  if (/^\{\{/.test(s)) return true;
  return false;
};

const suspicious = identical.filter((x) => !allowSame(x.en));

console.log(`\n=== de.json vs en.json ===`);
console.log(`  Identical values: ${identical.length}`);
console.log(`  Likely untranslated: ${suspicious.length}`);
if (suspicious.length) {
  console.log('  Samples:');
  suspicious.slice(0, 30).forEach((x) => console.log(`    ${x.k}: ${JSON.stringify(x.en)}`));
}

process.exit(parityOk && suspicious.length === 0 ? 0 : suspicious.length > 0 ? 2 : 1);
