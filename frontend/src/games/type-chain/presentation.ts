import type { PokemonType, TypeChainElimination, TypeChainEvent, TypeChainInvalidReason, TypeChainPlayerState, TypeChainPublicState } from '@pokemon-universe/shared/public';
import { POKEMON_TYPE_LABELS } from '@pokemon-universe/shared/public';
import { secondsLabel } from '../../lib/format';

/** Espera tras un intento que no vale (`TypeChainEngine.INVALID_COOLDOWN_MS` del backend): textos de ayuda y aviso. */
export const TYPE_CHAIN_COOLDOWN_SECONDS = 1;
export const typeChainCooldownText = secondsLabel(TYPE_CHAIN_COOLDOWN_SECONDS);

/** Motivo de un intento rechazado, en texto. */
export const typeChainReasonLabels: Record<TypeChainInvalidReason, string> = {
  ALREADY_USED: 'Ya se ha nombrado en esta cadena.',
  WRONG_TYPE: 'No es del tipo de la cadena.',
  OUT_OF_POOL: 'Pokémon fuera de las generaciones permitidas.',
};

/** Motivo corto (chips y franjas estrechas). */
export const typeChainReasonShort: Record<TypeChainInvalidReason, string> = {
  ALREADY_USED: 'Ya nombrado',
  WRONG_TYPE: 'Otro tipo',
  OUT_OF_POOL: 'Fuera de las generaciones',
};

/** Por qué cayó un jugador. */
export const typeChainEliminationLabels: Record<TypeChainElimination['reason'], string> = {
  TIMEOUT: 'se le acabó el tiempo',
  DISCONNECTED: 'se desconectó en su turno',
};

export const typeLabel = (type: PokemonType) => POKEMON_TYPE_LABELS[type] ?? type;

/** Tipo de la cadena en texto («Psíquico»), o un genérico mientras el servidor lo elige. */
export const chainTypeText = (type: PokemonType | null) => (type ? typeLabel(type) : 'la cadena');

/** Placa de abajo: tu turno (buscador), esperar al de otro, eliminado, espectador o preparando. */
export type TypeChainPlateKind = 'turn' | 'waiting' | 'eliminated' | 'spectator' | 'starting';

export function typeChainPlateKind({ game, player, spectator }: { game: Pick<TypeChainPublicState, 'phase' | 'chainType'>; player: TypeChainPlayerState | null; spectator: boolean }): TypeChainPlateKind {
  if (game.phase !== 'TURN_ACTIVE' || game.chainType === null) return 'starting';
  if (player?.eliminated) return 'eliminated';
  if (spectator || !player) return 'spectator';
  return player.canSubmit ? 'turn' : 'waiting';
}

/**
 * ¿Se lleva el foco al buscador al montarse? Solo en tu turno: el buscador aparece únicamente entonces (y se vuelve a
 * montar en cada turno propio), así que el foco llega al campo también en el primer turno de la partida.
 */
export const typeChainSearchAutoFocus = (kind: TypeChainPlateKind): boolean => kind === 'turn';

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
  if (event.kind === 'CHAIN_RESET') return { tone: 'warn', title: `No quedan Pokémon de tipo ${typeLabel(event.previousType)} · nueva cadena`, text: `La anterior llegó a ${event.previousLength} Pokémon. Nadie queda eliminado; ahora el tipo es ${typeLabel(event.chainType)}.` };
  if (event.kind === 'ELIMINATION') return { tone: 'bad', title: `${nameOf(event.playerId)} queda eliminado`, text: event.reason === 'TIMEOUT' ? 'No encontró una respuesta válida a tiempo.' : 'Se desconectó durante su turno.' };
  return { tone: 'ok', title: `${nameOf(event.playerId)} nombra a ${event.pokemon.name}`, text: `Es de tipo ${typeLabel(event.chainType)}: suma un Pokémon a la cadena` };
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

/** Pokémon que ha nombrado cada jugador en toda la partida (lo que decide la clasificación). */
export function typeChainNamed(game: Pick<TypeChainPublicState, 'namedCounts'>, id: string): number {
  return game.namedCounts[id] ?? 0;
}

/**
 * Texto de la única región viva: el último movimiento, de quién es el turno y, si el último intento propio de este turno
 * no valió, por qué (con la espera). Cambia solo cuando cambia algo de eso: así se anuncia una vez.
 */
export function typeChainAnnouncement({ game, player, kind, nameOf }: {
  game: Pick<TypeChainPublicState, 'events' | 'currentPlayerId' | 'chainType' | 'turnStartedAt' | 'turnNumber'>;
  player: TypeChainPlayerState | null;
  kind: TypeChainPlateKind;
  nameOf: (id: string) => string;
}): string {
  if (kind === 'starting') return '';
  const event = typeChainEventView(game.events.at(-1), nameOf);
  const turn = kind === 'turn'
    ? `Tu turno: nombra un Pokémon de tipo ${chainTypeText(game.chainType)}.`
    : game.currentPlayerId ? `Turno ${game.turnNumber}: le toca a ${nameOf(game.currentPlayerId)}.` : '';
  const attempt = player?.lastAttempt && kind === 'turn' && (game.turnStartedAt === null || player.lastAttempt.attemptedAt >= game.turnStartedAt)
    ? `Incorrecto: ${player.lastAttempt.pokemonName}. ${typeChainReasonLabels[player.lastAttempt.reason]} Nuevo intento en ${typeChainCooldownText}.`
    : '';
  return [attempt, event ? `${event.title}. ${event.text}.` : '', turn].filter(Boolean).join(' ');
}
