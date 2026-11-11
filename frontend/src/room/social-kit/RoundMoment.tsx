import type { ReactNode } from 'react';
import { MomentCutin } from '../../ui';

/** El momento de la revelación de una ronda social: quién gana o qué respuesta se lleva la ronda. */
export interface SocialRoundMoment {
  /** Clave de la ronda (p. ej. `ronda:vuelta`): con ella el cut-in sale una vez por revelación. */
  key: string;
  title: string;
  subtitle?: string | undefined;
  /** Ganas tú (o compartes la victoria): solo entonces hay confeti. */
  won: boolean;
  media?: ReactNode;
}

export interface RoundWinnerInput {
  key: string;
  /** Ganadores de la ronda (los autores de la respuesta más votada); vacío, sin momento. */
  winnerIds: readonly string[];
  selfId: string;
  nameOf: (playerId: string) => string;
  /** Lo que ganó («Pikachu», «“Se come los deberes”»), bajo el título. */
  subtitle?: string | undefined;
}

/**
 * Momento del ganador de la ronda: «¡Gana Ana!», «¡Ganas tú!» o, en un empate, «¡Victoria compartida!» con los nombres
 * (y lo que ganó) debajo. Sin ganadores, `null`.
 */
export function roundWinnerMoment({ key, winnerIds, selfId, nameOf, subtitle }: RoundWinnerInput): SocialRoundMoment | null {
  if (winnerIds.length === 0) return null;
  const won = winnerIds.includes(selfId);
  if (winnerIds.length === 1) {
    return { key, won, title: won ? '¡Ganas tú!' : `¡Gana ${nameOf(winnerIds[0]!)}!`, ...(subtitle ? { subtitle } : {}) };
  }
  const names = winnerIds.map((id) => (id === selfId ? 'Tú' : nameOf(id))).join(' · ');
  return { key, won, title: '¡Victoria compartida!', subtitle: subtitle ? `${names} — ${subtitle}` : names };
}

/**
 * Cut-in de la revelación de la ronda (A5): sin región viva (lo dice la de `SocialScreen`), sin sonido propio (la
 * revelación ya suena con el `game.reveal` de la sala), saltable, y con confeti solo para quien gana.
 */
export function RoundMomentCutin({ moment }: { moment: SocialRoundMoment | null | undefined }) {
  if (!moment) return null;
  return <MomentCutin key={moment.key} tone="yellow" title={moment.title} subtitle={moment.subtitle} media={moment.media} confetti={moment.won} confettiSeed={seedOf(moment.key)} silent />;
}

/** Tope de una frase en el cut-in: más larga, se corta con «…» (entera sigue en el recuento). */
export const MOMENT_QUOTE_MAX = 60;

/** Una frase ganadora entre comillas, cortada a `MOMENT_QUOTE_MAX` caracteres. */
export function momentQuote(text: string): string {
  const chars = [...text.trim()];
  const shown = chars.length > MOMENT_QUOTE_MAX ? `${chars.slice(0, MOMENT_QUOTE_MAX - 1).join('').trimEnd()}…` : chars.join('');
  return `“${shown}”`;
}

/** Semilla del confeti a partir de la clave: la misma ronda da la misma ráfaga. */
function seedOf(key: string): number {
  let hash = 7;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 100_003;
  return hash + 1;
}
