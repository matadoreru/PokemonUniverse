import { DAILY_RULE_TEXT, isDailyGameId } from '@pokemon-universe/shared/public';
import { CalendarDays, DoorOpen, Play, Trophy, UserPlus } from 'lucide-react';
import { GameArt } from '../games/GameArt';
import type { DailyOverviewResponse } from '../lib/api-contract';
import { roomErrorMessage } from '../room/roomCode';
import { Chip, cx, Icon, Panel, Pill, PillLink, Row, StateBox } from '../ui';
import tone from '../styles/tones.module.css';
import { countdownText, dailyChipText, dailyPlayersText, dailyRowAction } from './daily-state';

export interface DailyPanelProps {
  /** Invitado: el reto es solo para cuentas registradas. */
  guest: boolean;
  /** `GET /api/daily`; `null` mientras carga (o para el invitado). */
  overview: DailyOverviewResponse | null;
  /** Fallo al cargar el reto (REST). */
  loadError: string | null;
  /** Fallo de «Jugar» (`daily:start`), sin traducir: el panel es su único dueño. */
  playError: unknown;
  busy: boolean;
  disabled: boolean;
  now: number;
  onPlay(): void;
  onReload(): void;
}

function Title({ countdown }: { countdown: string | null }) {
  return <span className="flex flex-col gap-1">
    <span className="flex items-center gap-2"><Icon icon={CalendarDays} size={18} />Reto diario</span>
    {countdown && <span className={cx('text-13 font-bold', tone.textInk2)}>{countdown}</span>}
  </span>;
}

/**
 * Tercer panel de Jugar (spec «Interfaz»): una sola franja con el minijuego de hoy y, debajo, su acción según el estado
 * propio («Jugar», «Volver al reto», «Ver resultado» o «Ver clasificación»). Presentacional: `PlayPage` carga el reto y
 * envía `daily:start`; el error de «Jugar» sale aquí traducido, como el de «Crear sala» en el suyo.
 */
export function DailyPanel({ guest, overview, loadError, playError, busy, disabled, now, onPlay, onReload }: DailyPanelProps) {
  const title = <Title countdown={overview ? countdownText(overview.resetsAt, now) : null} />;
  if (guest) return (
    <Panel variant="cream" title={title} aria-label="Reto diario" bodyClassName="flex flex-col">
      <div className="flex flex-1 flex-col gap-4 px-1 pb-1 pt-2 2xl:gap-5 2xl:px-3 2xl:pb-3 2xl:pt-4">
        <StateBox kind="empty" title="El reto diario es para cuentas registradas" text="Un minijuego al día, el mismo para todos, con su clasificación." onCream live={false} />
        <PillLink to="/auth" variant="yellow" icon={UserPlus} block className="mt-auto">Crear cuenta</PillLink>
      </div>
    </Panel>
  );

  const status = playError != null
    ? { kind: 'error' as const, title: 'No se pudo empezar el reto', text: roomErrorMessage(playError), action: { label: 'Reintentar', onClick: onPlay } }
    : loadError
      ? { kind: 'error' as const, title: 'No se pudo cargar el reto', text: 'Comprueba la conexión e inténtalo de nuevo.', action: { label: 'Reintentar', onClick: onReload } }
      : !overview ? { kind: 'loading' as const, title: 'Cargando el reto de hoy', live: false } : null;

  return (
    <Panel variant="cream" title={title} aria-label="Reto diario" bodyClassName="flex flex-col" status={status}>
      {overview && <DailyRow overview={overview} busy={busy} disabled={disabled} onPlay={onPlay} />}
    </Panel>
  );
}

function DailyRow({ overview, busy, disabled, onPlay }: { overview: DailyOverviewResponse; busy: boolean; disabled: boolean; onPlay(): void }) {
  const action = dailyRowAction(overview);
  const chip = dailyChipText(overview);
  const rule = isDailyGameId(overview.gameId) ? DAILY_RULE_TEXT[overview.gameId] : `${overview.roundCount} rondas`;
  const meta = action === 'play' ? <><span>{rule}</span><span>· {dailyPlayersText(overview.players)}</span></> : <span>{rule}</span>;
  return (
    <div className="flex flex-1 flex-col gap-3 px-1 pb-1 pt-2 2xl:gap-5 2xl:px-3 2xl:pb-3 2xl:pt-4">
      <p className={cx('text-13 font-extrabold uppercase tracking-wide', tone.textBlueD)}>Hoy toca</p>
      <Row avatar={<GameArt gameId={overview.gameId} />} name={overview.name} meta={meta}
        value={chip ? <Chip tone={action === 'result' ? 'ok' : 'warn'}>{chip}</Chip> : null} />
      <div className="mt-auto">
        {action === 'play' && <Pill variant="yellow" size="main" icon={Play} block loading={busy} disabled={disabled} onClick={onPlay}>Jugar</Pill>}
        {action === 'resume' && <PillLink to="/room" variant="yellow" icon={DoorOpen} block>Volver al reto</PillLink>}
        {action === 'result' && <PillLink to="/daily" variant="blue" icon={Trophy} block>Ver resultado</PillLink>}
        {action === 'leaderboard' && <PillLink to="/daily" variant="blue" icon={Trophy} block>Ver clasificación</PillLink>}
      </div>
    </div>
  );
}
