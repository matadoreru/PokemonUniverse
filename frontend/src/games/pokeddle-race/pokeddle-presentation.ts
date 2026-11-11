import type { GamePhase, PokeddleBoardRow, PokeddleClueKey, PokeddleFeedbackEntry, PokeddlePokemonReveal, PokeddlePublicBoard, PokeddleRacePlayerState } from '@pokemon-universe/shared/public';
import { POKEMON_TYPE_LABELS } from '@pokemon-universe/shared/public';
import { plural } from '../../lib/format';

/** Lo que dice una casilla del tablero: acierto, parcial, fallo, o fallo con el objetivo por encima o por debajo. */
export type PokeddleFeedbackSemantic = 'higher' | 'lower' | 'match' | 'partial' | 'none';

export interface PokeddleColumn {
  key: PokeddleClueKey;
  /** Cabecera corta de la columna (y etiqueta de la casilla en el móvil). */
  label: string;
  /** Nombre completo (texto para lectores y `title` de la cabecera). */
  fullLabel: string;
  /** Peso de la columna en la rejilla (los tipos y las habilidades necesitan más ancho). */
  wide: boolean;
}

export interface PokeddleFeedbackPresentation {
  /** Valor completo del intento (texto para lectores). */
  value: string;
  /** Valor corto que cabe en la casilla. */
  short: string;
  /** Resultado en una palabra, a la vista («Mayor», «Coincide»…). */
  result: string;
  /** Resultado en una frase, para lectores («El objetivo es mayor»). */
  accessibleResult: string;
  semantic: PokeddleFeedbackSemantic;
  /** Tono del catálogo: verde el acierto, amarillo el parcial, rojo el fallo. */
  tone: 'ok' | 'warn' | 'bad';
}

const definitions: Record<PokeddleClueKey, Omit<PokeddleColumn, 'key'>> = {
  generation: { label: 'Gen', fullLabel: 'Generación', wide: false },
  dexNumber: { label: 'Dex', fullLabel: 'Número Pokédex', wide: false },
  types: { label: 'Tipos', fullLabel: 'Tipos', wide: true },
  typeCount: { label: 'N.º tipos', fullLabel: 'Número de tipos', wide: false },
  hp: { label: 'PS', fullLabel: 'Puntos de salud', wide: false },
  attack: { label: 'Atq', fullLabel: 'Ataque', wide: false },
  defense: { label: 'Def', fullLabel: 'Defensa', wide: false },
  specialAttack: { label: 'At. Esp', fullLabel: 'Ataque especial', wide: false },
  specialDefense: { label: 'Def. Esp', fullLabel: 'Defensa especial', wide: false },
  speed: { label: 'Vel', fullLabel: 'Velocidad', wide: false },
  baseStatTotal: { label: 'Total', fullLabel: 'Total de estadísticas', wide: false },
  height: { label: 'Altura (m)', fullLabel: 'Altura', wide: false },
  weight: { label: 'Peso (kg)', fullLabel: 'Peso', wide: false },
  evolutionStage: { label: 'Evol.', fullLabel: 'Etapa evolutiva', wide: false },
  legendaryStatus: { label: 'Categoría', fullLabel: 'Legendario o mítico', wide: false },
  color: { label: 'Color', fullLabel: 'Color principal', wide: false },
  abilities: { label: 'Habilidades', fullLabel: 'Habilidades', wide: true },
};

