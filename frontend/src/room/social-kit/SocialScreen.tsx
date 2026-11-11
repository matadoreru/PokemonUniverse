import type { ReactNode } from 'react';
import { cx } from '../../ui';
import { GameScreen, type GameTimer } from '../game-kit/GameScreen';
import s from './SocialScreen.module.css';

/** Plazo de la cabecera (el del marco de juego, `GameTimer`): `{ deadline, serverOffset, label, totalMs? }`. */
export type SocialTimer = GameTimer;

export interface SocialScreenProps {
  /** Nombre del juego (kicker de la cabecera; en el móvil, solo para lectores). */
  gameName: string;
  roundNumber: number;
  totalRounds: number;
  /** Texto de la insignia en lugar de «Ronda N de M» (Poké Taboo: «Turno 3 de 6 · Vuelta 1 de 2»). */
  roundLabel?: ReactNode;
  /** `h1` corto de la fase («Elige tu respuesta», «Segunda vuelta», «La respuesta favorita»); una línea con elipsis. */
  heading: string;
  /** Chips extra junto a la ronda. */
  meta?: ReactNode;
  timer: SocialTimer;
  /** Texto de la ÚNICA región viva de la pantalla (siempre montada). Ningún otro elemento lleva `role="status"`/`aria-live`. */
  announcement: string;
  /** `PhaseRail` con las fases de la ronda. */
  phases?: ReactNode;
  /** Escena (pantalla de arriba): `SocialPrompt` con la pregunta o, al revelar, `VoteTally`. Llena el alto libre en escritorio. */
  stage: ReactNode;
  /** Columna lateral: `ResponseProgress` (o los puntos de la ronda). */
  side: ReactNode;
  /** Pantalla de abajo: `SocialPlate` o `VoteBallot`. */
  bottom: ReactNode;
  className?: string | undefined;
}

/**
 * Marco de los juegos sociales y de votación (spec §2 y §6 «Juegos»). Es el marco de juego (`GameScreen`)
 * con las fases de la ronda bajo la placa: arriba la placa (ronda, juego, título, «Saltar minijuego» y plazo), las fases
 * y la escena; abajo la acción (buscador, escritura, papeleta o veredicto); al lado, el progreso del grupo. En escritorio
 * llena el alto del `main` sin scroll de página; en el móvil la acción queda pegada al fondo.
 *
 * Cada juego monta siempre un único `SocialScreen` en todas sus fases: la región viva no se vuelve a montar.
 * Quien lo use añade su id a `GAMES_WITH_SKIP_IN_SCREEN` (`room/game-skip-slot.ts`).
 */
export function SocialScreen({ stage, className, ...rest }: SocialScreenProps) {
  return <GameScreen {...rest} clue={stage} hints={null} className={cx(s.screen, className)} testId="social-screen" />;
}
