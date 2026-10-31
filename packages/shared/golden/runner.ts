// Exportador de fixtures doradas: ejecuta los motores TS de referencia con PRNG determinista y
// guarda cada proyección para que el replayer Java verifique la paridad.
//   tsx packages/shared/golden/runner.ts --out <dir>          escribe <dir>/<engineId>/*.json
//   tsx packages/shared/golden/runner.ts --check --out <dir>  compara sin escribir (exit 1 si difiere)
// Requiere los dist de shared y del servidor (ver scripts/export-golden-fixtures.mjs).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameContext, MiniGameModule } from '../dist/index.js';
import { loadGoldenCatalog } from './catalog.js';
import { mulberry32 } from './prng.js';
import { scenarios as defaultScenarios, type GoldenEngineEntry } from './scenarios/index.js';
import type { ConfigCase, GoldenFixture, GoldenScenario, GoldenSnapshot, GoldenStepResult } from './types.js';

type AnyModule = MiniGameModule<any, any, any, any>;

const CATALOG_DIR = 'catalog';

function snapshot(module: AnyModule, state: unknown, context: GameContext): GoldenSnapshot {
  return {
    lifecycle: module.getLifecycle(state),
    publicState: module.getPublicState(state, context),
    playerStates: Object.fromEntries(context.players.map((player) => [player.id, module.getPlayerState(state, player.id, context)])),
    finished: module.isFinished(state),
  };
}

export function runScenario(module: AnyModule, scenario: GoldenScenario): GoldenFixture {
  const startNow = scenario.startNow ?? 1000;
  let context: GameContext = {
    players: scenario.players,
    pokemon: loadGoldenCatalog(scenario.catalog),
    now: startNow,
    random: mulberry32(scenario.seed),
    roomCode: scenario.roomCode ?? 'GOLD01',
    ...(scenario.players[0] ? { hostId: scenario.players[0].id } : {}),
  };
  const configNormalized = module.configSchema.parse(scenario.config);
  let state = module.createInitialState(configNormalized, context);
  const initial = snapshot(module, state, context);
  state = module.start(state, context);
  const afterStart = snapshot(module, state, context);

  const afterSteps: GoldenStepResult[] = [];
  let stoppedAt: number | undefined;
  for (const [index, step] of scenario.steps.entries()) {
    context = { ...context, now: step.now, ...(step.kind === 'presence' ? { players: step.players } : {}) };
    try {
      if (step.kind === 'action') {
        const result = module.handleAction(state, step.playerId, step.action, context);
        state = result.state;
        afterSteps.push({ accepted: result.accepted, ...(result.error !== undefined ? { error: result.error } : {}), snapshot: snapshot(module, state, context) });
      } else {
        if (step.kind === 'timeout') state = module.handleTimeout(state, context);
        else if (module.handlePresenceChange) state = module.handlePresenceChange(state, context);
        afterSteps.push({ snapshot: snapshot(module, state, context) });
      }
    } catch (error) {
      afterSteps.push({ threw: String(error instanceof Error ? error.message : error) });
      stoppedAt = index;
      break;
    }
  }

  return {
    engineId: module.manifest.id,
    scenario: scenario.name,
    seed: scenario.seed,
    catalog: scenario.catalog,
    players: scenario.players,
    config: scenario.config,
    steps: scenario.steps,
    expected: {
      configNormalized,
      initial,
      afterStart,
      afterSteps,
      ...(stoppedAt === undefined && module.isFinished(state) ? { results: module.getResults(state) } : {}),
    },
    ...(stoppedAt !== undefined ? { stoppedAt } : {}),
  };
}

export function runConfigCases(module: AnyModule, inputs: readonly unknown[]): ConfigCase[] {
  return inputs.map((input) => {
    const parsed = module.configSchema.safeParse(input);
    return parsed.success ? { input, valid: true, normalized: parsed.data } : { input, valid: false };
  });
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/** JSON estable: semántica de JSON.stringify (undefined fuera, null dentro) con claves ordenadas recursivamente. */
export function toCanonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(JSON.parse(JSON.stringify(value))), null, 2) + '\n';
}

/** Ruta relativa (`<engineId>/<fichero>.json`) → contenido, en el orden del registro de escenarios. */
export function renderFixtures(entries: Readonly<Record<string, GoldenEngineEntry>> = defaultScenarios): Map<string, string> {
  const files = new Map<string, string>();
  for (const [engineId, entry] of Object.entries(entries)) {
    if (engineId === CATALOG_DIR) throw new Error(`"${CATALOG_DIR}" está reservado para las fixtures de catálogo.`);
    if (entry.module.manifest.id !== engineId) throw new Error(`El escenario ${engineId} apunta al motor ${entry.module.manifest.id}.`);
    for (const scenario of entry.scenarios) {
      const path = `${engineId}/${scenario.name}.json`;
      if (files.has(path)) throw new Error(`Escenario duplicado: ${path}`);
      files.set(path, toCanonicalJson(runScenario(entry.module, scenario)));
    }
    files.set(`${engineId}/config-cases.json`, toCanonicalJson(runConfigCases(entry.module, entry.configCases)));
  }
  return files;
}

/** Fixtures de motor presentes en disco (excluye catalog/). */
function listFixturesOnDisk(outDir: string): string[] {
  let engineDirs: string[];
  try {
    engineDirs = readdirSync(outDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== CATALOG_DIR).map((entry) => entry.name);
  } catch {
    return [];
  }
  return engineDirs.flatMap((engineId) => readdirSync(join(outDir, engineId)).filter((name) => name.endsWith('.json')).map((name) => `${engineId}/${name}`));
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function checkFixtures(outDir: string, files: ReadonlyMap<string, string>): string[] {
  const differing = [...files].filter(([path, content]) => readOrNull(join(outDir, path)) !== content).map(([path]) => path);
  const stale = listFixturesOnDisk(outDir).filter((path) => !files.has(path));
  return [...differing, ...stale];
}

export function writeFixtures(outDir: string, files: ReadonlyMap<string, string>): { written: number; removed: string[] } {
  const removed = listFixturesOnDisk(outDir).filter((path) => !files.has(path));
  for (const path of removed) rmSync(join(outDir, path));
  for (const [path, content] of files) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), content);
  }
  return { written: files.size, removed };
}

function main(argv: readonly string[]): number {
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  if (!out) {
    console.error('Uso: tsx packages/shared/golden/runner.ts [--check] --out <dir>');
    return 2;
  }
  const outDir = resolve(out);
  const files = renderFixtures();
  if (argv.includes('--check')) {
    const differing = checkFixtures(outDir, files);
    if (differing.length === 0) return 0;
    for (const path of differing) console.error(`Fixture dorada desactualizada: ${join(out, path)}`);
    console.error('Ejecuta npm run golden:export');
    return 1;
  }
  const { written, removed } = writeFixtures(outDir, files);
  for (const path of removed) console.log(`Eliminada fixture sin escenario: ${join(out, path)}`);
  console.log(`Escritas ${written} fixtures doradas en ${out}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
