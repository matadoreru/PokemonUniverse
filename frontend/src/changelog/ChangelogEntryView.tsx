import { CHANGELOG_CATEGORIES, CHANGELOG_CATEGORY_LABELS, type ChangelogCategory, type ChangelogEntry } from '@pokemon-universe/shared/public';
import { Bug, Code2, Gamepad2, Palette, Scale, Sparkles, Wrench } from 'lucide-react';
import { Badge, Chip, Icon as UiIcon, type ChipProps } from '../ui';

const categoryIcons = {
  NEW: Sparkles,
  MINIGAMES: Gamepad2,
  BALANCE: Scale,
  INTERFACE: Palette,
  IMPROVEMENTS: Wrench,
  BUGS: Bug,
  TECHNICAL: Code2,
} satisfies Record<ChangelogCategory, typeof Sparkles>;

/** Tono del chip de categoría en la vista compacta (Arcade DS). */
const categoryChipTones: Record<ChangelogCategory, NonNullable<ChipProps['tone']>> = {
  NEW: 'ok',
  MINIGAMES: 'info',
  BALANCE: 'warn',
  INTERFACE: 'info',
  IMPROVEMENTS: 'neutral',
  BUGS: 'bad',
  TECHNICAL: 'neutral',
};

const categoryTones: Record<ChangelogCategory, string> = {
  NEW: 'text-electric bg-electric/10',
  MINIGAMES: 'text-aqua bg-aqua/10',
  BALANCE: 'text-leaf bg-leaf/10',
  INTERFACE: 'text-berry bg-berry/10',
  IMPROVEMENTS: 'text-aqua bg-aqua/10',
  BUGS: 'text-berry bg-berry/10',
  TECHNICAL: 'text-ink/70 bg-ink/[.07]',
};

export function formatChangelogDate(value: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

export function changelogEntryId(entry: ChangelogEntry): string {
  return `version-${entry.version.replace(/[^0-9A-Za-z.-]/g, '-')}`;
}

export function ChangelogEntryView({ entry, compact = false, latest = false }: { entry: ChangelogEntry; compact?: boolean; latest?: boolean }) {
  const groups = CHANGELOG_CATEGORIES.map((type) => ({ type, changes: entry.content.filter((change) => change.type === type) })).filter((group) => group.changes.length > 0);
  if (compact) return <article>
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Badge tone="yellow">v{entry.version}</Badge>
      <h3 className="min-w-0 font-display text-22 font-extrabold">{entry.title}</h3>
      <time className="ml-auto text-13 font-extrabold text-[color:var(--sky-2)]" dateTime={entry.date}>{formatChangelogDate(entry.date)}</time>
    </header>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {groups.map(({ type, changes }) => <section key={type} aria-labelledby={`${entry.id}-compact-${type}`}>
        <h4 id={`${entry.id}-compact-${type}`}><Chip tone={categoryChipTones[type]} icon={<UiIcon icon={categoryIcons[type]} size={18} />}>{CHANGELOG_CATEGORY_LABELS[type]}</Chip></h4>
        <ul className="mt-2 grid gap-1.5 text-15">
          {changes.map((change, index) => <li className="flex gap-2" key={`${type}-${index}`}><span className="mt-[.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--yellow)]" aria-hidden="true" /><span>{change.text}</span></li>)}
        </ul>
      </section>)}
    </div>
  </article>;

  const entryId = changelogEntryId(entry);
  return <article id={entryId} className="scroll-mt-24 border-b border-ink/10 pb-12 last:border-0 last:pb-0">
    <header>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-3xl font-bold tracking-[-.025em] sm:text-4xl"><span className="text-ink/45">v{entry.version}</span> · {entry.title}</h2>
        {latest && <span className="inline-flex rounded-full bg-berry/10 px-2.5 py-1 text-xs font-extrabold text-berry">Última versión</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-ink/55">
        <time dateTime={entry.date}>{formatChangelogDate(entry.date)}</time>
        <span aria-hidden="true">·</span>
        <span>{entry.content.length} {entry.content.length === 1 ? 'cambio' : 'cambios'}</span>
        <span aria-hidden="true">·</span>
        <span>{groups.length} {groups.length === 1 ? 'categoría' : 'categorías'}</span>
      </div>
    </header>

    <nav className="mt-5 flex flex-wrap gap-2" aria-label={`Categorías de la versión ${entry.version}`}>
      {groups.map(({ type, changes }) => <a className="chip gap-2 no-underline transition-colors hover:bg-ink/[.12] hover:text-ink" href={`#${entryId}-${type}`} key={type}>{CHANGELOG_CATEGORY_LABELS[type]} <span className="tabular-nums text-ink/45">{changes.length}</span></a>)}
    </nav>

    <div className="mt-9 max-w-5xl space-y-10">
      {groups.map(({ type, changes }) => {
        const Icon = categoryIcons[type];
        return <section className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-8" key={type} aria-labelledby={`${entryId}-${type}`}>
          <h3 id={`${entryId}-${type}`} className="flex scroll-mt-24 items-center gap-2 self-start font-display text-lg font-bold"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${categoryTones[type]}`}><Icon size={18} aria-hidden="true" /></span><span>{CHANGELOG_CATEGORY_LABELS[type]}</span></h3>
          <ul className="divide-y divide-ink/10 border-y border-ink/10">
            {changes.map((change, index) => <li className="flex gap-3 py-3.5 font-semibold leading-relaxed text-ink/75" key={`${type}-${index}`}><span className="mt-[.65rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ink/35" aria-hidden="true" /><span>{change.text}</span></li>)}
          </ul>
        </section>;
      })}
    </div>
  </article>;
}
