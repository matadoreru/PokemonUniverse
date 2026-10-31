// Formato de las fixtures doradas (constraint 2 del plan de la etapa 2A). El replayer Java
// (backend/src/test) lee exactamente estas formas y compara presencia de claves de forma estricta:
// una clave ausente aquí debe estar ausente allí, por eso el runner nunca inventa claves.
import type { GameLifecycle, GamePlayer, GameResults } from '../dist/index.js';

export type GoldenStep =
  | { kind: 'action'; playerId: string; action: unknown; now: number }
  | { kind: 'timeout'; now: number }
  /** Sustituye `context.players` por completo. Si el motor no implementa `handlePresenceChange`, el estado no cambia. */
  | { kind: 'presence'; players: GamePlayer[]; now: number };

export interface GoldenScenario {
  name: string;
  seed: number;
  /** Id de `backend/src/test/resources/golden/catalog/<id>.json`. */
  catalog: string;
  /** `players[0]` es el anfitrión (`context.hostId`). */
  players: GamePlayer[];
  /** Entrada cruda: se pasa por `configSchema.parse` igual que hace el coordinador de salas. */
  config: unknown;
  steps: GoldenStep[];
  /** `now` de `createInitialState` y `start`; 1000 por defecto. */
  startNow?: number;
  /** `context.roomCode`; `GOLD01` por defecto. */
  roomCode?: string;
}

export interface GoldenSnapshot {
  lifecycle: GameLifecycle;
  publicState: unknown;
  /** Una entrada por jugador de `context.players` en ese momento, con `getPlayerState`. */
  playerStates: Record<string, unknown>;
  finished: boolean;
}

/**
 * Resultado de un paso. `accepted` solo aparece en pasos `action`; `error` solo cuando
 * el resultado TS de `handleAction` lo trae (semántica JSON: nunca `error: null`).
 * Si el motor lanza, el paso es `{ threw: message }` sin snapshot y el escenario se detiene.
 */
export type GoldenStepResult =
  | { accepted?: boolean; error?: string; snapshot: GoldenSnapshot }
  | { threw: string };

export interface GoldenFixture {
  engineId: string;
  scenario: string;
  seed: number;
  catalog: string;
  players: GamePlayer[];
  config: unknown;
  steps: GoldenStep[];
  expected: {
    configNormalized: unknown;
    initial: GoldenSnapshot;
    afterStart: GoldenSnapshot;
    afterSteps: GoldenStepResult[];
    /** `getResults(state)` solo si el estado final está terminado y ningún paso lanzó. */
    results?: GameResults;
  };
  /** Índice del paso que lanzó; los pasos posteriores no se ejecutan. */
  stoppedAt?: number;
}

/** Entrada de `<engineId>/config-cases.json`, resultado de `configSchema.safeParse(input)`. */
export type ConfigCase =
  | { input: unknown; valid: true; normalized: unknown }
  | { input: unknown; valid: false };
