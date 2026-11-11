import type { RoomPhase, RoomView } from '@pokemon-universe/shared/public';
import { HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { Pill } from '../ui';
import { activeGameManifest } from './game-intro';
import { HelpDialog, HelpRules } from './HelpDialog';

/** Fases sin partida en juego (o con sus reglas ya a la vista, como la intro): sin «Cómo se juega». */
const PHASES_WITHOUT_HELP: ReadonlySet<RoomPhase> = new Set(['LOBBY', 'GAME_INTRO', 'GAME_RESULTS', 'NEXT_GAME_VOTE', 'NEXT_GAME_VOTE_RESULTS', 'SESSION_RESULTS']);

/** Las reglas del juego en curso, si la sala está en una de sus fases y el manifiesto las trae. */
export function gameHelpRules(room: RoomView): { name: string; rules: string[] } | null {
  if (PHASES_WITHOUT_HELP.has(room.phase)) return null;
  const manifest = activeGameManifest(room);
  return manifest && manifest.howTo.length > 0 ? { name: manifest.name, rules: manifest.howTo } : null;
}

/**
 * «Cómo se juega» (Q2): píldora «?» de la placa de la sala, en todas las pantallas de juego, que abre el diálogo de
 * ayuda con las tres reglas del juego en curso. Sin atajo de teclado propio: la tecla «?» es de los atajos.
 */
export function GameHelpButton({ room }: { room: RoomView }) {
  const help = gameHelpRules(room);
  const [open, setOpen] = useState(false);
  if (!help) return null;
  return <>
    <Pill size="small" variant="ghost" icon={HelpCircle} aria-label="Cómo se juega" title="Cómo se juega" onClick={() => setOpen(true)} />
    <HelpDialog open={open} title={`Cómo se juega · ${help.name}`} onClose={() => setOpen(false)}
      sections={[{ id: 'rules', title: 'Reglas', content: <HelpRules rules={help.rules} /> }]} />
  </>;
}
