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

  // Detalle de Novedades, sobre el panel crema: título, fecha y recuento, y los cambios por categoría.
  const entryId = changelogEntryId(entry);
  return <article id={entryId} aria-labelledby={`${entryId}-title`}>
    <header>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 id={`${entryId}-title`} className="min-w-0 font-display text-26 font-extrabold text-[color:var(--ink)] lg:text-34">{entry.title}</h3>
        {latest && <Badge tone="yellow">Última versión</Badge>}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-15 font-bold text-[color:var(--ink-2)]">
        <time dateTime={entry.date}>{formatChangelogDate(entry.date)}</time>
        <span aria-hidden="true">·</span>
        <span>{entry.content.length} {entry.content.length === 1 ? 'cambio' : 'cambios'}</span>
        <span aria-hidden="true">·</span>
        <span>{groups.length} {groups.length === 1 ? 'categoría' : 'categorías'}</span>
      </p>
    </header>
    <div className="mt-6 grid gap-x-8 gap-y-6 2xl:grid-cols-2">
      {groups.map(({ type, changes }) => <section key={type} aria-labelledby={`${entryId}-${type}`}>
        <h4 id={`${entryId}-${type}`} className="flex items-center gap-2">
          <Chip tone={categoryChipTones[type]} icon={<UiIcon icon={categoryIcons[type]} size={18} />}>{CHANGELOG_CATEGORY_LABELS[type]}</Chip>
          <span className="text-13 font-extrabold tabular-nums text-[color:var(--ink-2)]">{changes.length}</span>
        </h4>
        <ul className="mt-3 grid gap-2.5 text-18 font-semibold leading-snug text-[color:var(--ink)]">
          {changes.map((change, index) => <li className="flex gap-3" key={`${type}-${index}`}><span className="mt-[.5em] h-2 w-2 shrink-0 rounded-full border-2 border-[color:var(--navy)] bg-[var(--yellow)]" aria-hidden="true" /><span>{change.text}</span></li>)}
        </ul>
      </section>)}
    </div>
  </article>;
}
