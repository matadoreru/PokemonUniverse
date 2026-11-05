// Verificación de UI en un solo comando (regla «After every UI change» de AGENTS.md):
//   npm run ui:check -- <spec o filtro de Playwright> [más argumentos de playwright test]
//   npm run ui:check -- perfil
//   npm run ui:check -- juegos -g "type-chain"
//
// 1. Carga el .env de la raíz y levanta el Postgres local (npm run db:up) si su contenedor no está en marcha.
// 2. Ejecuta Playwright con esos argumentos. Arranca el backend Java y Vite si no están levantados, y cada capture()
//    guarda e2e/screenshots/<nombre>-<w>x<h>.png y comprueba encaje y legibilidad.
// 3. Lista las capturas que ha escrito esta ejecución, avisa de las que no tienen los tres tamaños (1280×720,
//    1920×1080 y 390×844) y genera e2e/test-results/revision.html con todas juntas para mirarlas.
// Sale con el código de Playwright.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const e2e = join(root, 'e2e');
const screenshots = join(e2e, 'screenshots');
const SIZES = ['1280x720', '1920x1080', '390x844'];
const PG_CONTAINER = process.env.PU_E2E_PG_CONTAINER ?? 'pokemonuniverse_postgres_1';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: npm run ui:check -- <spec o filtro> [argumentos de playwright test]');
  process.exit(2);
}

try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  console.warn('Aviso: no hay .env en la raíz; se usa el entorno del shell.');
}

function postgresRunning() {
  try {
    return execFileSync('podman', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).split('\n').includes(PG_CONTAINER);
  } catch {
    return false;
  }
}

if (!postgresRunning()) {
  console.log(`Postgres (${PG_CONTAINER}) parado: npm run db:up`);
  const up = spawnSync('npm', ['run', 'db:up'], { cwd: root, stdio: 'inherit' });
  if (up.status !== 0) process.exit(up.status ?? 1);
}

// Margen de un segundo: algunos sistemas de ficheros redondean la fecha de modificación.
const startedAt = Date.now() - 1000;
const run = spawnSync('npx', ['playwright', 'test', ...args], { cwd: e2e, stdio: 'inherit' });

const written = readdirSync(screenshots)
  .filter((file) => file.endsWith('.png') && statSync(join(screenshots, file)).mtimeMs >= startedAt)
  .sort();
const byName = new Map();
for (const file of written) {
  const match = /^(.*)-(\d+x\d+)\.png$/.exec(file);
  if (!match) continue;
  const [, name, size] = match;
  if (!byName.has(name)) byName.set(name, new Set());
  byName.get(name).add(size);
}

console.log(`\n${written.length} capturas escritas en ${relative(root, screenshots)}/ (${byName.size} pantallas).`);
const incomplete = [...byName].filter(([, sizes]) => SIZES.some((size) => !sizes.has(size)));
for (const [name, sizes] of incomplete) {
  const missing = SIZES.filter((size) => !sizes.has(size)).join(', ');
  console.log(`  Aviso: ${name} sin ${missing} (válido solo si la pantalla es de un tamaño concreto y el spec lo dice).`);
}

if (byName.size > 0) {
  const cells = (name, sizes) => SIZES.map((size) => sizes.has(size)
    ? `<figure><a href="../screenshots/${name}-${size}.png"><img src="../screenshots/${name}-${size}.png" alt="${name} ${size}" loading="lazy"></a><figcaption>${size}</figcaption></figure>`
    : `<figure class="missing"><figcaption>${size}: sin captura</figcaption></figure>`).join('');
  const rows = [...byName].map(([name, sizes]) => `<section><h2>${name}</h2><div class="row">${cells(name, sizes)}</div></section>`).join('\n');
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Revisión de capturas</title>
<style>body{font:15px system-ui,sans-serif;background:#111;color:#eee;margin:16px}h2{font-size:16px;margin:24px 0 8px}
.row{display:grid;grid-template-columns:2fr 2fr 1fr;gap:12px;align-items:start}figure{margin:0}img{width:100%;border:1px solid #444}
figcaption{color:#aaa;margin-top:4px}.missing{border:1px dashed #a55;padding:12px}</style>
<h1>Revisión: ${args.join(' ')}</h1>
<p>Puntúa las pantallas nuevas o rediseñadas con docs/visual-review.md (mínimo 19/24, ningún criterio a 0).</p>
${rows}
</html>
`;
  const out = join(e2e, 'test-results', 'revision.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`Revisión: ${relative(root, out)} (ábrela en el navegador).`);
}

process.exit(run.status ?? 1);
