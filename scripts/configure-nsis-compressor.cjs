const fs = require('node:fs');
const path = require('node:path');

const mode = process.argv[2];
if (mode !== 'direct' && mode !== 'archive') {
  throw new Error('Usage: node scripts/configure-nsis-compressor.cjs <direct|archive>');
}

const electronBuilderEntry = require.resolve('electron-builder');
const appBuilderPackage = require.resolve('app-builder-lib/package.json', {
  paths: [path.dirname(electronBuilderEntry)],
});
const targetPath = path.join(path.dirname(appBuilderPackage), 'out', 'targets', 'nsis', 'NsisTarget.js');
const source = fs.readFileSync(targetPath, 'utf8');
const marker = /const USE_NSIS_BUILT_IN_COMPRESSOR = (?:true|false);/;
if (!marker.test(source)) {
  throw new Error(`Unsupported electron-builder NSIS implementation: ${targetPath}`);
}

const direct = mode === 'direct';
const next = source.replace(marker, `const USE_NSIS_BUILT_IN_COMPRESSOR = ${direct};`);
fs.writeFileSync(targetPath, next, 'utf8');
console.log(direct
  ? 'NSIS direct-to-install-directory extraction enabled.'
  : 'NSIS archive extraction restored.');
