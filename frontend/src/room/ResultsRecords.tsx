import type { LucideIcon } from 'lucide-react';
import { RotateCcw, StopCircle } from 'lucide-react';
import { cx, Icon, Panel, Pill } from '../ui';
import s from './ResultsRecords.module.css';

/** Un récord de la partida. */
export interface ResultsRecordItem {
  key: string;
  title: string;
  icon: LucideIcon;
  /** Quién lo tiene (empates juntos); `null` si nadie lo consiguió. */
  names: readonly string[] | null;
  /** El valor grande, ya en texto («3», «+12», «75%», «2,4 s»). */
  value: string;
  /** Contexto de la línea de ayuda, sin repetir el número («Pokémon acertados»). */
  unit: string;
  /**
   * El valor va también delante de `unit` en la línea de ayuda («3 aciertos seguidos») y el grande queda solo a la
   * vista (`aria-hidden`), para que el lector no lo lea dos veces.
   */
  valueInHelp?: boolean;
}

/** Récord: quién y el valor grande; la línea de ayuda da el contexto. */
function RecordTile({ title, icon, names, value, unit, valueInHelp = false }: Omit<ResultsRecordItem, 'key'>) {
  const who = names?.join(', ') ?? '';
  return <li className={s.record}>
    <span className={cx(s.recordIcon, names && s.recordIconOn)}><Icon icon={icon} size={24} /></span>
    <div className={s.recordText}>
      <h3 className={s.kicker}>{title}</h3>
      {names
        ? <><strong className={s.recordName} title={who}>{who}</strong><p className={s.help}>{valueInHelp ? `${value} ${unit}` : unit}</p></>
        : <p className={s.help}>Nadie lo consiguió en esta partida.</p>}
    </div>
    {names && <strong className={s.recordValue} {...(valueInHelp ? { 'aria-hidden': true } : {})}>{value}</strong>}
  </li>;
}

/**
 * Récords de la partida (el `aside` de `ResultsShell`): un panel crema con su título (`id` para `aria-labelledby`) y
 * una ficha por récord.
 */
export function ResultsRecords({ id, title = 'Récords de la partida', records }: { id: string; title?: string; records: readonly ResultsRecordItem[] }) {
  return <Panel variant="cream" as="section" aria-labelledby={id} bodyClassName={cx(s.records)}>
    <h2 id={id} className={s.sectionTitle}>{title}</h2>
    <ul className={s.recordList}>{records.map(({ key, ...record }) => <RecordTile key={key} {...record} />)}</ul>
  </Panel>;
}

/** Acciones de `ResultsShell`: «Continuar sesión» y «Terminar sesión» para el host; para el resto, la espera. */
export function ResultsHostActions({ host, onLobby, onEnd, waitingText = 'Esperando al host…' }: { host: boolean; onLobby(): void; onEnd(): void; waitingText?: string }) {
  return host
    ? <><Pill variant="yellow" icon={RotateCcw} onClick={onLobby}>Continuar sesión</Pill><Pill variant="ghost" icon={StopCircle} onClick={onEnd}>Terminar sesión</Pill></>
    : <p className={s.waiting}>{waitingText}</p>;
}
