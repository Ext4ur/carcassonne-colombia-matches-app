import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, '../dist');
const pkgPath = path.join(distPath, 'package.json');

if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
}

fs.writeFileSync(pkgPath, JSON.stringify({ type: 'commonjs' }, null, 2));
console.log('Created dist/package.json with type: commonjs');
