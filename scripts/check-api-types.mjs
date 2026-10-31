// Comprueba que apps/web/src/lib/api-types.ts coincide con lo que genera openapi-typescript
// a partir de backend/openapi/pokemon-universe.yml.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const web = join(root, 'apps/web');
const spec = join(root, 'backend/openapi/pokemon-universe.yml');
const committed = join(web, 'src/lib/api-types.ts');
const dir = mkdtempSync(join(tmpdir(), 'api-types-'));
try {
  const out = join(dir, 'api-types.ts');
  const run = spawnSync('npx', ['--no-install', 'openapi-typescript', spec, '-o', out], { cwd: web, encoding: 'utf8' });
  if (run.status !== 0) { console.error(run.stdout, run.stderr); process.exit(run.status ?? 1); }
  if (readFileSync(out, 'utf8') !== readFileSync(committed, 'utf8')) {
    console.error('apps/web/src/lib/api-types.ts no coincide con backend/openapi/pokemon-universe.yml.');
    console.error('Ejecuta npm run api:types -w @pokemon-universe/web');
    process.exit(1);
  }
  console.log('api-types.ts al día con el OpenAPI del backend.');
} finally { rmSync(dir, { recursive: true, force: true }); }
