import { formatDailyPoints, type AvatarRef } from '@pokemon-universe/shared/public';
import { useEffect, useState } from 'react';
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
export function DailyLeaderboardView({ data, error, self }: DailyLeaderboardViewProps) {
  const saving = error === PLAY_FIRST || data?.me.status === 'IN_PROGRESS';
  if (error && !saving) return <StateBox kind="empty" title="No se pudo cargar la clasificación" text="Vuelve a intentarlo en unos segundos." onCream live={false} />;
  if (!data && !saving) return <StateBox kind="loading" title="Cargando la clasificación" onCream live={false} />;
  const rows = data ? lines(data, self) : [];
  return (
    <div className="flex flex-col gap-2">
      {saving && <StateBox kind="empty" title="Guardando tu resultado…" onCream live={false} />}
      {data && rows.length === 0 && !saving && <StateBox kind="empty" title="Nadie ha terminado el reto todavía" onCream live={false} />}
      {rows.map((row) => (
        <Row key={row.key} rank={row.position} self={row.self} name={row.self ? `${row.name} (tú)` : row.name}
          avatar={<Avatar name={row.name} avatar={row.avatar} size="sm" />}
          meta={`${row.correct} ${row.correct === 1 ? 'acierto' : 'aciertos'}`} value={`${formatDailyPoints(row.score)} pts`} />
      ))}
    </div>
  );
}

/** Clasificación del día por REST: se pide al montar y otra vez cada vez que cambia `refreshKey` (`daily:recorded`). */
export function DailyLeaderboard({ refreshKey }: { refreshKey: number }) {
  const { user } = useAuth();
  const [data, setData] = useState<DailyLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchDailyLeaderboard(controller.signal)
      .then((body) => { if (!controller.signal.aborted) { setData(body); setError(null); } })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Request failed'); });
    return () => controller.abort();
  }, [refreshKey]);
  return <DailyLeaderboardView data={data} error={error} self={{ id: user?.id ?? '', name: user?.displayName ?? 'Tú', avatar: user?.avatar }} />;
}