const legendaryLabels: Record<string, string> = { NORMAL: 'Normal', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico' };

const semanticText: Record<PokeddleFeedbackSemantic, Pick<PokeddleFeedbackPresentation, 'result' | 'accessibleResult' | 'tone'>> = {
  higher: { result: 'Mayor', accessibleResult: 'Distinto: el secreto es mayor', tone: 'bad' },
  lower: { result: 'Menor', accessibleResult: 'Distinto: el secreto es menor', tone: 'bad' },
  match: { result: 'Igual', accessibleResult: 'Igual', tone: 'ok' },
  partial: { result: 'Parcial', accessibleResult: 'Parcial: coincide en parte', tone: 'warn' },
  none: { result: 'Distinto', accessibleResult: 'Distinto', tone: 'bad' },
};

/** Leyenda del tablero, en el orden en que se explica (el vacío la usa para enseñar a jugar). */
export const POKEDDLE_LEGEND: ReadonlyArray<{ semantic: PokeddleFeedbackSemantic; label: string }> = [
  { semantic: 'match', label: 'Igual' },
  { semantic: 'partial', label: 'Parcial' },
  { semantic: 'none', label: 'Distinto' },
  { semantic: 'higher', label: 'El secreto es mayor' },
  { semantic: 'lower', label: 'El secreto es menor' },
];

export function getPokeddleColumns(clues: readonly PokeddleClueKey[]): PokeddleColumn[] {
  return clues.map((key) => ({ key, ...definitions[key] }));
}

export function formatPokemonWords(value: string): string {
  return value.split('-').map((word) => (word[0]?.toUpperCase() ?? '') + word.slice(1)).join(' ');
}

function numericValue(key: PokeddleClueKey, value: number): string {
  if (key === 'height') return `${(value / 10).toFixed(1)} m`;
  if (key === 'weight') return `${(value / 10).toFixed(1)} kg`;
  if (key === 'dexNumber') return `#${String(value).padStart(3, '0')}`;
  return String(value);
}

function comparisonSemantic(result: string): PokeddleFeedbackSemantic {
  if (result === 'HIGHER') return 'higher';
  if (result === 'LOWER') return 'lower';
  if (result === 'PARTIAL') return 'partial';
  if (result === 'NONE') return 'none';
  return 'match';
}

export function formatPokeddleFeedback(key: PokeddleClueKey, entry: PokeddleFeedbackEntry): PokeddleFeedbackPresentation {
  const semantic = comparisonSemantic(entry.result);
  const text = semanticText[semantic];
  let value: string;
  let short: string | null = null;
  let result = text.result;
  let accessibleResult = text.accessibleResult;

  if (entry.kind === 'NUMERIC') {
    value = numericValue(key, entry.value);
    // La unidad va en la cabecera de la columna («Peso (kg)»): la casilla solo lleva la cifra.
    if (key === 'height' || key === 'weight') short = (entry.value / 10).toFixed(1);
  }
  else if (entry.kind === 'TYPES') value = entry.value.map((type) => POKEMON_TYPE_LABELS[type] ?? formatPokemonWords(type)).join(' / ');
  else if (entry.kind === 'EVOLUTION') {
    const single = entry.value.stages <= 1;
    value = single ? 'Sin evolución · No tiene etapas evolutivas' : `Etapa ${entry.value.stage}/${entry.value.stages}`;
    short = single ? 'Única' : `${entry.value.stage}/${entry.value.stages}`;
    if (semantic === 'partial') accessibleResult = 'Parcial: misma etapa, distinto número de etapas';
  } else if (entry.kind === 'ABILITIES') {
    value = entry.value.map(formatPokemonWords).join(', ');
    result = entry.matches ? `${entry.matches} en común` : 'Distinto';
  } else {
    value = key === 'legendaryStatus' ? legendaryLabels[entry.value] ?? entry.value : formatPokemonWords(entry.value);
  }

  return { value, short: short ?? value, result, accessibleResult, semantic, tone: text.tone };
}

/** Pistas que coinciden del todo en un intento (para el anuncio de la ronda). */
export function pokeddleMatchCount(row: PokeddleBoardRow): number {
  return Object.values(row.feedback ?? {}).filter((entry) => entry.result === 'MATCH' || entry.result === 'EXACT').length;
}

/** El intento más reciente con respuesta (el que se marca como «Último»). */
export function latestGuessRound(rows: readonly { round: number; status: 'GUESS' | 'NO_GUESS' }[]): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) if (rows[index]?.status === 'GUESS') return rows[index]!.round;
  return null;
}

/**
 * Privacidad: el Pokémon secreto de un tablero solo se pinta si ese jugador ya lo encontró o la partida terminó (es lo
 * que proyecta el servidor). Aunque llegue otra cosa, la pantalla no lo lee por ninguna otra vía.
 */
export function pokeddleVisibleSecret(board: Pick<PokeddlePublicBoard, 'solved' | 'revealedPokemon'>, phase: GamePhase): PokeddlePokemonReveal | null {
  return board.solved || phase === 'GAME_RESULTS' ? board.revealedPokemon : null;
}

export const pokeddleAttemptsText = (count: number) => plural(count, 'intento', 'intentos');

