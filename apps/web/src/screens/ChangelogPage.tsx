import { ArrowLeft, Newspaper } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChangelogEntryView } from '../changelog/ChangelogEntryView';
import { useChangelog } from '../changelog/ChangelogContext';

export function ChangelogPage() {
  const { entries, loading, error, markAllRead, refresh } = useChangelog();
  useEffect(() => { if (!loading && entries.length) markAllRead(); }, [entries.length, loading, markAllRead]);

  return <section className="page-shell max-w-5xl">
    <Link className="mb-7 inline-flex min-h-11 items-center gap-2 font-extrabold text-ink/65 underline decoration-ink/25 underline-offset-4 hover:text-ink" to="/"><ArrowLeft size={18} />Volver al inicio</Link>
    <header className="mb-10 max-w-3xl"><h1 className="font-display text-4xl font-bold tracking-[-.025em] sm:text-5xl">Novedades de Pokémon Universe</h1><p className="mt-4 max-w-[68ch] text-lg font-semibold leading-relaxed text-ink/65">Nuevos minijuegos, ajustes de balance, mejoras y correcciones publicados en cada versión.</p></header>
    {error ? <div className="status-error flex flex-wrap items-center justify-between gap-3" role="alert"><span>{error}</span><button className="btn-ghost text-sm" onClick={() => void refresh()}>Volver a intentar</button></div>
      : loading ? <div className="space-y-8" role="status" aria-label="Cargando novedades">{Array.from({ length: 2 }, (_, index) => <div className="space-y-4 border-b border-ink/10 pb-8" key={index}><span className="skeleton block h-9 w-32" /><span className="skeleton block h-5 w-64" /><span className="skeleton block h-24 w-full" /></div>)}</div>
        : entries.length === 0 ? <div className="empty-state py-14"><Newspaper className="mx-auto mb-3 text-aqua" size={32} /><h2 className="font-display text-2xl font-bold text-ink">Todavía no hay notas publicadas</h2><p className="mx-auto mt-2 max-w-lg font-semibold">Las próximas versiones aparecerán aquí en cuanto estén listas.</p></div>
          : <div className="space-y-10">{entries.map((entry) => <ChangelogEntryView entry={entry} key={entry.id} />)}</div>}
  </section>;
}
