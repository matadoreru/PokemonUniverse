import type { PokemonType, TypeChainElimination, TypeChainEvent, TypeChainInvalidReason, TypeChainPlayerState, TypeChainPublicState } from '@pokemon-universe/shared/public';
import { pokemonTypeLabels } from '../../components/PokemonTypeBadge';

/** Motivo de un intento rechazado, en texto. */
export const typeChainReasonLabels: Record<TypeChainInvalidReason, string> = {
  ALREADY_USED: 'Este Pokémon ya ha sido utilizado.',
  NO_SHARED_TYPE: 'No comparte ningún tipo.',
  MULTIPLE_SHARED_TYPES: 'Comparte los dos tipos. Debe compartir exactamente uno.',
  OUT_OF_POOL: 'Pokémon fuera de las generaciones permitidas.',
};

/** Motivo corto (chips y franjas estrechas). */
export const typeChainReasonShort: Record<TypeChainInvalidReason, string> = {
  ALREADY_USED: 'Ya usado',
  NO_SHARED_TYPE: 'Ningún tipo en común',
  MULTIPLE_SHARED_TYPES: 'Comparte los dos tipos',
  OUT_OF_POOL: 'Fuera de las generaciones',
};

/** Por qué cayó un jugador. */
export const typeChainEliminationLabels: Record<TypeChainElimination['reason'], string> = {
  TIMEOUT: 'se le acabó el tiempo',
  DISCONNECTED: 'se desconectó en su turno',
};

export const typeLabel = (type: PokemonType) => pokemonTypeLabels[type] ?? type;

/** «Normal o Volador» / «Fuego». */
export function typeChoiceText(types: readonly PokemonType[]): string {
  const labels = types.map(typeLabel);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} o ${labels.at(-1)}` : labels[0] ?? '';
}

/** Placa de abajo: tu turno (buscador), esperar al de otro, eliminado, espectador o preparando. */
export type TypeChainPlateKind = 'turn' | 'waiting' | 'eliminated' | 'spectator' | 'starting';

export function typeChainPlateKind({ game, player, spectator }: { game: Pick<TypeChainPublicState, 'phase' | 'chain'>; player: TypeChainPlayerState | null; spectator: boolean }): TypeChainPlateKind {
  if (game.phase !== 'TURN_ACTIVE' || game.chain.length === 0) return 'starting';
  if (player?.eliminated) return 'eliminated';
  if (spectator || !player) return 'spectator';
  return player.canSubmit ? 'turn' : 'waiting';
}

/** Destino del foco al cambiar de placa (el título): una clave por turno, así no se pierde al desmontar el buscador. */
export const typeChainFocusKey = (kind: TypeChainPlateKind, turnNumber: number): string | null => (kind === 'starting' ? null : `${kind}-${turnNumber}`);

/** Lo que dice la franja del último movimiento: tono, título y detalle, todo en texto. */
export interface TypeChainEventView {
  tone: 'ok' | 'bad' | 'warn';
  title: string;
  text: string;
}

export function typeChainEventView(event: TypeChainEvent | undefined, nameOf: (id: string) => string): TypeChainEventView | null {
  if (!event) return null;
  if (event.kind === 'CHAIN_RESET') return { tone: 'warn', title: 'Cadena bloqueada · empieza otra', text: `La anterior llegó a ${event.previousLength} Pokémon y nadie podía seguirla. Nadie queda eliminado; sale ${event.starter.name}.` };
  if (event.kind === 'ELIMINATION') return { tone: 'bad', title: `${nameOf(event.playerId)} queda eliminado`, text: event.reason === 'TIMEOUT' ? 'No encontró una respuesta válida a tiempo.' : 'Se desconectó durante su turno.' };
  return { tone: 'ok', title: `${nameOf(event.playerId)} continúa la cadena`, text: `${event.from.name} → ${event.to.name} · comparten ${typeLabel(event.sharedType)}` };
}

/** Estado de un jugador en el marcador (en texto, además del color de la franja). */
export type TypeChainMemberStatus =
  | { kind: 'current' }
  | { kind: 'next' }
  | { kind: 'eliminated'; reason: TypeChainElimination['reason']; order: number }
  | { kind: 'alive' };

export function typeChainMemberStatus(game: Pick<TypeChainPublicState, 'currentPlayerId' | 'nextPlayerId' | 'eliminations' | 'eliminatedPlayerIds'>, id: string): TypeChainMemberStatus {
  const elimination = game.eliminations.find((entry) => entry.playerId === id);
  if (elimination) return { kind: 'eliminated', reason: elimination.reason, order: elimination.eliminationOrder };
  if (game.eliminatedPlayerIds.includes(id)) return { kind: 'eliminated', reason: 'TIMEOUT', order: 0 };
  if (game.currentPlayerId === id) return { kind: 'current' };
  if (game.nextPlayerId === id) return { kind: 'next' };
  return { kind: 'alive' };
}

/** Eslabones que ha puesto cada jugador en la cadena actual. */
export function typeChainLinks(game: Pick<TypeChainPublicState, 'chain'>, id: string): number {
  return game.chain.filter((node) => node.playedBy === id).length;
}

/**
 * Texto de la única región viva: el último movimiento, de quién es el turno y, si el último intento propio de este turno
 * no valió, por qué (con la espera). Cambia solo cuando cambia algo de eso: así se anuncia una vez.
 */
export function typeChainAnnouncement({ game, player, kind, nameOf }: {
  game: Pick<TypeChainPublicState, 'events' | 'currentPlayerId' | 'chain' | 'turnStartedAt' | 'turnNumber'>;
  player: TypeChainPlayerState | null;
  kind: TypeChainPlateKind;
  nameOf: (id: string) => string;
}): string {
  if (kind === 'starting') return '';
  const event = typeChainEventView(game.events.at(-1), nameOf);
  const current = game.chain.at(-1)?.pokemon;
  const turn = kind === 'turn'
    ? `Tu turno: continúa desde ${current?.name ?? 'el Pokémon actual'}.`
    : game.currentPlayerId ? `Turno ${game.turnNumber}: le toca a ${nameOf(game.currentPlayerId)}.` : '';
  const attempt = player?.lastAttempt && kind === 'turn' && (game.turnStartedAt === null || player.lastAttempt.attemptedAt >= game.turnStartedAt)
    ? `Incorrecto: ${player.lastAttempt.pokemonName}. ${typeChainReasonLabels[player.lastAttempt.reason]} Nuevo intento en 1 segundo.`
    : '';
  return [attempt, event ? `${event.title}. ${event.text}.` : '', turn].filter(Boolean).join(' ');
}
