import { isSessionComplete, type RoomView } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Flame, RotateCcw, StopCircle } from 'lucide-react';
import { useRemainingMs, useServerOffset } from '../../hooks/useServerTime';
import { Badge, cx, Icon, Panel, Pill, timerSeconds } from '../../ui';
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

/**
 * Lo de la sala que usan las acciones: si la sesión ya ha terminado (el texto de «Continuar»), si la partida valió doble
 * (`sessionHistory`) y cuándo sigue sola (`resultsEndsAt`, en el reloj de `serverNow`).
 */
export type ResultsSession = Pick<RoomView, 'sessionMode' | 'gamesPlayed' | 'sessionStandings'> & Partial<Pick<RoomView, 'sessionHistory' | 'resultsEndsAt' | 'serverNow'>>;

/** La partida que acaba de terminar valió doble: lo dice el servidor en su entrada del historial de la sesión. */
export function resultsCountedDouble(room: ResultsSession): boolean {
  const last = room.sessionHistory?.at(-1);
  return last !== undefined && last.gameNumber === room.gamesPlayed && last.pointsMultiplier === 2;
}

/** Texto de la cuenta atrás hasta que la sesión sigue sola. */
export function resultsCountdownText(seconds: number): string {
  return seconds > 0 ? `Siguiente partida en ${seconds} s` : 'Empieza la siguiente partida…';
}

/** Cuenta atrás visible (sin región viva: cambia cada segundo) hasta que la sesión sigue sola; nada si no sigue sola. */
function ResultsCountdown({ endsAt, serverNow }: { endsAt: number | null; serverNow: number }) {
  const offset = useServerOffset(serverNow);
  const remainingMs = useRemainingMs(endsAt, offset, 250);
  if (endsAt === null) return null;
  return <p className={s.countdown} role="timer" data-testid="results-countdown">{resultsCountdownText(timerSeconds(endsAt, endsAt - remainingMs))}</p>;
}

/** Texto de la acción del host tras una partida: «Ver clasificación final» si la sesión ha terminado. */
export function resultsContinueLabel(room: ResultsSession): string {
  return isSessionComplete(room.sessionMode, room.gamesPlayed, room.sessionStandings.map((standing) => standing.sessionPoints))
    ? 'Ver clasificación final'
    : 'Continuar sesión';
}

/**
 * Acciones de `ResultsShell`: «Continuar sesión» («Ver clasificación final» si la sesión ha terminado, igual en todos
 * los juegos) y «Terminar sesión» para el host; para el resto, la espera. Si queda sesión, todos ven la cuenta atrás
 * hasta que sigue sola, y si la partida valió doble, la insignia.
 */
export function ResultsHostActions({ room, host, onLobby, onEnd, waitingText = 'Esperando al host…' }: { room: ResultsSession; host: boolean; onLobby(): void; onEnd(): void; waitingText?: string }) {
  const doubled = resultsCountedDouble(room) && <Badge><Icon icon={Flame} size={18} />Última partida: vale doble</Badge>;
  const countdown = <ResultsCountdown endsAt={room.resultsEndsAt ?? null} serverNow={room.serverNow ?? 0} />;
  return host
    ? <>{doubled}{countdown}<Pill variant="yellow" icon={RotateCcw} onClick={onLobby}>{resultsContinueLabel(room)}</Pill><Pill variant="ghost" icon={StopCircle} onClick={onEnd}>Terminar sesión</Pill></>
    : <>{doubled}<p className={s.waiting}>{waitingText}</p>{countdown}</>;
}
