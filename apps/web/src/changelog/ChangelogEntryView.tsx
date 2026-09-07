import { CHANGELOG_CATEGORIES, CHANGELOG_CATEGORY_LABELS, type ChangelogCategory, type ChangelogEntry } from '@pokemon-universe/shared';
import { Bug, Code2, Gamepad2, Palette, Scale, Sparkles, Wrench } from 'lucide-react';

const categoryIcons = {
  NEW: Sparkles,
  MINIGAMES: Gamepad2,
  BALANCE: Scale,
  INTERFACE: Palette,
  IMPROVEMENTS: Wrench,
  BUGS: Bug,
  TECHNICAL: Code2,
} satisfies Record<ChangelogCategory, typeof Sparkles>;

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

export function ChangelogEntryView({ entry, compact = false }: { entry: ChangelogEntry; compact?: boolean }) {
  const groups = CHANGELOG_CATEGORIES.map((type) => ({ type, changes: entry.content.filter((change) => change.type === type) })).filter((group) => group.changes.length > 0);
  return <article className={compact ? '' : 'border-b border-ink/10 pb-10 last:border-0'}>
    <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className={`font-display font-bold ${compact ? 'text-2xl' : 'text-3xl sm:text-4xl'}`}>v{entry.version}</h2><p className="mt-1 font-extrabold text-ink/80">{entry.title}</p></div>
      <time className="shrink-0 text-sm font-bold text-ink/55" dateTime={entry.date}>{formatChangelogDate(entry.date)}</time>
    </header>
    <div className={compact ? 'mt-5 space-y-5' : 'mt-7 grid gap-x-10 gap-y-7 lg:grid-cols-2'}>
      {groups.map(({ type, changes }) => {
        const Icon = categoryIcons[type];
        return <section key={type} aria-labelledby={`${entry.id}-${type}`}>
          <h3 id={`${entry.id}-${type}`} className="flex items-center gap-2 font-display text-lg font-bold"><span className={`grid h-8 w-8 place-items-center rounded-lg ${categoryTones[type]}`}><Icon size={17} aria-hidden="true" /></span>{CHANGELOG_CATEGORY_LABELS[type]}</h3>
          <ul className="mt-3 space-y-2 pl-5 font-semibold leading-relaxed text-ink/75 marker:text-ink/35">{changes.map((change, index) => <li key={`${type}-${index}`}>{change.text}</li>)}</ul>
        </section>;
      })}
    </div>
  </article>;
}
