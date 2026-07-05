import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.join(__dirname, '../src/renderer/i18n/locales');
const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json'));

const data = {};
for (const file of files) {
    data[file] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
}

function getKeys(obj, prefix = '') {
    let keys = [];
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (Array.isArray(obj[key])) {
                keys.push(prefix + key);
            } else {
                keys.push(...getKeys(obj[key], prefix + key + '.'));
            }
        } else {
            keys.push(prefix + key);
        }
    }
    return keys;
}

const allKeys = new Set();
for (const content of Object.values(data)) {
    getKeys(content).forEach((k) => allKeys.add(k));
}

function getNestedValue(obj, pathString) {
    const keys = pathString.split('.');
    let current = obj;
    for (let i = 0; i < keys.length; i++) {
        if (current == null) return undefined;
        current = current[keys[i]];
    }
    return current;
}

function setNestedValue(obj, pathString, value) {
    const keys = pathString.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    const lastKey = keys[keys.length - 1];
    if (!(lastKey in current)) {
        current[lastKey] = value;
    }
}

function sortObjectDeep(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        return obj;
    }
    const sortedKeys = Object.keys(obj).sort();
    const res = {};
    for (const key of sortedKeys) {
        res[key] = sortObjectDeep(obj[key]);
    }
    return res;
}

const isFix = process.argv.includes('--fix');
let hasErrors = false;

for (const file of files) {
    const content = data[file];
    const fileKeys = new Set(getKeys(content));
    const missing = [...allKeys].filter((k) => !fileKeys.has(k)).sort();

    if (missing.length > 0) {
        console.log(`\n❌ File ${file} is missing ${missing.length} keys:`);
        missing.forEach((k) => console.log(`  - ${k}`));
        hasErrors = true;

        if (isFix) {
            missing.forEach((k) => {
                let fallbackValue = `TODO: ${k}`;
                for (const f of ['en.json', 'es.json', 'de.json', 'hu.json']) {
                    if (f !== file && data[f]) {
                        const val = getNestedValue(data[f], k);
                        if (val !== undefined) {
                            fallbackValue = val;
                            break;
                        }
                    }
                }
                setNestedValue(content, k, fallbackValue);
            });

            const sortedContent = sortObjectDeep(content);
            fs.writeFileSync(
                path.join(localesDir, file),
                JSON.stringify(sortedContent, null, 2) + '\n',
                'utf8'
            );
            console.log(`✅ Fixed missing keys in ${file}`);
        }
    } else if (isFix) {
        const sortedContent = sortObjectDeep(content);
        fs.writeFileSync(
            path.join(localesDir, file),
            JSON.stringify(sortedContent, null, 2) + '\n',
            'utf8'
        );
    }
}

if (hasErrors && !isFix) {
    console.error('\n❌ Translation check failed. Missing keys found across languages.');
    console.log('💡 Run `npm run check-translations:fix` to automatically insert them using fallbacks.');
    process.exit(1);
} else {
    console.log('\n✅ All translation files are synchronized with 100% parity.');
}
