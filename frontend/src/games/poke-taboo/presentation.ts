import type { GamePhase, GameResults, PokeTabooAttempt, PokeTabooHint, PokeTabooPlayerState, PokeTabooPublicState, PokeTabooRoundResult } from '@pokemon-universe/shared/public';
import { normalizeTabooText } from '@pokemon-universe/shared/public';
import type { PhaseStep } from '../../room/social-kit';

/**
 * Textos y lógica pura de la pantalla de Poké Taboo (Arcade DS F7): la insignia del turno, las palabras prohibidas y su
 * comprobación antes de enviar, el orden de turnos en texto, el título, la región viva, el veredicto de la revelación y
 * la línea de métricas de los resultados. Sin React, para probarla.
 */

/** Máximo de una pista (el mismo que valida el motor). */
export const TABOO_HINT_MAX = 180;
/** Máximo de pistas por turno (`POKE_TABOO_MAX_HINTS` del motor). */
export const TABOO_MAX_HINTS = 24;

export const TABOO_STEPS: readonly PhaseStep[] = [
  { key: 'describe', label: 'Describir y adivinar' },
  { key: 'reveal', label: 'Revelación' },
];

/** Paso actual del carril de fases: el turno o su revelación (`null` fuera de ellos). */
export function tabooCurrentStep(phase: GamePhase): string | null {
  if (phase === 'ROUND_ACTIVE') return 'describe';
  if (phase === 'ROUND_RESULTS') return 'reveal';
  return null;
}

/** Insignia de la placa: «Turno 3 de 6 · Vuelta 1 de 2». */
export function tabooRoundLabel(game: Pick<PokeTabooPublicState, 'roundNumber' | 'totalRounds' | 'lapNumber' | 'totalLaps'>): string {
  return `Turno ${game.roundNumber} de ${game.totalRounds} · Vuelta ${game.lapNumber} de ${game.totalLaps}`;
}

const FORM_SUFFIX = /-(alola|galar|hisui|paldea)$/;
const TAUROS_BREED = /^tauros-paldea-(combat|blaze|aqua)-breed$/;
const capitalize = (value: string) => value.replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());

/** Una palabra prohibida: lo que se enseña y cómo se compara (el alias normalizado, como el motor). */
interface ForbiddenAlias { display: string; alias: string }

/**
 * Lo prohibido según el motor (`tabooPokemonAliases`): el nombre, el id con espacios y el id sin la forma regional. Los
 * nombres en otros idiomas solo los conoce el servidor (también los rechaza).
 */
function forbiddenAliases(pokemon: { id: string; name: string }): ForbiddenAlias[] {
  const base = pokemon.id.replace(FORM_SUFFIX, '').replace(TAUROS_BREED, 'tauros').replace(/-/g, ' ');
  const entries: ForbiddenAlias[] = [
    { display: pokemon.name, alias: normalizeTabooText(pokemon.name) },
    { display: pokemon.name, alias: normalizeTabooText(pokemon.id.replace(/-/g, ' ')) },
    { display: capitalize(base), alias: normalizeTabooText(base) },
  ];
  const seen = new Set<string>();
  return entries.filter((entry) => entry.alias && !seen.has(entry.alias) && seen.add(entry.alias));
}

/**
 * Palabras prohibidas que ve quien describe: el nombre del Pokémon y, si el id lleva forma regional, el nombre base
 * («Vulpix de Alola» → también «Vulpix»). El motor no tiene otra lista: no se inventan palabras.
 */
export function tabooForbiddenWords(pokemon: { id: string; name: string }): string[] {
  const words: string[] = [];
  for (const { display } of forbiddenAliases(pokemon)) if (!words.some((word) => normalizeTabooText(word) === normalizeTabooText(display))) words.push(display);
  return words;
}

/**
 * Comprobación previa de una pista (la misma regla que `containsTabooPokemonName` del motor, con lo que sabe el cliente):
 * la palabra prohibida que contiene, o `null`. Compara sin tildes ni mayúsculas, por palabras y también con los espacios
 * quitados («lu cario» también cuenta). El servidor sigue siendo quien decide.
 */
export function tabooHintProblem(text: string, pokemon: { id: string; name: string } | null): string | null {
  if (!pokemon) return null;
  const normalized = normalizeTabooText(text);
  if (!normalized) return null;
  const compact = normalized.replace(/\s/g, '');
  const hit = forbiddenAliases(pokemon).find(({ alias }) => ` ${normalized} `.includes(` ${alias} `) || compact.includes(alias.replace(/\s/g, '')));
  return hit?.display ?? null;
}

/** Mensaje bajo el campo cuando la pista contiene una palabra prohibida. */
export const forbiddenHintMessage = (word: string) => `Tu pista contiene «${word}», que está prohibida: cámbiala para enviarla.`;

/** Estado de un jugador en el orden de turnos, en texto. */
export type TabooTurnStatus = 'describing' | 'described' | 'next' | 'done' | 'pending';

/**
 * Dónde está cada jugador en el orden de turnos de la vuelta: describe ahora (`describing`; en la revelación,
 * `described`), le tocará después (`next` es el siguiente), o ya describió en esta vuelta (`done`).
 */
export function tabooTurnStatus(game: Pick<PokeTabooPublicState, 'phase' | 'roundNumber' | 'descriptorOrder' | 'descriptorId' | 'nextDescriptorId' | 'lastRound'>, playerId: string): TabooTurnStatus {
  const describer = game.phase === 'ROUND_RESULTS' ? game.lastRound?.descriptorId ?? game.descriptorId : game.descriptorId;
  if (playerId === describer) return game.phase === 'ROUND_RESULTS' ? 'described' : 'describing';
  if (playerId === game.nextDescriptorId) return 'next';
  const size = game.descriptorOrder.length;
  const turnInLap = size ? (Math.max(1, game.roundNumber) - 1) % size : 0;
  const index = game.descriptorOrder.indexOf(playerId);
  return index >= 0 && index < turnInLap ? 'done' : 'pending';
}

