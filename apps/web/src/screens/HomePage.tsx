import { ArrowRight, Newspaper, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ChangelogEntryView } from '../changelog/ChangelogEntryView';
import { useChangelog } from '../changelog/ChangelogContext';

export function HomePage() {
  const { user } = useAuth();
  const { entries, loading, error, refresh } = useChangelog();
  const latest = entries[0];
  const preview = latest ? { ...latest, content: latest.content.slice(0, 5) } : null;
  return <section className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8 md:py-12">
    <div className="grid w-full items-center gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)] lg:gap-10">
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl font-bold leading-[1.02] tracking-[-.03em] sm:text-5xl lg:text-6xl">Colección de minijuegos Pokémon, <span className="text-berry">en una sola sala.</span></h1>
        <p className="mt-4 max-w-[65ch] text-lg font-semibold leading-relaxed text-ink/70">Crea una sala privada, invita a tus amigos y juega minijuegos juntos.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="btn-primary" to={user ? '/play' : '/auth'}>{user ? 'Ir a las salas' : 'Empezar a jugar'} <ArrowRight size={20} /></Link>
          {!user && <Link className="btn-ghost" to="/auth?mode=guest">Entrar como invitado</Link>}
        </div>
      </div>
      <figure className="flex min-w-0 justify-center lg:justify-end">
        <img
          src="/logoText.png"
          alt="Pokémon Universe"
          className="h-auto w-full max-w-44 select-none object-contain sm:max-w-56 lg:max-w-[25rem]"
          width="1254"
          height="1254"
          decoding="async"
          fetchPriority="high"
        />
      </figure>
    </div>
    <section className="mt-9 border-t border-ink/10 pt-8" aria-labelledby="home-changelog-title">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="home-changelog-title" className="font-display text-3xl font-bold">Lo último en el universo</h2><p className="mt-1 font-semibold text-ink/60">La versión más reciente, explicada sin rodeos.</p></div>{entries.length > 0 && <Link className="inline-flex min-h-11 items-center gap-2 self-start font-extrabold text-aqua underline decoration-aqua/30 underline-offset-4 hover:text-ink sm:self-auto" to="/changelog">Ver todas las versiones <ArrowRight size={18} /></Link>}</div>
      {error ? <div className="status-error flex flex-wrap items-center justify-between gap-3" role="alert"><span>{error}</span><button className="btn-ghost text-sm" onClick={() => void refresh()}><RefreshCw size={17} />Volver a intentar</button></div>
        : loading ? <div className="panel space-y-4 p-5" role="status" aria-label="Cargando la última versión"><span className="skeleton block h-5 w-28" /><span className="skeleton block h-9 w-48" /><span className="skeleton block h-20 w-full" /></div>
          : preview ? <div className="panel p-5 sm:p-7"><div className="mb-5 flex items-center gap-2 text-sm font-extrabold text-berry"><Newspaper size={18} />Novedades</div><ChangelogEntryView entry={preview} compact /></div>
            : <div className="empty-state"><Newspaper className="mx-auto mb-2 text-aqua" size={28} /><strong className="font-display text-lg text-ink">Próximamente habrá novedades</strong><p className="mt-1 text-sm font-semibold">Las notas de la primera versión aparecerán aquí al publicarse.</p></div>}
    </section>
  </section>;
}
