import {
  defaultAbsurdPokedexConfig, defaultGuessFromStatsConfig, defaultHigherLowerConfig, defaultLearnsetGuessConfig, defaultMostLikelyToConfig,
  defaultOneOfUsIsFakeConfig, defaultPokeddleRaceConfig, defaultPokedexDistanceConfig, defaultPokedexEntryGuessConfig, defaultPokemonBingoConfig,
  defaultPokemonBluffAuctionConfig, defaultPokemonConnectionsConfig, defaultPokemonCryQuizConfig, defaultPokemonImpostorConfig,
  defaultPokemonPaletteGuessConfig, defaultPokemonRedFlagConfig, defaultPokemonTeamAuctionConfig, defaultPokemonTriviaConfig, defaultPokeTabooConfig,
  defaultSecretRankingConfig, defaultShinyVoteConfig, defaultSketchmonConfig, defaultTcgHigherLowerConfig, defaultTypeDuelConfig,
  defaultUnownTranslatorConfig, defaultWhoAmIConfig, defaultWhoIsWhoPokemonConfig, defaultWhosThatPokemonConfig, defaultWouldYouRatherConfig,
  defaultZoomedPokemonConfig,
} from '@pokemon-universe/shared/public';

/** Los ritmos del control «Ritmo», en su orden. */
export const PACE_IDS = ['FAST', 'CLASSIC', 'EXPERT'] as const;
export type PaceId = (typeof PACE_IDS)[number];

export const PACE_LABELS: Record<PaceId, string> = { FAST: 'Rápido', CLASSIC: 'Clásico', EXPERT: 'Experto' };

const PACE_HINTS: Record<PaceId, string> = {
  FAST: 'Partida corta: menos rondas y menos tiempo.',
  CLASSIC: 'Los valores por defecto del juego.',
  EXPERT: 'Más rondas y menos tiempo para pensar.',
};

export const CUSTOM_PACE_HINT = 'Personalizado: has cambiado a mano algún ajuste del ritmo.';

/**
 * Los ritmos de un juego: cada uno es un parche sobre las mismas claves (`keys`), que se aplica encima de la
 * configuración sin tocar el resto (generaciones, fuentes, interruptores…). Clásico son esas claves del `defaultConfig`.
 * Ninguno toca `mode`: los modos se marcan aparte («Modos que se juegan») y cambiar el modo borraría los marcados.
 */
export interface GamePacePresets {
  keys: readonly string[];
  presets: Record<PaceId, Readonly<Record<string, unknown>>>;
  hints: Record<PaceId, string>;
}

function pace<T extends object, K extends keyof T & string>(
  defaults: T, keys: readonly K[], fast: Pick<T, K>, expert: Pick<T, K>, hints: Partial<Record<PaceId, string>> = {},
): GamePacePresets {
  const classic = Object.fromEntries(keys.map((key) => [key, defaults[key]]));
  return { keys, presets: { FAST: fast, CLASSIC: classic, EXPERT: expert }, hints: { ...PACE_HINTS, ...hints } };
}

const TIME_ONLY = { FAST: 'Menos tiempo por turno.', EXPERT: 'El mínimo de tiempo: hay que decidir rápido.' };

/**
 * Los ritmos de cada juego del registro; `null` en los que no tienen tres ritmos distintos. Los valores caben en los
 * esquemas Zod y en las rejillas de cada panel (pasos de los deslizadores y opciones de los `Segmented`); lo vigila
 * `pace-presets.test.ts`. Rápido acorta la partida; Experto suele subir las rondas y bajar el tiempo, o la dificultad.
 */
