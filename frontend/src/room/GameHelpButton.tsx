import type { RoomPhase, RoomView } from '@pokemon-universe/shared/public';
import { HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog, Pill } from '../ui';
import { bindShortcuts } from './game-kit/shortcuts';
import { activeGameManifest } from './game-intro';
import s from './GameHelpButton.module.css';

/** Fases sin partida en juego (o con sus reglas ya a la vista, como la intro): sin «Cómo se juega». */
const PHASES_WITHOUT_HELP: ReadonlySet<RoomPhase> = new Set(['LOBBY', 'GAME_INTRO', 'GAME_RESULTS', 'NEXT_GAME_VOTE', 'NEXT_GAME_VOTE_RESULTS', 'SESSION_RESULTS']);

/** Las reglas del juego en curso, si la sala está en una de sus fases y el manifiesto las trae. */
export function gameHelpRules(room: RoomView): { name: string; rules: string[] } | null {
  if (PHASES_WITHOUT_HELP.has(room.phase)) return null;
  const manifest = activeGameManifest(room);
  return manifest && manifest.howTo.length > 0 ? { name: manifest.name, rules: manifest.howTo } : null;
}

/**
 * «Cómo se juega» (Q2): píldora «?» de la placa de la sala, en todas las pantallas de juego, que abre un diálogo con las
 * tres reglas del juego en curso. La tecla «?» también lo abre (con el criterio común de los atajos: no mientras se
 * escribe); con el diálogo abierto, la pantalla de debajo no recibe atajos.
 */
export function GameHelpButton({ room }: { room: RoomView }) {
  const help = gameHelpRules(room);
  const [open, setOpen] = useState(false);
  const available = help !== null;
  useEffect(() => {
    if (!available) return undefined;
    return bindShortcuts(window, (key) => {
      if (key !== '?') return false;
      setOpen(true);
      return true;
    });
  }, [available]);
  if (!help) return null;
  return <>
    <Pill size="small" variant="ghost" icon={HelpCircle} aria-label="Cómo se juega" title="Cómo se juega (?)" aria-keyshortcuts="?" onClick={() => setOpen(true)} />
    <Dialog open={open} title={`Cómo se juega · ${help.name}`} onClose={() => setOpen(false)} width={480}
      actions={[{ label: 'Entendido', variant: 'yellow', autoFocus: true, onClick: () => undefined }]}>
      <ol className={s.rules}>
        {help.rules.map((rule, index) => <li key={index} className={s.rule}>
          <span className={s.number} aria-hidden="true">{index + 1}</span>
          <span>{rule}</span>
        </li>)}
      </ol>
    </Dialog>
  </>;
}
