import { Kbd } from '../../ui';
import { HELP_KEY, keyLabel, type ShortcutEntry } from './shortcut-help';
import s from './ShortcutList.module.css';

/** Las teclas de una fila: «A o 1». */
function Keys({ keys }: { keys: readonly string[] }) {
  return <span className={s.keys}>{keys.map((key, index) => <span key={key} className={s.key}>{index > 0 && <span className={s.or}>o</span>}<Kbd>{keyLabel(key)}</Kbd></span>)}</span>;
}

/**
 * Lista de atajos de la pantalla (sin estado), la sección «Atajos de teclado» del diálogo de ayuda: una fila por control
 * y, al final, la propia tecla de la ayuda.
 */
export function ShortcutList({ entries }: { entries: readonly ShortcutEntry[] }) {
  return <ul className={s.list} aria-label="Atajos de esta pantalla">
    {entries.map((entry) => <li key={`${entry.keys.join(' ')}|${entry.label}`} className={s.row}><Keys keys={entry.keys} /><span className={s.label}>{entry.label}</span></li>)}
    <li className={s.row}><Keys keys={[HELP_KEY]} /><span className={s.label}>Esta ayuda</span></li>
  </ul>;
}
