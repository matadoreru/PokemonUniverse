import { formatDailyDate } from '@pokemon-universe/shared/public';
import { Gamepad2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { DailyOverviewResponse } from '../lib/api-contract';
import { Panel, PillLink, Screen, ScreenHeader, StateBox } from '../ui';
import { fetchDailyOverview } from './daily-api';
import { DailyLeaderboard } from './DailyLeaderboard';
import { DailyResultSummary, useDailyShare } from './DailyResultsScreen';

/**
 * `/daily`: el resultado propio del reto de hoy, la clasificación del día y «Compartir», con los datos de REST. Un invitado,
 * o quien aún no ha jugado hoy (o lo tiene en curso), vuelve a Jugar.
 */
export function DailyPage() {
  const { user } = useAuth();
  const registered = user?.kind === 'USER';
  const [overview, setOverview] = useState<DailyOverviewResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!registered) return;
    const controller = new AbortController();
    setFailed(false);
    fetchDailyOverview(controller.signal)
      .then((body) => { if (!controller.signal.aborted) setOverview(body); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [registered, attempt]);
  const result = overview?.status === 'FINISHED' ? overview.result : null;
  const { announcement, share } = useDailyShare(overview && result ? { gameId: overview.gameId, date: overview.date, roundCount: overview.roundCount, result } : null);

  if (!registered) return <Navigate to="/play" replace />;
  if (overview && overview.status !== 'FINISHED' && overview.status !== 'ABANDONED') return <Navigate to="/play" replace />;
  if (!overview) return (
    <Screen width="narrow">
      {failed
        ? <StateBox kind="error" title="No se pudo cargar el reto" text="Comprueba la conexión e inténtalo de nuevo." action={{ label: 'Reintentar', onClick: () => setAttempt((value) => value + 1) }} />
        : <StateBox kind="loading" title="Cargando el reto de hoy" live />}
    </Screen>
  );

  const back = <PillLink to="/play" variant="cream" icon={Gamepad2} block>Volver a Jugar</PillLink>;
  return (
    <Screen width="wide">
      <ScreenHeader title={`Reto diario · ${overview.name}`} subtitle={formatDailyDate(overview.date)} centerOnMobile />
      <div className="grid w-full gap-6 lg:grid-cols-2">
        {result
          ? <DailyResultSummary gameId={overview.gameId} date={overview.date} roundCount={overview.roundCount} result={result} announcement={announcement} onShare={share}>{back}</DailyResultSummary>
          : <Panel variant="cream" title="Tu resultado" aria-label="Tu resultado">
            <div className="flex flex-col gap-3">
              <StateBox kind="empty" title="Abandonaste el reto de hoy" text="Cuenta como jugado y no entra en la clasificación. Mañana hay otro." onCream live={false} />
              {back}
              {/* La región viva de la pantalla, siempre montada (aquí no hay nada que compartir). */}
              <p role="status" className="sr-only">{announcement}</p>
            </div>
          </Panel>}
        <Panel variant="cream" title="Clasificación de hoy" aria-label="Clasificación de hoy" scroll scrollLabel="Clasificación de hoy" className="lg:max-h-96">
          <DailyLeaderboard refreshKey={0} />
        </Panel>
      </div>
    </Screen>
  );
}
