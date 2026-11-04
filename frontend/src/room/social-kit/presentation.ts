import type { GamePhase } from '@pokemon-universe/shared/public';

/**
 * Lógica pura del kit social (Most Likely To, Red Flag, Would You Rather, One of Us Is Fake, Secret Ranking y Poké
 * Taboo): recuentos de las votaciones con segunda vuelta, textos de votos y nombres, y claves de foco.
 */

/** Una vuelta de votación tal como la guarda el motor (`recordRunoffVoteRound`): candidatos y votante → candidato. */
export interface RunoffRoundLike {
  number: number;
  candidateIds: readonly string[];
  votes: Readonly<Record<string, string>>;
}

/** Recuento de un candidato en una vuelta: votos y quién lo votó (solo existe en la revelación). */
export interface RunoffCount {
  id: string;
  votes: number;
  voterIds: string[];
}

/** «1 voto», «2 votos», «0 votos». */
export const votesText = (votes: number) => `${votes} ${votes === 1 ? 'voto' : 'votos'}`;

/** «Ana», «Ana y Leo», «Ana, Leo y Eru» (lista vacía: ''). */
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** Recuento de una vuelta en el orden de los candidatos; los votos a quien no era candidato no cuentan (como el motor). */
export function runoffCounts(round: RunoffRoundLike): RunoffCount[] {
  const counts = new Map(round.candidateIds.map((id) => [id, { id, votes: 0, voterIds: [] as string[] }]));
  for (const [voterId, targetId] of Object.entries(round.votes)) {
    const count = counts.get(targetId);
    if (!count) continue;
    count.votes += 1;
    count.voterIds.push(voterId);
  }
  return [...counts.values()];
}

/** Los más votados de una vuelta (empate: varios); sin candidatos, ninguno. Igual que `leadingRunoffCandidateIds`. */
export function runoffLeaders(counts: readonly RunoffCount[]): string[] {
  if (counts.length === 0) return [];
  const top = Math.max(...counts.map((count) => count.votes));
  return counts.filter((count) => count.votes === top).map((count) => count.id);
}

/** Votos emitidos en una vuelta (a candidatos). */
export const runoffTotal = (counts: readonly RunoffCount[]) => counts.reduce((sum, count) => sum + count.votes, 0);

/**
 * Cómo acabó una votación, para el titular y la región viva:
 * - `none`: nadie respondió (no hay ganador ni votación).
 * - `unopposed`: una sola respuesta, gana sin votación (el motor no abre la votación).
 * - `noVotes`: nadie votó y todos los candidatos empatan a cero (comparten la victoria): nunca «Ganadora · 0 votos».
 * - `solo`: un ganador con votos. `shared`: empate con votos (victoria compartida).
 * - `lot`: empate en la vuelta final y el motor eligió a uno por sorteo (One of Us Is Fake): nunca «Gana X con N votos».
 * - `tie`: empate en la vuelta final sin ganador (p. ej. Would You Rather con la sala dividida).
 */
export type TallyOutcome = 'none' | 'unopposed' | 'noVotes' | 'solo' | 'shared' | 'lot' | 'tie';

export function tallyOutcome(winnerIds: readonly string[], rounds: readonly RunoffRoundLike[]): TallyOutcome {
  const last = rounds.at(-1);
  const counts = last ? runoffCounts(last) : [];
  const leaders = runoffLeaders(counts);
  if (winnerIds.length === 0) return last && leaders.length > 1 && runoffTotal(counts) > 0 ? 'tie' : 'none';
  if (!last) return 'unopposed';
  const winnerVotes = Math.max(0, ...counts.filter((count) => winnerIds.includes(count.id)).map((count) => count.votes));
  if (winnerVotes === 0) return 'noVotes';
  if (winnerIds.length === 1 && leaders.length > 1) return 'lot';
  return winnerIds.length === 1 ? 'solo' : 'shared';
}

/**
 * Resumen en una frase del recuento («Gana Psyduck con 2 votos tras la segunda vuelta.», «Empate a 1 voto entre A y
 * B: victoria compartida.», «Empate a 1 voto entre A y B: el sorteo eligió a A.», «Nadie votó: …»). `nameOf` da el nombre
 * de cada candidato tal como se muestra; `verb` es el verbo del ganador («Gana», o «Sale» para un expulsado).
 */
