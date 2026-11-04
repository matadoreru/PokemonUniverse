import type { ReactNode } from 'react';
import { GuessScreen, type GuessTimer } from '../guess-kit';

/** Plazo de la cabecera (el del kit de adivinar): `{ deadline, serverOffset, label, totalMs? }`; `deadline: null`, sin plazo. */
export type AuctionTimer = GuessTimer;

export interface AuctionScreenProps {
  /** Nombre del juego (kicker de la cabecera; en el móvil, solo para lectores). */
  gameName: string;
  /** Lote o ronda actual y total (insignia «Lote N de M» si no hay `roundLabel`). */
  roundNumber: number;
  totalRounds: number;
  /** Texto de la insignia en lugar de «Ronda N de M» (Team Auction: «Lote 3 de 12»). */
  roundLabel?: ReactNode;
  /** `h1` corto («Turno de Ana», «Tu turno», «Subasta cerrada»); una línea con elipsis. */
  heading: string;
  /** Chips junto a la ronda («Subasta ascendente visible», «Sin límite de tiempo»). */
  meta?: ReactNode;
  timer: AuctionTimer;
  /** Texto de la ÚNICA región viva de la pantalla (siempre montada). Ningún otro elemento lleva `role="status"`/`aria-live`. */
  announcement: string;
  /** Escena (arriba): `AuctionLot` con el lote o la condición y la adjudicación. Llena el alto libre en escritorio. */
  stage: ReactNode;
  /** Columna lateral: `BudgetPlate` (primero, con tope de alto) y `BidHistory` (último, llena el resto). */
  side: ReactNode;
  /** Pantalla de abajo: `BidControls`. En el móvil queda pegada al fondo. */
  bottom: ReactNode;
  className?: string | undefined;
}

/**
 * Marco de los juegos de subasta (spec §2 y §6 «Juegos»): el marco del kit de adivinar (`GuessScreen`) con el lote en la
 * escena. Arriba la placa (lote, juego, título, «Saltar minijuego» y el plazo del turno) y el lote; abajo los controles
 * de la puja; al lado, los presupuestos y el historial. En escritorio llena el alto del `main` sin scroll de página; en
 * el móvil los controles quedan pegados al fondo.
 *
 * Cada juego monta siempre un único `AuctionScreen` en sus fases de puja: la región viva no se vuelve a montar.
 * Quien lo use añade su id a `GAMES_WITH_SKIP_IN_SCREEN` (`room/game-skip-slot.ts`). `data-testid="auction-screen"`.
 */
export function AuctionScreen({ stage, ...rest }: AuctionScreenProps) {
  return <GuessScreen {...rest} clue={stage} hints={null} testId="auction-screen" />;
}
