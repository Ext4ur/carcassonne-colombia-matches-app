/**
 * Actualiza `version` en package.json y en la entrada raíz de package-lock.json.
 * No usa git (útil con cambios sin commitear).
 *
 * Uso:
 *   node scripts/bump-version.mjs patch
 *   node scripts/bump-version.mjs minor
 *   node scripts/bump-version.mjs major
 *   node scripts/bump-version.mjs 1.5.0
 *
 * npm (elige uno):
 *   npm run version:patch
 *   npm run version:minor
 *   npm run version:major
 *   npm run version:set -- 2.0.0
 *   npm run bump-version -- patch
 *   npm run bump-version -- 2.0.0
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const lockPath = join(root, 'package-lock.json');

function bumpSemver(version, part) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!m) {
    throw new Error(`Versión actual inválida: ${version}`);
  }
  let major = Number(m[1]);
  let minor = Number(m[2]);
  let patch = Number(m[3]);
  if (part === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (part === 'minor') {
    minor += 1;
    patch = 0;
  } else if (part === 'patch') {
    patch += 1;
  } else {
    throw new Error(`Tipo desconocido: ${part}`);
  }
  return `${major}.${minor}.${patch}`;
}

const arg = process.argv[2];
if (!arg) {
  console.error(`Uso: node scripts/bump-version.mjs <patch|minor|major|x.y.z>

  npm run version:patch
  npm run version:minor
  npm run version:major
  npm run version:set -- 1.6.0
  npm run bump-version -- patch
  npm run bump-version -- 1.6.0`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const previous = pkg.version;
let next;
const exact = arg.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (exact) {
  next = `${exact[1]}.${exact[2]}.${exact[3]}`;
} else if (['patch', 'minor', 'major'].includes(arg)) {
  next = bumpSemver(pkg.version, arg);
} else {
  console.error('Argumento inválido: usa patch, minor, major o x.y.z');
  process.exit(1);
}

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

try {
  const lockRaw = readFileSync(lockPath, 'utf8');
  const lock = JSON.parse(lockRaw);
  lock.version = next;
  if (lock.packages?.['']) {
    lock.packages[''].version = next;
  }
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
    console.warn('Aviso: no existe package-lock.json; solo se actualizó package.json.');
  } else {
    throw err;
  }
}

console.log(`Versión actualizada: ${previous} → ${next}`);