/** Estado de un rival en la columna lateral: solo lo que hoy es público (resuelto con su Pokémon, intento enviado, cuentas). */
export interface PokeddleRivalStatus {
  kind: 'solved' | 'answered' | 'thinking' | 'waiting';
  label: string;
  detail: string;
}

export function pokeddleRivalStatus(board: PokeddlePublicBoard, phase: GamePhase, answered: boolean): PokeddleRivalStatus {
  const detail = `${pokeddleAttemptsText(board.validGuesses)} · ${board.missedRounds} sin responder`;
  const secret = pokeddleVisibleSecret(board, phase);
  if (board.solved) return { kind: 'solved', label: `Resuelto · ${secret?.name ?? 'Pokémon'}`, detail: `Ronda ${board.solvedRound ?? '—'} · ${pokeddleAttemptsText(board.validGuesses)}` };
  if (phase !== 'ROUND_ACTIVE') return { kind: 'waiting', label: 'En carrera', detail };
  return answered ? { kind: 'answered', label: 'Intento enviado', detail } : { kind: 'thinking', label: 'Pensando…', detail };
}

/** Placa inferior: buscar, intento enviado, encontrado, la ronda cerrada, observar, entrar tarde o esperar. */
export type PokeddlePlateKind = 'guess' | 'submitted' | 'solved' | 'reveal' | 'watching' | 'out' | 'waiting';

export function pokeddlePlateKind(phase: GamePhase, player: PokeddleRacePlayerState | null, hasBoard: boolean): PokeddlePlateKind {
  if (!player || !hasBoard) return 'watching';
  if (player.solved) return 'solved';
  if (phase === 'ROUND_RESULTS') return 'reveal';
  if (phase !== 'ROUND_ACTIVE') return 'waiting';
  if (player.hasGuessedThisRound) return 'submitted';
  return player.canGuess ? 'guess' : 'out';
}

/** Clave del foco: al encontrar el Pokémon y al cerrar cada ronda el foco va al título de la placa (no cae al `body`). */
export function pokeddleFocusKey(kind: PokeddlePlateKind, roundNumber: number): string | null {
  if (kind === 'solved') return 'solved';
  if (kind === 'reveal' || kind === 'submitted') return `${kind}-${roundNumber}`;
  return null;
}

/**
 * Texto de la única región viva: el intento enviado, cómo fue la ronda propia, el Pokémon encontrado y qué rivales
 * acaban de encontrar el suyo. Cada cosa una vez.
 */
export function pokeddleAnnouncement({ kind, roundNumber, own, submittedName, rivalsSolved }: {
  kind: PokeddlePlateKind;
  roundNumber: number;
  own: PokeddlePublicBoard | null;
  submittedName?: string | null;
  /** Rivales que encontraron su Pokémon al cerrar esta ronda (nombre del jugador y del Pokémon). */
  rivalsSolved: ReadonlyArray<{ player: string; pokemon: string | null }>;
}): string {
  const rivals = rivalsSolved.map(({ player, pokemon }) => `${player} ha encontrado su Pokémon${pokemon ? `: ${pokemon}` : ''}.`).join(' ');
  const join = (text: string) => [text, rivals].filter(Boolean).join(' ');
  if (kind === 'submitted') return `Intento enviado${submittedName ? `: ${submittedName}` : ''}. Esperando al resto.`;
  if (kind === 'solved' && own?.solved) {
    const solvedNow = own.solvedRound === roundNumber;
    return join(solvedNow ? `¡Pokémon encontrado! Era ${own.revealedPokemon?.name ?? 'tu Pokémon'}, en la ronda ${roundNumber}.` : '');
  }
  if (kind === 'reveal' && own) {
    const row = own.rows.find((entry) => entry.round === roundNumber);
    if (!row || row.status === 'NO_GUESS') return join(`Ronda ${roundNumber} cerrada: sin respuesta.`);
    const columns = Object.keys(row.feedback ?? {}).length;
    return join(`Ronda ${roundNumber} cerrada: ${row.guessedPokemon?.name ?? 'tu intento'} coincide en ${pokeddleMatchCount(row)} de ${columns} pistas.`);
  }
  if (kind === 'reveal' || kind === 'solved' || kind === 'watching') return rivals;
  return '';
}
