// Exporta el registro de minijuegos de TypeScript a backend/src/main/resources/games/registry.json.
// Requiere compilar antes shared: npm run build -w @pokemon-universe/shared
// Con --check no escribe: falla (exit 1) si el fichero commiteado difiere.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gameRegistry } from '../packages/shared/dist/index.js';

const target = fileURLToPath(new URL('../backend/src/main/resources/games/registry.json', import.meta.url));
const output = JSON.stringify(gameRegistry.list().map((game) => ({ ...game.manifest, defaultConfig: game.defaultConfig })), null, 2) + '\n';

if (process.argv.includes('--check')) {
  let current = null;
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // fichero ausente: cuenta como diferencia
  }
  if (current !== output) {
    console.error('El registro de minijuegos exportado está desactualizado. Ejecuta npm run registry:export');
    process.exit(1);
  }
} else {
  writeFileSync(target, output);
  console.log(`Exportados ${gameRegistry.list().length} minijuegos a ${target}`);
}
