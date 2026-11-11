import type { ChangelogEntry } from '@pokemon-universe/shared/public';
import { MessagesSquare, Play, Plus, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PatchPreview } from '../changelog/ChangelogEntryView';
import { useChangelog } from '../changelog/ChangelogContext';
import { LegalLine } from '../components/LegalLine';
import { cx, Panel, PillAnchor, PillLink, Screen, type StateBoxProps } from '../ui';
import tone from '../styles/tones.module.css';

/** Servidor oficial de Discord de la comunidad. */
export const DISCORD_URL = 'https://discord.gg/8x2qfaDF4';

/** Cambios de la última versión que caben en la portada; el resto está en Novedades. */
const PREVIEW_CHANGES = 8;

export interface HomeNewsProps {
  entries: ChangelogEntry[];
  loading: boolean;
  error: string;
  onRetry(): void;
  /** «Crear sala» del estado vacío (lleva a Jugar). */
  onCreateRoom?: () => void;
  className?: string;
}

/**
 * Panel «Lo último en el universo»: la última versión publicada, o su `StateBox` de carga, vacío o error. El error del
 * servidor no se enseña tal cual (puede llegar en inglés, «Failed to fetch»): el texto es fijo y en español.
 */
export function HomeNews({ entries, loading, error, onRetry, onCreateRoom, className }: HomeNewsProps) {
  const latest = entries[0];
  const status: StateBoxProps | null = error
    ? { kind: 'error', title: 'No se pudieron cargar las novedades', text: 'Comprueba la conexión y vuelve a intentarlo.', action: { label: 'Reintentar', onClick: onRetry } }
    : loading
      ? { kind: 'loading', title: 'Cargando la última versión' }
      : !latest
        ? { kind: 'empty', title: 'Aún no hay novedades', text: 'Las notas de cada versión aparecerán aquí. Mientras tanto, crea una sala e invita a tus amigos a jugar.', ...(onCreateRoom ? { action: { label: 'Crear sala', icon: Plus, onClick: onCreateRoom } } : {}) }
        : null;
  return (
    <Panel
      title="Lo último en el universo"
      aria-label="Lo último en el universo"
      right={latest && !status ? <PillLink to="/changelog" variant="ghost" size="small">Ver todas</PillLink> : undefined}
      status={status}
      scroll
      {...(className ? { className } : {})}
    >
      {latest && <PatchPreview entry={latest} limit={PREVIEW_CHANGES} />}
    </Panel>
  );
}

/**
 * Inicio como pantalla de título (spec §6): el logotipo grande y la pila de píldoras a la izquierda (arriba en móvil) y
 * la última versión a la derecha (abajo en móvil), con la línea legal al fondo. En escritorio todo cabe sin scroll: la
 * rejilla va centrada en el alto del `main` (`Screen`) y el panel de novedades se desplaza por dentro si no cabe.
 */
export function HomePage() {
  const { user } = useAuth();
  const { entries, loading, error, refresh } = useChangelog();
  const navigate = useNavigate();
  return (
    <Screen footer={<LegalLine />}>
      <div className="grid gap-8 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-12 2xl:gap-20">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative aspect-[910/520] w-full max-w-[min(30rem,calc(22dvh*1.75))] shrink-0 overflow-hidden lg:max-w-[min(40rem,calc(29dvh*1.75))]" aria-hidden="true">
            <img
              src="/logoText.png"
              alt=""
              className="absolute left-[-19.8%] top-[-42.3%] w-[137.8%] max-w-none select-none"
              width="1254"
              height="1254"
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <h1 className={cx('ol2 mt-2 font-display text-44 font-extrabold lg:text-68', tone.textWhite)}>
            Pokémon <span className={cx('inline-block', tone.textYellow)}>Universe</span>
          </h1>
          <nav className="mt-6 flex w-full max-w-[22rem] flex-col gap-3 2xl:mt-8 2xl:max-w-[26rem] 2xl:gap-4" aria-label="Empezar">
            <PillLink to={user ? '/play' : '/auth'} variant="yellow" size="main" icon={Play} block>Empezar a jugar</PillLink>
            {!user && <PillLink to="/auth?mode=guest" variant="cream" icon={UserRound} block>Entrar como invitado</PillLink>}
            <PillAnchor href={DISCORD_URL} variant="blue" icon={MessagesSquare} block>Únete al Discord</PillAnchor>
          </nav>
        </div>
        <HomeNews entries={entries} loading={loading} error={error} onRetry={() => void refresh()} onCreateRoom={() => navigate('/play')} className="lg:min-h-0" />
      </div>
    </Screen>
  );
}
