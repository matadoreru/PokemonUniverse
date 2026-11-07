import { formatDailyDate, formatDailyPoints, type RoomView } from '@pokemon-universe/shared/public';
import { DoorOpen, Share2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRoom } from '../room/RoomContext';
import { cx, Panel, Pill, Screen, ScreenHeader, StateBox } from '../ui';
import tone from '../styles/tones.module.css';
import { DailyLeaderboard } from './DailyLeaderboard';
import { dailyResultDetail, dailyResultText, shareDailyResult, type DailyResultInput } from './daily-state';

export interface DailyResultSummaryProps extends DailyResultInput {
  /** Texto de la región viva («Resultado copiado»); vacía, sigue montada. */
  announcement: string;
  onShare(): void;
  /** Acciones bajo «Compartir» («Volver a Jugar»). */
  children?: ReactNode;
}

/**
 * El resultado propio del reto: la puntuación grande, los aciertos sobre el total, la línea de emojis y «Compartir». Lleva
 * la única región viva de la pantalla (`role="status"`, siempre montada) para anunciar lo que pasa al compartir.
 */
export function DailyResultSummary({ gameId, date, roundCount, result, announcement, onShare, children }: DailyResultSummaryProps) {
  const detail = dailyResultDetail({ gameId, date, roundCount, result });
  return (
    <Panel variant="cream" title="Tu resultado" aria-label="Tu resultado">
      <div className="flex flex-col items-center gap-3 px-1 pb-1 pt-2 text-center 2xl:gap-5 2xl:px-3 2xl:pb-3 2xl:pt-4">
        <p className={cx('flex items-baseline gap-2 font-display font-extrabold', tone.textNavy)}>
          <span className="text-44 2xl:text-68">{formatDailyPoints(result.score)}</span><span className="text-22">pts</span>
        </p>
        <p className={cx('text-18 font-bold', tone.textInk2)}>{result.correct}/{roundCount} {roundCount === 1 ? 'acierto' : 'aciertos'}</p>
        {detail && <p className={cx('text-22 font-bold tracking-wide', tone.textInk)}>{detail}</p>}
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <Pill variant="yellow" icon={Share2} block onClick={onShare}>Compartir</Pill>
          {children}
        </div>
        <p role="status" className={cx('min-h-5 text-15 font-bold', tone.textInk2)}>{announcement}</p>
      </div>
    </Panel>
  );
}

/** Estado y acción de «Compartir» comunes a la pantalla de resultados y a `/daily`. */
export function useDailyShare(input: DailyResultInput | null) {
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const share = () => {
    const text = input ? dailyResultText(input, window.location.origin) : null;
    if (!text) return;
    void shareDailyResult(text).then((message) => {
      setAnnouncement(message);
      window.clearTimeout(timer.current);
      if (message) timer.current = window.setTimeout(() => setAnnouncement(''), 4_000);
    });
  };
  return { announcement, share };
}

/**
 * Resultados del reto diario (sustituye a los del juego en `GAME_RESULTS`): el título con el juego y la fecha, el
 * resultado propio y la clasificación del día de la partida (la del día en que empezó, aunque ya sea otro), que se vuelve a pedir con `daily:recorded` (la fila se guarda en segundo
 * plano). «Volver a Jugar» cierra la sala (`onLeave`).
 */
export function DailyResultsScreen({ room, onLeave }: { room: RoomView; onLeave(): void }) {
  const { subscribe } = useRoom();
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => subscribe('daily:recorded', () => setRefreshKey((key) => key + 1)), [subscribe]);
  const daily = room.daily;
  const result = daily?.result ?? null;
  const input = daily && result ? { gameId: daily.gameId, date: daily.date, roundCount: daily.roundCount, result } : null;
  const { announcement, share } = useDailyShare(input);
  const gameId = daily?.gameId ?? room.selectedGameId;
  const name = room.availableGames?.find((manifest) => manifest.id === gameId)?.name ?? gameId;
  const leave = <Pill variant="cream" icon={DoorOpen} block onClick={onLeave}>Volver a Jugar</Pill>;
  return (
    <Screen width="wide">
      <ScreenHeader title={`Reto diario · ${name}`} {...(daily ? { subtitle: formatDailyDate(daily.date) } : {})} centerOnMobile />
      <div className="grid w-full gap-6 lg:grid-cols-2">
        {input
          ? <DailyResultSummary {...input} announcement={announcement} onShare={share}>{leave}</DailyResultSummary>
          : <Panel variant="cream" title="Tu resultado" aria-label="Tu resultado">
            <div className="flex flex-col gap-3">
              <StateBox kind="empty" title="Calculando tu resultado…" onCream live={false} />
              {leave}
              <p role="status" className="sr-only">{announcement}</p>
            </div>
          </Panel>}
        <Panel variant="cream" title="Clasificación de hoy" aria-label="Clasificación de hoy" scroll scrollLabel="Clasificación de hoy" className="lg:max-h-96">
          <DailyLeaderboard refreshKey={refreshKey} date={daily?.date} />
        </Panel>
      </div>
    </Screen>
  );
}
