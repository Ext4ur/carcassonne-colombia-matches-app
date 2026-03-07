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

// Inject APP_ENV directly into the compiled Node (Electron) output
const dbScriptPath = path.join(distPath, 'main', 'database.js');
if (fs.existsSync(dbScriptPath)) {
    const env = process.env.APP_ENV || 'colombia';
    let dbScriptContent = fs.readFileSync(dbScriptPath, 'utf8');

    // Check if the file still contains the dynamic process.env lookup and replace it with a hardcoded string
    dbScriptContent = dbScriptContent.replace(
        /const env = \(process\.env\.APP_ENV \|\| 'colombia'\)\.toLowerCase\(\);/g,
        `const env = '${env}'.toLowerCase(); // INJECTED BY BUILD SCRIPT`
    );

    fs.writeFileSync(dbScriptPath, dbScriptContent, 'utf8');
    console.log(`Injected APP_ENV='${env}' into dist/main/database.js`);
}
