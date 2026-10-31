// Regenera (o con --check compara) las fixtures doradas de backend/src/test/resources/golden
// ejecutando packages/shared/golden/runner.ts con tsx. Requiere los dist de shared y del servidor:
// npm run build -w @pokemon-universe/shared && npm run build -w @pokemon-universe/server
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  ['packages/shared/dist/index.js', 'npm run build -w @pokemon-universe/shared'],
  ['apps/server/dist/src/pokemon/catalog.js', 'npm run build -w @pokemon-universe/server'],
];
for (const [path, command] of required) {
  if (!existsSync(new URL(`../${path}`, import.meta.url))) {
    console.error(`No existe ${path}. Ejecuta ${command}`);
    process.exit(1);
  }
}

const args = ['--import', 'tsx', 'packages/shared/golden/runner.ts', '--out', 'backend/src/test/resources/golden'];
if (process.argv.includes('--check')) args.push('--check');
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