export const PACE_PRESETS: Readonly<Record<string, GamePacePresets | null>> = {
  'absurd-pokedex': pace(defaultAbsurdPokedexConfig, ['rounds', 'writeSeconds', 'voteSeconds'],
    { rounds: 3, writeSeconds: 45, voteSeconds: 20 }, { rounds: 8, writeSeconds: 45, voteSeconds: 20 }),
  'guess-from-stats': pace(defaultGuessFromStatsConfig, ['rounds', 'roundSeconds'], { rounds: 5, roundSeconds: 20 }, { rounds: 15, roundSeconds: 20 }),
  'higher-lower': pace(defaultHigherLowerConfig, ['rounds', 'roundSeconds', 'difficulty'],
    { rounds: 5, roundSeconds: 15, difficulty: 'NORMAL' }, { rounds: 20, roundSeconds: 15, difficulty: 'HARD' },
    { EXPERT: 'Más rondas, menos tiempo y dificultad difícil.' }),
  'learnset-guess': pace(defaultLearnsetGuessConfig, ['rounds', 'roundSeconds'], { rounds: 5, roundSeconds: 45 }, { rounds: 15, roundSeconds: 45 }),
  'most-likely-to': pace(defaultMostLikelyToConfig, ['rounds', 'selectionSeconds', 'votingSeconds'],
    { rounds: 3, selectionSeconds: 30, votingSeconds: 20 }, { rounds: 8, selectionSeconds: 30, votingSeconds: 20 }),
  'one-of-us-is-fake': pace(defaultOneOfUsIsFakeConfig, ['rounds', 'selectionSeconds', 'discussionSeconds'],
    { rounds: 3, selectionSeconds: 20, discussionSeconds: 90 }, { rounds: 8, selectionSeconds: 20, discussionSeconds: 90 }),
  'poke-taboo': pace(defaultPokeTabooConfig, ['laps', 'roundSeconds'], { laps: 1, roundSeconds: 45 }, { laps: 2, roundSeconds: 45 },
    { FAST: 'Turnos más cortos.', EXPERT: 'Dos vueltas con turnos más cortos.' }),
  'pokeddle-race': pace(defaultPokeddleRaceConfig, ['maxRounds', 'roundSeconds'], { maxRounds: 8, roundSeconds: 15 }, { maxRounds: 6, roundSeconds: 10 },
    { FAST: 'Menos intentos y menos tiempo.', EXPERT: 'Aún menos intentos y el mínimo de tiempo.' }),
  // `pointsRounds` solo se juega en el modo Por puntos; Clásico acaba por eliminación.
  'pokedex-distance': pace(defaultPokedexDistanceConfig, ['pointsRounds', 'roundSeconds'], { pointsRounds: 5, roundSeconds: 15 }, { pointsRounds: 15, roundSeconds: 15 }),
  'pokedex-entry-guess': pace(defaultPokedexEntryGuessConfig, ['rounds', 'roundSeconds'], { rounds: 5, roundSeconds: 20 }, { rounds: 15, roundSeconds: 15 }),
  'pokemon-bingo': pace(defaultPokemonBingoConfig, ['width', 'height', 'durationSeconds', 'maxConditionsPerCell'],
    { width: 3, height: 3, durationSeconds: 90, maxConditionsPerCell: 1 }, { width: 4, height: 4, durationSeconds: 150, maxConditionsPerCell: 2 },
    { FAST: 'Menos tiempo para el mismo cartón.', EXPERT: 'Cartón 4×4 con dos condiciones por casilla.' }),
  'pokemon-bluff-auction': pace(defaultPokemonBluffAuctionConfig, ['rounds', 'bidSeconds', 'demonstrationSeconds'],
    { rounds: 5, bidSeconds: 15, demonstrationSeconds: 20 }, { rounds: 15, bidSeconds: 15, demonstrationSeconds: 20 }),
  'pokemon-connections': pace(defaultPokemonConnectionsConfig, ['rounds', 'roundSeconds'], { rounds: 3, roundSeconds: 90 }, { rounds: 8, roundSeconds: 90 }),
  'pokemon-cry-quiz': pace(defaultPokemonCryQuizConfig, ['rounds', 'roundSeconds'], { rounds: 5, roundSeconds: 15 }, { rounds: 15, roundSeconds: 15 }),
  'pokemon-impostor': pace(defaultPokemonImpostorConfig, ['clueSeconds', 'voteSeconds'], { clueSeconds: 10, voteSeconds: 15 }, { clueSeconds: 10, voteSeconds: 10 }, TIME_ONLY),
  'pokemon-palette-guess': pace(defaultPokemonPaletteGuessConfig, ['rounds', 'roundSeconds'], { rounds: 5, roundSeconds: 20 }, { rounds: 15, roundSeconds: 15 }),
  'pokemon-red-flag': pace(defaultPokemonRedFlagConfig, ['rounds', 'phaseSeconds'], { rounds: 3, phaseSeconds: 20 }, { rounds: 8, phaseSeconds: 20 }),
  'pokemon-team-auction': pace(defaultPokemonTeamAuctionConfig, ['bidSeconds'], { bidSeconds: 15 }, { bidSeconds: 10 }, TIME_ONLY),
  'pokemon-trivia': pace(defaultPokemonTriviaConfig, ['rounds', 'roundSeconds', 'difficulty'],
    { rounds: 5, roundSeconds: 15, difficulty: 'NORMAL' }, { rounds: 15, roundSeconds: 15, difficulty: 'HARD' },
    { EXPERT: 'Más preguntas, menos tiempo y dificultad difícil.' }),
  'secret-ranking': pace(defaultSecretRankingConfig, ['rounds', 'roundSeconds'], { rounds: 2, roundSeconds: 30 }, { rounds: 5, roundSeconds: 30 }),
  'shiny-vote': pace(defaultShinyVoteConfig, ['rounds', 'roundSeconds'], { rounds: 5, roundSeconds: 15 }, { rounds: 15, roundSeconds: 15 }),
  'sketchmon': pace(defaultSketchmonConfig, ['laps', 'roundSeconds'], { laps: 1, roundSeconds: 60 }, { laps: 2, roundSeconds: 60 },
    { FAST: 'Menos tiempo por dibujo.', EXPERT: 'Dos vueltas con menos tiempo por dibujo.' }),
  'tcg-higher-lower': pace(defaultTcgHigherLowerConfig, ['rounds', 'roundSeconds'], { rounds: 5, roundSeconds: 10 }, { rounds: 20, roundSeconds: 10 }),
  // Un solo ajuste de tiempo con mínimo de 10 s: Rápido y Experto serían el mismo; el propio selector ya es el ritmo.
  'type-chain': null,
  'type-duel': pace(defaultTypeDuelConfig, ['rounds', 'typeSelectSeconds', 'searchSeconds', 'coopSeconds'],
    { rounds: 5, typeSelectSeconds: 10, searchSeconds: 15, coopSeconds: 45 }, { rounds: 15, typeSelectSeconds: 10, searchSeconds: 15, coopSeconds: 45 }),
  'unown-translator': pace(defaultUnownTranslatorConfig, ['rounds', 'roundSeconds', 'hintSeconds'],
    { rounds: 3, roundSeconds: 45, hintSeconds: 4 }, { rounds: 8, roundSeconds: 45, hintSeconds: 9 },
    { FAST: 'Menos rondas y las letras salen antes.', EXPERT: 'Más rondas y las letras tardan más en salir.' }),
  'who-am-i': pace(defaultWhoAmIConfig, ['maxLaps', 'askSeconds', 'answerSeconds'],
    { maxLaps: 6, askSeconds: 30, answerSeconds: 15 }, { maxLaps: 15, askSeconds: 30, answerSeconds: 15 },
    { FAST: 'Menos vueltas y menos tiempo.', EXPERT: 'Más vueltas y menos tiempo para pensar.' }),
  'who-is-who-pokemon': pace(defaultWhoIsWhoPokemonConfig, ['rounds', 'turnSeconds'], { rounds: 10, turnSeconds: 30 }, { rounds: 20, turnSeconds: 30 }),
  'whos-that-pokemon': pace(defaultWhosThatPokemonConfig, ['rounds', 'roundSeconds'], { rounds: 5, roundSeconds: 15 }, { rounds: 15, roundSeconds: 10 }),
  'would-you-rather': pace(defaultWouldYouRatherConfig, ['rounds', 'roundSeconds'], { rounds: 3, roundSeconds: 30 }, { rounds: 8, roundSeconds: 30 }),
  'zoomed-pokemon': pace(defaultZoomedPokemonConfig, ['rounds', 'roundSeconds'], { rounds: 5, roundSeconds: 20 }, { rounds: 15, roundSeconds: 20 }),
};

/** Los ritmos de `gameId`, o `null` si no tiene. */
export function pacePresetsOf(gameId: string): GamePacePresets | null {
  return Object.hasOwn(PACE_PRESETS, gameId) ? PACE_PRESETS[gameId] ?? null : null;
}

/**
 * El ritmo que coincide con `config` en todas sus claves; `null` es «Personalizado» (también si falta alguna clave, como
 * en una configuración parcial) o un juego sin ritmos.
 */
export function paceOf(gameId: string, config: unknown): PaceId | null {
  const table = pacePresetsOf(gameId);
  if (!table || typeof config !== 'object' || config === null) return null;
  const values = config as Record<string, unknown>;
  return PACE_IDS.find((id) => table.keys.every((key) => Object.is(values[key], table.presets[id][key]))) ?? null;
}

/** `config` con las claves del ritmo `pace`; el resto se queda como estaba. */
export function applyPace(gameId: string, config: unknown, pace: PaceId): unknown {
  const table = pacePresetsOf(gameId);
  if (!table) return config;
  return { ...(typeof config === 'object' && config !== null ? config : {}), ...table.presets[pace] };
}