export const TURN_STATUS_TEXT: Record<TabooTurnStatus, string> = {
  describing: 'Describe ahora',
  described: 'Describió',
  next: 'Siguiente',
  done: 'Ya describió',
  pending: 'Le toca después',
};

/** Rol en el turno: describe, adivina u observa (sin estado: esperando al servidor). */
export type TabooRole = 'describer' | 'guesser' | 'watcher' | 'waiting';

export function tabooRole(player: PokeTabooPlayerState | null): TabooRole {
  if (!player) return 'waiting';
  if (player.role === 'DESCRIPTOR') return 'describer';
  if (player.role === 'GUESSER') return 'guesser';
  return 'watcher';
}

/** `h1` corto de la placa de la ronda. */
export function tabooHeading({ phase, role, describerName, result }: { phase: GamePhase; role: TabooRole; describerName: string | null; result: PokeTabooRoundResult | null }): string {
  if (result) return `¡Era ${result.pokemon.name}!`;
  if (phase !== 'ROUND_ACTIVE' || !describerName) return 'Preparando turno…';
  if (role === 'describer') return 'Describe tu Pokémon';
  if (role === 'guesser') return `¿Qué Pokémon describe ${describerName}?`;
  return `${describerName} está describiendo`;
}

const attempts = (count: number) => `${count} ${count === 1 ? 'intento' : 'intentos'}`;

/** Resumen de la revelación (también para la región viva): quién acertó y en cuántos intentos, o que nadie lo adivinó. */
export function tabooRevealSummary(result: PokeTabooRoundResult, nameOf: (id: string) => string): string {
  if (!result.winnerId) return `Nadie lo adivinó: era ${result.pokemon.name}.`;
  return `${nameOf(result.winnerId)} acertó ${result.pokemon.name} en ${attempts(result.winnerAttemptCount ?? 1)}.`;
}

/**
 * Texto de la única región viva: el comienzo del turno, la pista nueva (los que adivinan la oyen entera), el fallo
 * propio, la palabra prohibida al escribir y la revelación. Lo más reciente manda (pista o fallo, por su hora).
 */
export function tabooAnnouncement({ phase, roundNumber, role, describerName, secretName, hints, ownLast, problem, result, nameOf }: {
  phase: GamePhase;
  roundNumber: number;
  role: TabooRole;
  describerName: string | null;
  /** Solo quien describe (de su estado propio). */
  secretName: string | null;
  hints: readonly PokeTabooHint[];
  ownLast: PokeTabooAttempt | null;
  /** Palabra prohibida en la pista que se está escribiendo. */
  problem: string | null;
  result: PokeTabooRoundResult | null;
  nameOf: (id: string) => string;
}): string {
  if (result) return `Turno ${roundNumber} terminado. ${tabooRevealSummary(result, nameOf)}`;
  if (phase !== 'ROUND_ACTIVE' || !describerName) return '';
  if (role === 'describer' && problem) return forbiddenHintMessage(problem);
  const lastHint = hints.at(-1) ?? null;
  if (ownLast && (!lastHint || ownLast.attemptedAt >= lastHint.sentAt)) return `${ownLast.guessedPokemon.name} no era. Nuevo intento en un segundo.`;
  if (lastHint) return role === 'describer' ? `Pista ${lastHint.id} enviada.` : `Pista ${lastHint.id} de ${describerName}: ${lastHint.text}`;
  if (role === 'describer') return `Turno ${roundNumber}: te toca describir${secretName ? ` a ${secretName}` : ''}. No digas ni escribas su nombre.`;
  if (role === 'guesser') return `Turno ${roundNumber}: describe ${describerName}. Busca el Pokémon cuando lo sepas.`;
  return `Turno ${roundNumber}: describe ${describerName}.`;
}

/** Veredicto propio en la placa de la revelación. */
export interface TabooVerdict { tone: 'ok' | 'bad' | 'info'; text: string; points: number }

export function tabooVerdict(result: PokeTabooRoundResult, selfId: string, participating: boolean): TabooVerdict {
  if (result.winnerId === selfId) return { tone: 'ok', text: `¡Lo adivinaste en ${attempts(result.winnerAttemptCount ?? 1)}!`, points: result.guesserPoints };
  if (result.descriptorId === selfId) {
    return result.winnerId
      ? { tone: 'ok', text: 'Tu descripción funcionó', points: result.descriptorPoints }
      : { tone: 'bad', text: 'Nadie adivinó tu Pokémon', points: 0 };
  }
  if (!participating) return { tone: 'info', text: 'Estás observando', points: 0 };
  return result.winnerId ? { tone: 'bad', text: 'Otro jugador lo adivinó antes', points: 0 } : { tone: 'bad', text: 'Nadie lo adivinó', points: 0 };
}

type Stats = GameResults['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);

/**
 * Línea de métricas de un jugador en los resultados: adivinados, al primer intento, turnos de descriptor con acierto y
 * los puntos por adivinar y por describir.
 */
export function tabooStatsLine(stats: Stats): string {
  const guessed = num(stats, 'guessedPokemon');
  return [
    `${guessed} ${guessed === 1 ? 'adivinado' : 'adivinados'}`,
    `${num(stats, 'firstTry')} al primer intento`,
    `${num(stats, 'descriptorSuccesses')}/${num(stats, 'descriptorRounds')} turnos describiendo con acierto`,
    `+${num(stats, 'pointsFromGuessing')} adivinando`,
    `+${num(stats, 'pointsFromDescribing')} describiendo`,
  ].join(' · ');
}
