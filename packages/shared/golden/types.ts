// Formato de las fixtures doradas (constraint 2 del plan de la etapa 2A). El replayer Java
// (backend/src/test) lee exactamente estas formas y compara presencia de claves de forma estricta:
// una clave ausente aquí debe estar ausente allí, por eso el runner nunca inventa claves.
import type {
  GameAssetResolution, GameLifecycle, GamePlayer, GameResults, PokemonVisualAsset, SubjectiveCategory, TcgComparableCard,
  WouldYouRatherPromptPair,
} from '../dist/index.js';

export type GoldenStep =
  | { kind: 'action'; playerId: string; action: unknown; now: number }
  | { kind: 'timeout'; now: number }
  /** Sustituye `context.players` por completo. Si el motor no implementa `handlePresenceChange`, el estado no cambia. */
  | { kind: 'presence'; players: GamePlayer[]; now: number }
  /** Llama a `resolveAsset` (si el motor lo implementa) sin cambiar el estado. */
  | { kind: 'asset'; assetToken: string; roundNumber: number; assetId: string; now: number };

/**
 * Contexto opcional del escenario. Cada clave solo llega a `GameContext` si el escenario la trae (ausente ≠ vacío).
 * `pokemonVisuals`/`pokemonAudio` se indexan por id de Pokémon en el orden de la fixture.
 */
export interface GoldenContextData {
  hostCustomCategories?: SubjectiveCategory[];
  hostWouldYouRatherPrompts?: WouldYouRatherPromptPair[];
  pokemonVisuals?: Record<string, PokemonVisualAsset>;
  pokemonAudio?: Record<string, { latest?: string; legacy?: string }>;
  /** Cartas ya comparables; `cardsFor` filtra por sets, rarezas y precio (no por generación: la carta no la trae). */
  tcgCards?: TcgComparableCard[];
}

/**
 * Paleta por id de Pokémon que se superpone a las filas del catálogo antes de construirlo (TS y Java por igual). Las
 * paletas las calcula el data-sync y el exportador de catálogo las borra, así que los motores que las leen
 * (`pokemon-palette-guess`) las traen en el escenario. Se copian tal cual, sin la validación del cargador de Node.
 */
export type GoldenCatalogPatch = Record<string, { palette: string[]; paletteWeights: number[] }>;

export interface GoldenScenario extends GoldenContextData {
  name: string;
  seed: number;
  /** Id de `backend/src/test/resources/golden/catalog/<id>.json`. */
  catalog: string;
  /** Solo si el escenario la trae; cada id debe existir en el catálogo. */
  catalogPatch?: GoldenCatalogPatch;
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
 * Si el motor lanza (también al calcular el snapshot), el paso es `{ threw: message }` sin snapshot y el escenario se detiene.
 * Como en producción, la acción cruda se valida con `actionSchema` antes de `handleAction`: si no valida, el paso es
 * `{ invalidAction: true }` (sin snapshot), el escenario se detiene y `handleAction` recibe la acción ya parseada.
 */
export type GoldenStepResult =
  | { accepted?: boolean; error?: string; snapshot: GoldenSnapshot }
  /** Paso `asset`: sin snapshot. Un `string` del motor se normaliza a `{ source, transform: 'ORIGINAL' }`. */
  | { resolution: GameAssetResolution | null }
  | { threw: string }
  | { invalidAction: true };

export interface GoldenFixture extends GoldenContextData {
  engineId: string;
  scenario: string;
  seed: number;
  catalog: string;
  catalogPatch?: GoldenCatalogPatch;
  players: GamePlayer[];
  config: unknown;
  startNow?: number;
  roomCode?: string;
  steps: GoldenStep[];
  expected: {
    configNormalized: unknown;
    initial: GoldenSnapshot;
    afterStart: GoldenSnapshot;
    afterSteps: GoldenStepResult[];
    /** `getResults(state)` solo si el estado final está terminado y ningún paso lanzó. */
    results?: GameResults;
  };
  /** Índice del paso que lanzó o cuya acción no validó; los pasos posteriores no se ejecutan. */
  stoppedAt?: number;
}

/** Entrada de `<engineId>/config-cases.json`, resultado de `configSchema.safeParse(input)`. */
export type ConfigCase =
  | { input: unknown; valid: true; normalized: unknown }
  | { input: unknown; valid: false };
