import { gameModeName, type NextGameVoteOptionView } from '@pokemon-universe/shared/public';

export interface VoteActionStatus {
  kicker: string;
  title: string;
  text: string;
  /** Puede confirmar ahora (aparece «Confirmar voto»). */
  canConfirm: boolean;
}

/**
 * Texto de la franja de acción de la votación del siguiente juego: qué ha elegido, si ya votó, si está fuera de la
 * votación o, al revelar, qué juego ganó y cuánto falta.
 */
export function voteActionStatus({ active, eligible, ownVote, draftName, resolvedName, revealSeconds }: {
  active: boolean;
  eligible: boolean;
  /** Nombre del juego al que ya votó (confirmado), o `null`. */
  ownVote: string | null;
  draftName: string | null;
  resolvedName: string | null;
  revealSeconds: number;
}): VoteActionStatus {
  if (!active) {
    return {
      kicker: 'Resultado',
      title: resolvedName ? `La sala ha elegido ${resolvedName}` : 'Votación cerrada',
      text: `La siguiente partida empieza en ${Math.max(1, revealSeconds)} s…`,
      canConfirm: false,
    };
  }
  if (!eligible) return { kicker: 'Sin conexión', title: 'Fuera de la votación', text: 'Te has desconectado de la votación. Podrás seguir cuando recuperes la conexión.', canConfirm: false };
  if (ownVote) return { kicker: 'Tu voto', title: 'Tu voto está registrado.', text: `Has votado por ${ownVote}. Esperando al resto…`, canConfirm: false };
  return {
    kicker: 'Tu voto',
    title: draftName ? `Has elegido ${draftName}` : 'Elige una carta',
    text: draftName ? 'Confírmalo antes de que acabe el tiempo.' : 'Selecciona una opción para preparar tu voto.',
    canConfirm: true,
  };
}

export function votesLabel(count: number): string {
  return `${count} ${count === 1 ? 'voto' : 'votos'}`;
}

/**
 * Nombre de una opción de voto: «Juego · Modo» o solo «Juego» si sale en Clásico y es su única opción (o el juego no
 * tiene modos).
 */
export function voteOptionName(option: NextGameVoteOptionView, options: readonly NextGameVoteOptionView[]): string {
  if (!option.mode) return option.game.name;
  const alone = options.filter((other) => other.game.id === option.game.id).length === 1;
  if (alone && option.mode === 'CLASSIC') return option.game.name;
  const mode = gameModeName(option.game.id, option.mode);
  return mode ? `${option.game.name} · ${mode}` : option.game.name;
}
