import { ArrowLeft, Newspaper } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { changelogEntryId, ChangelogEntryView } from '../changelog/ChangelogEntryView';
import { useChangelog } from '../changelog/ChangelogContext';

export function ChangelogPage() {
  const { entries, loading, error, markAllRead, refresh } = useChangelog();
  useEffect(() => { if (!loading && entries.length) markAllRead(); }, [entries.length, loading, markAllRead]);

  return <section className="page-shell max-w-6xl">
    <Link className="mb-7 inline-flex min-h-11 items-center gap-2 font-extrabold text-ink/65 underline decoration-ink/25 underline-offset-4 hover:text-ink" to="/"><ArrowLeft size={18} />Volver al inicio</Link>
    <header className="mb-9 max-w-3xl"><h1 className="font-display text-4xl font-bold tracking-[-.025em] sm:text-5xl">Novedades de Pokémon Universe</h1><p className="mt-4 max-w-[68ch] text-lg font-semibold leading-relaxed text-ink/65">Descubre de un vistazo qué ha cambiado en cada versión: nuevos minijuegos, ajustes, mejoras y correcciones.</p></header>
    {error ? <div className="status-error flex flex-wrap items-center justify-between gap-3" role="alert"><span>{error}</span><button className="btn-ghost text-sm" onClick={() => void refresh()}>Volver a intentar</button></div>
      : loading ? <div className="space-y-8" role="status" aria-label="Cargando novedades">{Array.from({ length: 2 }, (_, index) => <div className="space-y-4 border-b border-ink/10 pb-8" key={index}><span className="skeleton block h-9 w-32" /><span className="skeleton block h-5 w-64" /><span className="skeleton block h-24 w-full" /></div>)}</div>
        : entries.length === 0 ? <div className="empty-state py-14"><Newspaper className="mx-auto mb-3 text-aqua" size={32} /><h2 className="font-display text-2xl font-bold text-ink">Todavía no hay notas publicadas</h2><p className="mx-auto mt-2 max-w-lg font-semibold">Las próximas versiones aparecerán aquí en cuanto estén listas.</p></div>
          : <><nav className="mb-12 flex flex-col gap-3 border-y border-ink/10 py-4 sm:flex-row sm:items-center" aria-label="Versiones publicadas"><strong className="shrink-0 text-sm font-extrabold text-ink/60">Ir a una versión</strong><div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">{entries.map((entry, index) => <a className={`inline-flex min-h-10 shrink-0 items-center rounded-xl px-3 text-sm font-extrabold no-underline transition-colors ${index === 0 ? 'bg-berry text-white hover:bg-berry/90' : 'bg-ink/[.07] text-ink/70 hover:bg-ink/[.12] hover:text-ink'}`} href={`#${changelogEntryId(entry)}`} key={entry.id}>v{entry.version}</a>)}</div></nav><div className="space-y-12">{entries.map((entry, index) => <ChangelogEntryView entry={entry} latest={index === 0} key={entry.id} />)}</div></>}
  </section>;
}
