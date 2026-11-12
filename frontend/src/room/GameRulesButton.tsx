import type { MiniGameManifest } from '@pokemon-universe/shared/public';
import { useState } from 'react';
import { HelpDot } from '../ui';
import { gameHelpSections } from './GameHelpButton';
import { HelpDialog } from './HelpDialog';

/**
 * «?» de un juego fuera de la partida (cartas del lobby, editor de ajustes y votación del siguiente juego): abre el
 * diálogo de ayuda con sus tres reglas (sección «Reglas», sin atajos). Va como hermano de la carta, nunca dentro de su
 * botón, así que pulsarlo no la elige. Sin reglas en el manifiesto no pinta nada. Va encima de la esquina de la carta
 * a propósito: es una capa (`data-layer`) para el medidor de encaje de los e2e, que comprueba aparte que no pisa texto.
 */
export function GameRulesButton({ game, className }: { game: Pick<MiniGameManifest, 'name' | 'howTo'>; className?: string | undefined }) {
  const [open, setOpen] = useState(false);
  if (game.howTo.length === 0) return null;
  const label = `Cómo se juega: ${game.name}`;
  return <>
    <HelpDot aria-label={label} className={className} data-layer="rules" onClick={() => setOpen(true)} />
    <HelpDialog open={open} title={`Cómo se juega · ${game.name}`} onClose={() => setOpen(false)} sections={gameHelpSections(game.howTo, [])} />
  </>;
}
