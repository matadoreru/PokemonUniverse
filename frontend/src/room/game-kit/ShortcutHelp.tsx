import { useEffect, useState } from 'react';
import { Dialog, Kbd } from '../../ui';
import { HELP_KEY, keyLabel, screenShortcuts, type ShortcutEntry } from './shortcut-help';
import { bindShortcuts } from './shortcuts';
import s from './ShortcutHelp.module.css';

/** Las teclas de una fila: «A o 1». */
function Keys({ keys }: { keys: readonly string[] }) {
  return <span className={s.keys}>{keys.map((key, index) => <span key={key} className={s.key}>{index > 0 && <span className={s.or}>o</span>}<Kbd>{keyLabel(key)}</Kbd></span>)}</span>;
}

/** Lista de atajos (sin estado): una fila por control y, al final, la propia tecla de la ayuda. */
export function ShortcutList({ entries }: { entries: readonly ShortcutEntry[] }) {
  return <ul className={s.list} aria-label="Atajos de esta pantalla">
    {entries.map((entry) => <li key={`${entry.keys.join(' ')}|${entry.label}`} className={s.row}><Keys keys={entry.keys} /><span className={s.label}>{entry.label}</span></li>)}
    <li className={s.row}><Keys keys={[HELP_KEY]} /><span className={s.label}>Esta ayuda</span></li>
  </ul>;
}

/**
 * Ayuda de atajos (Q6): la tecla «?» abre un diálogo con los atajos de la pantalla actual, solo si la pantalla tiene
 * alguno (los controles visibles con `aria-keyshortcuts` dentro de `main`). Sigue el criterio de `shortcuts.ts`: no
 * actúa mientras se escribe en un campo ni con el foco en otro diálogo. La lista se lee al abrir y no cambia mientras
 * está abierta. Sin región viva propia.
 */
export function ShortcutHelp() {
  const [entries, setEntries] = useState<ShortcutEntry[] | null>(null);
  useEffect(() => bindShortcuts(window, (key) => {
    if (key !== HELP_KEY) return false;
    const found = screenShortcuts(document.querySelector('main') ?? document);
    if (found.length === 0) return false;
    setEntries(found);
    return true;
  }), []);
  return <Dialog open={entries !== null} title="Atajos de teclado" onClose={() => setEntries(null)} actions={[{ label: 'Cerrar', variant: 'ghost', onClick: () => undefined, autoFocus: true }]}>
    {entries && <ShortcutList entries={entries} />}
  </Dialog>;
}
