import { formatDailyPoints, type AvatarRef } from '@pokemon-universe/shared/public';
import { useEffect, useState } from 'react';
import { pollWhileSaving } from './daily-state';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import type { DailyLeaderboardResponse } from '../lib/api-contract';
import { Row, StateBox } from '../ui';
import { fetchDailyLeaderboard, PLAY_FIRST } from './daily-api';

export interface DailyLeaderboardViewProps {
  data: DailyLeaderboardResponse | null;
  /** Mensaje del fallo de la petición; `PLAY_FIRST` (`403`) es que la fila propia aún no existe. */
  error: string | null;
  self: { id: string; name: string; avatar?: AvatarRef | undefined };
  /** Agotados los reintentos sin que llegue la fila propia guardada. */
  gaveUp?: boolean;
  onRetry?(): void;
}

/** ¿Falta la fila propia guardada? Sigue en curso, o el `403` de antes de la primera escritura. */
export function leaderboardSaving(data: DailyLeaderboardResponse | null, error: string | null): boolean {
  return error === PLAY_FIRST || data?.me.status === 'IN_PROGRESS';
}

interface Line { key: string; position: number; name: string; avatar?: AvatarRef | undefined; score: number; correct: number; self: boolean }

/**
 * Las filas de la clasificación de hoy. La propia va marcada (`self` y «(tú)»: el color nunca va solo) y, si queda fuera de
 * las primeras, se añade al final con su puesto.
 */
function lines(data: DailyLeaderboardResponse, self: DailyLeaderboardViewProps['self']): Line[] {
  const rows: Line[] = data.entries.map((entry) => ({ key: entry.userId, position: entry.position, name: entry.username, avatar: entry.avatar, score: entry.score, correct: entry.correct, self: entry.userId === self.id }));
  const { me } = data;
  if (me.status === 'FINISHED' && me.position != null && me.score != null && !rows.some((row) => row.self)) {
    rows.push({ key: self.id, position: me.position, name: self.name, avatar: self.avatar, score: me.score, correct: me.correct ?? 0, self: true });
  }
  return rows;
}

/**
 * Clasificación sin estado (las pruebas la pintan con datos). Sin región viva propia: la pantalla que la contiene tiene
 * la suya. Mientras la fila propia no está guardada (sigue en curso, o el `403` de antes de la primera escritura),
 * «Guardando tu resultado…».
 */
export function DailyLeaderboardView({ data, error, self, gaveUp = false, onRetry }: DailyLeaderboardViewProps) {
  const pending = leaderboardSaving(data, error);
  const saving = pending && !gaveUp;
  const retry = onRetry ? { action: { label: 'Reintentar', onClick: onRetry } } : {};
  if (error && !pending) return <StateBox kind="empty" title="No se pudo cargar la clasificación" text="Vuelve a intentarlo en unos segundos." onCream live={false} {...retry} />;
  if (!data && !saving) return <StateBox kind="loading" title="Cargando la clasificación" onCream live={false} />;
  const rows = data ? lines(data, self) : [];
  return (
    <div className="flex flex-col gap-2">
      {saving && <StateBox kind="empty" title="Guardando tu resultado…" onCream live={false} />}
      {pending && gaveUp && <StateBox kind="empty" title="No se pudo guardar tu resultado" text="Puede que tarde un poco más. Vuelve a mirarlo en un momento." onCream live={false} {...retry} />}
      {data && rows.length === 0 && !pending && <StateBox kind="empty" title="Nadie ha terminado el reto todavía" onCream live={false} />}
      {rows.map((row) => (
        <Row key={row.key} rank={row.position} self={row.self} name={row.self ? `${row.name} (tú)` : row.name}
          avatar={<Avatar name={row.name} avatar={row.avatar} size="sm" />}
          meta={`${row.correct} ${row.correct === 1 ? 'acierto' : 'aciertos'}`} value={`${formatDailyPoints(row.score)} pts`} />
      ))}
    </div>
  );
}

/**
 * Clasificación del día por REST: se pide al montar, cada vez que cambia `refreshKey` (`daily:recorded`) y, mientras
 * falta la fila propia guardada, otra vez a los 2, 4 y 8 s (`pollWhileSaving`): el aviso puede no llegar nunca.
 */
export function DailyLeaderboard({ refreshKey }: { refreshKey: number }) {
  const { user } = useAuth();
  const [data, setData] = useState<DailyLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let stop: (() => void) | null = null;
    setGaveUp(false);
    const load = async () => {
      try {
        const body = await fetchDailyLeaderboard(controller.signal);
        if (!controller.signal.aborted) { setData(body); setError(null); }
        return leaderboardSaving(body, null);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Request failed';
        if (!controller.signal.aborted) setError(message);
        return leaderboardSaving(null, message);
      }
    };
    void load().then((saving) => {
      if (saving && !controller.signal.aborted) stop = pollWhileSaving(load, () => { if (!controller.signal.aborted) setGaveUp(true); });
    });
    return () => { controller.abort(); stop?.(); };
  }, [refreshKey, attempt]);
  return <DailyLeaderboardView data={data} error={error} self={{ id: user?.id ?? '', name: user?.displayName ?? 'Tú', avatar: user?.avatar }}
    gaveUp={gaveUp} onRetry={() => setAttempt((value) => value + 1)} />;
}
