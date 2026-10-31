// Exportador de fixtures doradas: ejecuta los motores TS de referencia con PRNG determinista y
// guarda cada proyección para que el replayer Java verifique la paridad.
//   tsx packages/shared/golden/runner.ts --out <dir>          escribe <dir>/<engineId>/*.json
//   tsx packages/shared/golden/runner.ts --check --out <dir>  compara sin escribir (exit 1 si difiere)
// Requiere los dist de shared y del servidor (ver scripts/export-golden-fixtures.mjs).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameAssetResolution, GameContext, MiniGameModule } from '../dist/index.js';
import { loadGoldenCatalog } from './catalog.js';
import { buildGoldenContext } from './context.js';
import { scenarios as defaultScenarios, type GoldenEngineEntry } from './scenarios/index.js';
import type { ConfigCase, GoldenContextData, GoldenFixture, GoldenScenario, GoldenSnapshot, GoldenStepResult } from './types.js';

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

/** Como `resolution()` de `game-image-cache.ts`: un `string` es la fuente sin transformar. */
function normalizeResolution(asset: string | GameAssetResolution | null | undefined): GameAssetResolution | null {
  if (asset === null || asset === undefined) return null;
  return typeof asset === 'string' ? { source: asset, transform: 'ORIGINAL' } : asset;
}

/** Datos de contexto que el escenario trae, en orden fijo; las claves ausentes no aparecen en la fixture. */
function contextData(scenario: GoldenScenario): GoldenContextData {
  return {
    ...(scenario.hostCustomCategories ? { hostCustomCategories: scenario.hostCustomCategories } : {}),
    ...(scenario.hostWouldYouRatherPrompts ? { hostWouldYouRatherPrompts: scenario.hostWouldYouRatherPrompts } : {}),
    ...(scenario.pokemonVisuals ? { pokemonVisuals: scenario.pokemonVisuals } : {}),
    ...(scenario.pokemonAudio ? { pokemonAudio: scenario.pokemonAudio } : {}),
    ...(scenario.tcgCards ? { tcgCards: scenario.tcgCards } : {}),
  };
}

export function runScenario(module: AnyModule, scenario: GoldenScenario): GoldenFixture {
  let context: GameContext = buildGoldenContext(scenario, loadGoldenCatalog(scenario.catalog, scenario.catalogPatch));
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
        // Como producción (rooms/manager.ts action()): la acción cruda pasa por actionSchema antes de handleAction.
        const parsed = module.actionSchema.safeParse(step.action);
        if (!parsed.success) {
          afterSteps.push({ invalidAction: true });
          stoppedAt = index;
          break;
        }
        const result = module.handleAction(state, step.playerId, parsed.data, context);
        state = result.state;
        afterSteps.push({ accepted: result.accepted, ...(result.error !== undefined ? { error: result.error } : {}), snapshot: snapshot(module, state, context) });
      } else if (step.kind === 'asset') {
        const request = { assetToken: step.assetToken, roundNumber: step.roundNumber, assetId: step.assetId };
        afterSteps.push({ resolution: normalizeResolution(module.resolveAsset?.(state, request, context)) });
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
    ...(scenario.catalogPatch ? { catalogPatch: scenario.catalogPatch } : {}),
    players: scenario.players,
    config: scenario.config,
    // GoldenReplayer los lee de la fixture: sin ellos Java arrancaría en 1000/GOLD01 aunque el escenario diga otra cosa.
    ...(scenario.startNow !== undefined ? { startNow: scenario.startNow } : {}),
    ...(scenario.roomCode !== undefined ? { roomCode: scenario.roomCode } : {}),
    ...contextData(scenario),
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

/**
 * JSON de fixture: semántica de JSON.stringify (undefined fuera, null dentro) y el orden de claves de JS (claves con
 * aspecto de entero ascendentes, el resto en orden de inserción del motor). El replayer Java compara ese orden.
 */
export function toCanonicalJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
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

/** Mensajes de `--check` cuando hay diferencias (vacío si todo coincide). */
export function checkFailureMessages(out: string, differing: readonly string[]): string[] {
  if (differing.length === 0) return [];
  return [...differing.map((path) => `Fixture dorada desactualizada: ${join(out, path)}`), 'Ejecuta npm run golden:export'];
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
    const messages = checkFailureMessages(out, checkFixtures(outDir, files));
    for (const message of messages) console.error(message);
    return messages.length === 0 ? 0 : 1;
  }
  const { written, removed } = writeFixtures(outDir, files);
  for (const path of removed) console.log(`Eliminada fixture sin escenario: ${join(out, path)}`);
  console.log(`Escritas ${written} fixtures doradas en ${out}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