export function tallySummary(winnerIds: readonly string[], rounds: readonly RunoffRoundLike[], nameOf: (id: string) => string, emptyText = 'Nadie respondió a tiempo.', verb = 'Gana'): string {
  const outcome = tallyOutcome(winnerIds, rounds);
  const names = namesList(winnerIds.map(nameOf));
  const after = rounds.length > 1 ? ' tras la segunda vuelta' : '';
  const last = rounds.at(-1);
  const counts = last ? runoffCounts(last) : [];
  const leaders = runoffLeaders(counts);
  const top = counts.find((count) => count.id === leaders[0])?.votes ?? 0;
  const tiedNames = namesList(leaders.map(nameOf));
  switch (outcome) {
    case 'none': return emptyText;
    case 'unopposed': return `Única respuesta: ${names} gana sin votación.`;
    case 'noVotes': return winnerIds.length === 1 ? `Nadie votó: ${names} gana sin votos.` : `Nadie votó: empate sin votos entre ${names}.`;
    case 'solo': return `${verb} ${names} con ${votesText(top)}${after}.`;
    case 'lot': return `Empate a ${votesText(top)} entre ${tiedNames}${after}: el sorteo eligió a ${names}.`;
    case 'tie': return `Empate a ${votesText(top)} entre ${tiedNames}${after}: no hay ganador.`;
    default: return `Empate a ${votesText(top)} entre ${names}${after}: victoria compartida.`;
  }
}

/**
 * Clave de foco de la placa de abajo (`useFocusOnTransition`): cambia con la fase, la ronda, la vuelta y el voto
 * bloqueado. Al confirmar, la píldora se deshabilita y el foco caería al `body`: con esta clave vuelve al título.
 */
export function socialFocusKey(phase: GamePhase, roundNumber: number, voteRound = 1, locked = false): string {
  return `${phase}-${roundNumber}-${voteRound}-${locked ? 'locked' : 'open'}`;
}

/** Índice de la fase actual entre los pasos (−1 si no está: ninguno marcado). */
export function phaseIndex(steps: readonly { key: string }[], current: string | null): number {
  return current === null ? -1 : steps.findIndex((step) => step.key === current);
}

/** Estado de la papeleta: ver `ballotState`. */
export interface BallotState {
  /** El servidor ya tiene el voto propio: papeleta bloqueada. */
  locked: boolean;
  /** Voto enviado y a la espera del servidor. */
  sending: boolean;
  /** Se puede elegir y confirmar. */
  open: boolean;
  /** Opción elegida en esta ronda y vuelta (aún sin confirmar), si sigue siendo válida. */
  picked: string | null;
  /** Opción que se pinta marcada: el voto bloqueado, el que se está enviando o la elegida. */
  selected: string | null;
}

/**
 * Estado de la papeleta a partir de lo que dice el servidor (`ownVote`, `canVote`), del envío en curso (`busyId` de
 * `useRunoffVote`) y de la elección local (`pick`, con la época de su ronda y vuelta). Una elección de otra ronda o
 * vuelta, propia o de quien ya no es candidato no cuenta. Con el voto confirmado manda el servidor, aunque `busyId`
 * siga puesto (el hook solo lo limpia al fallar o al cambiar de vuelta) o tras recargar.
 */
export function ballotState({ epoch, pick, candidateIds, ownId, ownVote, busyId, canVote, participating }: {
  epoch: number;
  pick: { epoch: number; id: string } | null;
  candidateIds: readonly string[];
  ownId: string | null;
  ownVote: string | null;
  busyId: string;
  canVote: boolean;
  participating: boolean;
}): BallotState {
  const locked = ownVote !== null;
  const sending = busyId !== '' && !locked;
  const open = participating && canVote && !locked;
  const picked = open && pick?.epoch === epoch && pick.id !== ownId && candidateIds.includes(pick.id) ? pick.id : null;
  return { locked, sending, open, picked, selected: locked ? ownVote : sending ? busyId : picked };
}

/**
 * Atajos de las opciones (`1`, `2`…) de `ChoicePair`: la opción de la tecla pulsada, o `null`. No cuenta con
 * modificadores, con la tecla mantenida, si otro ya la atendió (`defaultPrevented`) ni mientras se escribe en un campo
 * (`input`, `textarea`, `select` o `contenteditable`).
 */
export function choiceFromKey<T extends string>(event: { key: string; repeat?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; defaultPrevented?: boolean; target?: unknown }, ids: readonly T[]): T | null {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || typingTarget(event.target)) return null;
  if (!/^[1-9]$/.test(event.key)) return null;
  return ids[Number(event.key) - 1] ?? null;
}

/** ¿Se está escribiendo en un campo? (los atajos de las opciones no se disparan). */
export function typingTarget(target: unknown): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null | undefined;
  if (!element || typeof element.closest !== 'function') return false;
  return Boolean(element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

/** Lo que necesita `bindChoiceShortcuts` del destino de los eventos (en la app, `window`). */
export interface ShortcutTarget {
  addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void;
  removeEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void;
}

/**
 * Escucha los atajos de `ChoicePair` en `target` y llama a `onChoose` con la opción (con `preventDefault`). Devuelve la
 * función que deja de escuchar (la del efecto de React).
 */
export function bindChoiceShortcuts<T extends string>(target: ShortcutTarget, ids: readonly T[], onChoose: (id: T) => void): () => void {
  const listener = (event: KeyboardEvent) => {
    const id = choiceFromKey(event, ids);
    if (!id) return;
    event.preventDefault();
    onChoose(id);
  };
  target.addEventListener('keydown', listener);
  return () => target.removeEventListener('keydown', listener);
}
