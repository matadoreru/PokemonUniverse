import type { TypeDuelRoundResult } from '@pokemon-universe/shared/public';

export interface TypeDuelResultText { title: string; detail: string | null }

/** Título y explicación del resultado de un duelo según su motivo. */
export function typeDuelResultText(lastRound: TypeDuelRoundResult, participants: readonly [string, string], nameOf: (id: string) => string): TypeDuelResultText {
  const winner = lastRound.winnerId ? nameOf(lastRound.winnerId) : null;
  switch (lastRound.reason) {
    case 'WINNER':
      return { title: `${winner ?? '?'} gana`, detail: null };
    case 'TIMEOUT':
      return { title: 'Tiempo agotado', detail: 'Nadie encontró un Pokémon con esa combinación.' };
    case 'TYPE_FORFEIT': {
      const rival = participants.find((id) => id !== lastRound.winnerId);
      return { title: `${winner ?? '?'} gana`, detail: rival ? `${nameOf(rival)} no eligió tipo a tiempo.` : null };
    }
    case 'TYPE_TIMEOUT':
      return { title: 'Ninguno eligió tipo', detail: 'El duelo cuenta sin puntos.' };
    case 'DISCONNECTED': {
      const names = lastRound.disconnectedIds.map(nameOf);
      const detail = names.length === 0 ? null : names.length === 1 ? `${names[0]} se desconectó.` : `${names.join(' y ')} se desconectaron.`;
      return { title: 'Duelo anulado', detail };
    }
    case 'DISCONNECT_FORFEIT': {
      const absent = lastRound.disconnectedIds[0];
      return { title: `${winner ?? '?'} gana`, detail: absent ? `${nameOf(absent)} se desconectó.` : null };
    }
    case 'INVALID_COMBINATION':
      return { title: 'Combinación imposible', detail: 'Ninguna combinación elegida tenía Pokémon válidos: el duelo cuenta sin puntos.' };
  }
}
