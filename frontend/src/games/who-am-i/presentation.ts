import type { WhoAmIAnswer, WhoAmIAnswerEntry, WhoAmIHistoryEntry, WhoAmIPokemon, WhoAmIPublicState } from '@pokemon-universe/shared/public';
import { WHO_AM_I_ANSWERS } from '@pokemon-universe/shared/public';

export const WHO_AM_I_NAME = '¿Quién soy?';

const ANSWER_LABELS: Readonly<Record<WhoAmIAnswer, string>> = { YES: 'Sí', NO: 'No', PARTLY: 'A medias', UNKNOWN: 'No lo sé' };

/** Texto de una respuesta en la web: «Sí», «No», «A medias» o «No lo sé». */
export function answerLabel(answer: WhoAmIAnswer): string {
  return ANSWER_LABELS[answer];
}

/** Cuántas veces sale cada respuesta, siempre con las cuatro claves (las que faltan, a 0). */
export function answerCounts(entries: readonly WhoAmIAnswerEntry[]): Record<WhoAmIAnswer, number> {
  const counts = Object.fromEntries(WHO_AM_I_ANSWERS.map((answer) => [answer, 0])) as Record<WhoAmIAnswer, number>;
  for (const entry of entries) counts[entry.answer] += 1;
  return counts;
}

/**
 * Título de la pantalla: en `ANSWERING`, la pregunta en curso (para todos); en tu `ASKING`, «Pregunta sobre tu
 * Pokémon»; si el turno es de otro, «Turno de X»; en tu `DECIDING`, la pregunta que acabas de hacer. Sin turno (al
 * empezar), el nombre del juego.
 */
export function turnHeadline(game: Pick<WhoAmIPublicState, 'turnPlayerId' | 'turnStep' | 'currentQuestion'>, selfId: string, nameOf: (id: string) => string): string {
  if (game.turnPlayerId === null || game.turnStep === null) return WHO_AM_I_NAME;
  if (game.turnStep === 'ANSWERING' && game.currentQuestion) return game.currentQuestion.text;
  if (game.turnPlayerId !== selfId) return `Turno de ${nameOf(game.turnPlayerId)}`;
  if (game.turnStep === 'ASKING') return 'Pregunta sobre tu Pokémon';
  return game.currentQuestion?.text ?? 'Pregunta sobre tu Pokémon';
}

/** Cuántas preguntas: «1 pregunta», «3 preguntas». */
export function questionsText(n: number): string {
  return `${n} ${n === 1 ? 'pregunta' : 'preguntas'}`;
}

/** Lo que la región viva compara entre un estado y el siguiente. `turnKey` cambia en cada turno (vuelta y jugador). */
export interface WhoAmIAnnounceSnapshot {
  turnKey: string | null;
  turnPlayerId: string | null;
  /** La pregunta en curso con su turno (dos turnos seguidos con la misma pregunta se anuncian los dos). */
  questionKey: string | null;
  questionText: string | null;
  /** El propio Pokémon, solo cuando uno mismo ya ha acertado. */
  solvedAs: string | null;
}

/**
 * Lo que anuncia la región viva al pasar de `before` a `now`: «¡Eras X!» al acertar uno mismo, «Turno de X.» al cambiar
 * el turno y la pregunta nueva cuando se hace. Vacío si no hay nada nuevo.
 */
export function whoAmIAnnouncement(before: WhoAmIAnnounceSnapshot, now: WhoAmIAnnounceSnapshot, nameOf: (id: string) => string): string {
  const parts: string[] = [];
  if (now.solvedAs && !before.solvedAs) parts.push(`¡Eras ${now.solvedAs}!`);
  if (now.turnKey !== null && now.turnKey !== before.turnKey && now.turnPlayerId) parts.push(`Turno de ${nameOf(now.turnPlayerId)}.`);
  if (now.questionKey !== null && now.questionKey !== before.questionKey && now.questionText) parts.push(`Pregunta: ${now.questionText}`);
  return parts.join(' ');
}

/**
 * El texto que se pone en la región viva para anunciar `next` cuando ya contiene `current`. Si es el mismo anuncio
 * (p. ej. «Turno de Ana.» con dos turnos seguidos de Ana, al quedar solo ella sin acertar), alterna un espacio de ancho
 * cero al final: el texto cambia y el lector de pantalla lo vuelve a leer.
 */
export function freshAnnouncement(current: string, next: string): string {
  if (next !== current.replace(/\u200b$/, '')) return next;
  return current.endsWith('\u200b') ? next : `${next}\u200b`;
}

/**
 * Ids que el buscador de adivinar bloquea: los ya probados (entradas `GUESS` del historial propio) y los Pokémon de los
 * demás jugadores, que el servidor rechaza («Ese Pokémon lo tiene otro jugador.»).
 */
export function lockedGuessIds(history: readonly WhoAmIHistoryEntry[], others: Readonly<Record<string, WhoAmIPokemon>>): Set<string> {
  const locked = new Set(history.flatMap((entry) => (entry.kind === 'GUESS' ? [entry.pokemon.id] : [])));
  for (const pokemon of Object.values(others)) locked.add(pokemon.id);
  return locked;
}
