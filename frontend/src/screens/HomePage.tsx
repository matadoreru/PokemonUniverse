import type { ChangelogEntry } from '@pokemon-universe/shared/public';
import { Play, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ChangelogEntryView } from '../changelog/ChangelogEntryView';
import { useChangelog } from '../changelog/ChangelogContext';
import { Panel, PillLink, type StateBoxProps } from '../ui';

/** Cambios de la última versión que caben en la portada; el resto está en Novedades. */
const PREVIEW_CHANGES = 8;

export interface HomeNewsProps {
  entries: ChangelogEntry[];
  loading: boolean;
  error: string;
  onRetry(): void;
  className?: string;
}

/**
 * Panel «Lo último en el universo»: la última versión publicada, o su `StateBox` de carga, vacío o error. El error del
 * servidor no se enseña tal cual (puede llegar en inglés, «Failed to fetch»): el texto es fijo y en español.
 */
export function HomeNews({ entries, loading, error, onRetry, className }: HomeNewsProps) {
  const latest = entries[0];
  const status: StateBoxProps | null = error
    ? { kind: 'error', title: 'No se pudieron cargar las novedades', text: 'Comprueba la conexión y vuelve a intentarlo.', action: { label: 'Reintentar', onClick: onRetry } }
    : loading
      ? { kind: 'loading', title: 'Cargando la última versión' }
      : !latest
        ? { kind: 'empty', title: 'Aún no hay novedades', text: 'Las notas de cada versión aparecerán aquí. Mientras tanto, crea una sala e invita a tus amigos a jugar.' }
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
      {latest && <ChangelogEntryView entry={{ ...latest, content: latest.content.slice(0, PREVIEW_CHANGES) }} compact />}
    </Panel>
  );
}

/**
 * Inicio como pantalla de título (spec §6): el logotipo grande y la pila de píldoras a la izquierda (arriba en móvil) y
 * la última versión a la derecha (abajo en móvil), con la línea legal al fondo. En escritorio todo cabe sin scroll: la
 * rejilla ocupa el alto del `main` y el panel de novedades se desplaza por dentro.
 */
export function HomePage() {
  const { user } = useAuth();
  const { entries, loading, error, refresh } = useChangelog();
  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 pb-4 pt-6 sm:px-6 lg:h-full lg:grid-rows-[minmax(0,1fr)_auto] lg:px-8 lg:pt-4">
      <div className="grid gap-8 lg:max-h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-12 lg:self-center 2xl:gap-20">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative aspect-[910/520] w-full max-w-[min(30rem,calc(22dvh*1.75))] overflow-hidden lg:max-w-[min(40rem,calc(34dvh*1.75))]" aria-hidden="true">
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
          <h1 className="ol2 mt-2 font-display text-44 font-extrabold text-[color:var(--white)] lg:text-68">
            Pokémon <span className="inline-block text-[color:var(--yellow)]">Universe</span>
          </h1>
          <nav className="mt-6 flex w-full max-w-[22rem] flex-col gap-3" aria-label="Empezar">
            <PillLink to={user ? '/play' : '/auth'} variant="yellow" size="main" icon={Play} block>Empezar a jugar</PillLink>
            {!user && <PillLink to="/auth?mode=guest" variant="cream" icon={UserRound} block>Entrar como invitado</PillLink>}
          </nav>
        </div>
        <HomeNews entries={entries} loading={loading} error={error} onRetry={() => void refresh()} className="lg:min-h-0" />
      </div>
      <p className="mx-auto max-w-[80ch] text-center text-13 font-bold text-[color:var(--sky-2)]">
        Proyecto fan no afiliado a Nintendo, Game Freak ni The Pokémon Company. Todos los nombres de productos son marcas registradas de sus respectivos dueños.
      </p>
    </div>
  );
}
