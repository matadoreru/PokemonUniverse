import type { RoomPhase, RoomView } from '@pokemon-universe/shared/public';
import { HelpCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Pill } from '../ui';
import { activeGameManifest } from './game-intro';
import { HELP_KEY, screenShortcuts, type ShortcutEntry } from './game-kit/shortcut-help';
import { bindShortcuts } from './game-kit/shortcuts';
import { ShortcutList } from './game-kit/ShortcutList';
import { HelpDialog, HelpRules, type HelpSection } from './HelpDialog';

/** Fases sin partida en juego (o con sus reglas ya a la vista, como la intro): sin «Cómo se juega». */
const PHASES_WITHOUT_HELP: ReadonlySet<RoomPhase> = new Set(['LOBBY', 'GAME_INTRO', 'GAME_RESULTS', 'NEXT_GAME_VOTE', 'NEXT_GAME_VOTE_RESULTS', 'SESSION_RESULTS']);

/** Las reglas del juego en curso, si la sala está en una de sus fases y el manifiesto las trae. */
export function gameHelpRules(room: RoomView): { name: string; rules: string[] } | null {
  if (PHASES_WITHOUT_HELP.has(room.phase)) return null;
  const manifest = activeGameManifest(room);
  return manifest && manifest.howTo.length > 0 ? { name: manifest.name, rules: manifest.howTo } : null;
}

/** Secciones del diálogo de ayuda: «Reglas» si las hay y «Atajos de teclado» si la pantalla tiene alguno. */
export function gameHelpSections(rules: readonly string[] | null, shortcuts: readonly ShortcutEntry[]): HelpSection[] {
  const sections: HelpSection[] = [];
  if (rules && rules.length > 0) sections.push({ id: 'rules', title: 'Reglas', content: <HelpRules rules={rules} /> });
  if (shortcuts.length > 0) sections.push({ id: 'shortcuts', title: 'Atajos de teclado', content: <ShortcutList entries={shortcuts} /> });
  return sections;
}

/** Los atajos de la pantalla actual (los controles visibles con `aria-keyshortcuts` de `main`). */
function currentShortcuts(): ShortcutEntry[] {
  return typeof document === 'undefined' ? [] : screenShortcuts(document.querySelector('main') ?? document);
}

/**
 * «Cómo se juega» (Q2): píldora «?» de la placa de la sala, en todas las pantallas de juego, que abre el diálogo de
 * ayuda con las tres reglas del juego en curso y, si la pantalla tiene atajos, su lista (Q6). La tecla «?» abre el mismo
 * diálogo con el criterio de `shortcuts.ts` (nunca mientras se escribe ni con otro diálogo abierto), y solo si hay
 * reglas o atajos que enseñar. Los atajos se leen al abrir y no cambian mientras está abierto.
 */
export function GameHelpButton({ room }: { room: RoomView }) {
  const help = gameHelpRules(room);
  // `null`: cerrado; abierto, los atajos leídos al abrir (quizá ninguno).
  const [shortcuts, setShortcuts] = useState<ShortcutEntry[] | null>(null);
  const hasRules = useRef(help !== null);
  hasRules.current = help !== null;
  useEffect(() => bindShortcuts(window, (key) => {
    if (key !== HELP_KEY) return false;
    const found = currentShortcuts();
    if (!hasRules.current && found.length === 0) return false;
    setShortcuts(found);
    return true;
  }), []);
  const sections = gameHelpSections(help?.rules ?? null, shortcuts ?? []);
  return <>
    {help && <Pill size="round" variant="ghost" icon={HelpCircle} aria-label="Cómo se juega" title="Cómo se juega" aria-keyshortcuts={HELP_KEY} aria-haspopup="dialog" onClick={() => setShortcuts(currentShortcuts())} />}
    <HelpDialog open={shortcuts !== null && sections.length > 0} title={help ? `Cómo se juega · ${help.name}` : 'Atajos de teclado'} onClose={() => setShortcuts(null)} sections={sections} />
  </>;
}
