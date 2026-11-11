import type { AbsurdPokedexEntryResult, AbsurdPokedexMode, AbsurdPokedexRoundResult, GamePhase } from '@pokemon-universe/shared/public';
import { namesList, type PhaseStep } from '../../room/social-kit';
import type { GameAction } from '../../room/room-command';

/**
 * Textos de la pantalla de Pokédex Absurda: título del modo, fases, región viva y la revelación. Anónimo: nada de aquí
 * nombra a un autor ni a la entrada oficial antes de `ROUND_RESULTS`.
 */

export const ABSURD_DRAFT_DEBOUNCE_MS = 400;

/** Título del modo (el `h1` de la votación y el chip de la placa). */
export function absurdModeTitle(mode: AbsurdPokedexMode): string {
  return mode === 'REAL_ENTRY' ? '¿Cuál es la real?' : 'La más absurda';
}

/** «Engañó a Ana y Luis»: quienes votaron una entrada inventada creyéndola la oficial; vacío si nadie (o si es la oficial). */
export function fooledNames(entry: Pick<AbsurdPokedexEntryResult, 'votedBy'> & { isReal?: boolean }, nameOf: (playerId: string) => string): string {
  if (entry.isReal || entry.votedBy.length === 0) return '';
  return `Engañó a ${namesList(entry.votedBy.map(nameOf))}`;
}

/** Las entradas de la revelación: la oficial primero en `REAL_ENTRY` y luego por votos (descendente) y id. */
export function sortedRoundEntries(lastRound: AbsurdPokedexRoundResult): AbsurdPokedexEntryResult[] {
  const official = lastRound.mode === 'REAL_ENTRY' ? 1 : 0;
  return [...lastRound.entries].sort((a, b) =>
    (official ? Number(b.isReal) - Number(a.isReal) : 0) || b.votesReceived - a.votesReceived || a.id.localeCompare(b.id));
}

/**
 * Envía el borrador sin pasar por el aviso global: teclear para corregir no borra el error de un envío rechazado.
 */
export function sendAbsurdDraft(onAction: GameAction, text: string): Promise<void> {
  return onAction({ type: 'UPDATE_ABSURD_DRAFT', text }, { report: false });
}

export function absurdSteps(): PhaseStep[] {
  return [{ key: 'write', label: 'Escribir' }, { key: 'vote', label: 'Votar' }, { key: 'result', label: 'Resultado' }];
}

export function absurdCurrentStep(phase: GamePhase): string | null {
  if (phase === 'ROUND_ACTIVE') return 'write';
  if (phase === 'VOTING') return 'vote';
  if (phase === 'ROUND_RESULTS') return 'result';
  return null;
}

/** Título (`h1`) de cada fase. */
export function absurdHeading(phase: GamePhase, mode: AbsurdPokedexMode, result: AbsurdPokedexRoundResult | null): string {
  if (phase === 'ROUND_ACTIVE') return 'Escribe su entrada de Pokédex';
  if (phase === 'VOTING') return absurdModeTitle(mode);
  if (phase === 'ROUND_RESULTS' && result) return result.skipped ? 'Ronda sin suficientes entradas' : 'La revelación';
  return 'Preparando el resultado…';
}

/** Texto de la única región viva. */
export function absurdAnnouncement({ phase, roundNumber, entryLocked, voteLocked, result, nameOf }: {
  phase: GamePhase;
  roundNumber: number;
  entryLocked: boolean;
  voteLocked: boolean;
  result: AbsurdPokedexRoundResult | null;
  nameOf(playerId: string): string;
}): string {
  if (phase === 'ROUND_ACTIVE') return entryLocked ? 'Entrada enviada. Solo tú puedes verla hasta la votación.' : '';
  if (phase === 'VOTING') return voteLocked ? 'Voto enviado. El resultado sale cuando vote todo el grupo.' : `Ronda ${roundNumber}: votación anónima abierta.`;
  if (phase === 'ROUND_RESULTS' && result) {
    if (result.skipped) return `Ronda ${roundNumber}: ronda sin suficientes entradas.`;
    const real = result.realEntry ? ` La entrada oficial era de ${result.realEntry.versionLabel}.` : '';
    const winners = result.winnerPlayerIds.length ? ` Gana ${namesList(result.winnerPlayerIds.map(nameOf))}.` : '';
    return `Ronda ${roundNumber} terminada.${real}${winners}`;
  }
  return '';
}

/** El voto final: la graciosa solo viaja en `REAL_ENTRY` (en Clásico no existe) y si hay una marcada. */
export function absurdVotePayload(mode: AbsurdPokedexMode, entryId: string, funnyEntryId: string | null): { type: 'VOTE_ABSURD'; entryId: string; funnyEntryId?: string } {
  return { type: 'VOTE_ABSURD', entryId, ...(mode === 'REAL_ENTRY' && funnyEntryId ? { funnyEntryId } : {}) };
}

/** El conmutador de «😂 La más graciosa»: pulsar la marcada la suelta; pulsar otra cambia la marca. */
export function toggleFunny(current: string | null, entryId: string): string | null {
  return current === entryId ? null : entryId;
}

/**
 * Borrador con debounce, sin React: `schedule` guarda el último texto y lo envía tras `delay` sin teclear; `flush` envía ya
 * lo pendiente (al desmontar: el servidor usa el borrador como entrada si se acaba el tiempo); `cancel` lo descarta.
 */
export function createDraftScheduler(send: (text: string) => void, initial: string, delay = ABSURD_DRAFT_DEBOUNCE_MS): { schedule(text: string): void; flush(): void; cancel(): void } {
  let last = initial;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const flush = () => {
    clear();
    if (pending !== null && pending !== last) { last = pending; send(pending); }
    pending = null;
  };
  return {
    schedule(text) { pending = text; clear(); timer = setTimeout(flush, delay); },
    flush,
    cancel() { clear(); pending = null; },
  };
}
