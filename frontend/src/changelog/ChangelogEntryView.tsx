import { CHANGELOG_CATEGORIES, CHANGELOG_CATEGORY_LABELS, type ChangelogChange, type ChangelogCategory, type ChangelogEntry } from '@pokemon-universe/shared/public';
import { cx, Badge, Chip, HighlightCard, Icon as UiIcon, PatchHero, SectionRule } from '../ui';
import tone from '../styles/tones.module.css';
import shape from '../styles/shapes.module.css';
import { changelogCategories } from './categories';

export function formatChangelogDate(value: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

export function changelogEntryId(entry: ChangelogEntry): string {
  return `version-${entry.version.replace(/[^0-9A-Za-z.-]/g, '-')}`;
}

const changesLabel = (n: number) => `${n} ${n === 1 ? 'cambio' : 'cambios'}`;

/** Cambios destacados (en su orden) y el resto agrupado por categoría, sin repetir los destacados. */
export function splitChanges(content: readonly ChangelogChange[]): { highlights: ChangelogChange[]; groups: { type: ChangelogCategory; changes: ChangelogChange[] }[] } {
  const highlights = content.filter((change) => change.highlight === true);
  const rest = content.filter((change) => change.highlight !== true);
  const groups = CHANGELOG_CATEGORIES.map((type) => ({ type, changes: rest.filter((change) => change.type === type) })).filter((group) => group.changes.length > 0);
  return { highlights, groups };
}

function Highlight({ change, compact = false }: { change: ChangelogChange; compact?: boolean }) {
  const category = changelogCategories[change.type];
  return <HighlightCard tone={category.tone} icon={category.icon} kind={CHANGELOG_CATEGORY_LABELS[change.type]} compact={compact}>{change.text}</HighlightCard>;
}

/**
 * Notas de parche de una versión (detalle de Novedades, sobre el panel crema): la portada con el ticket de versión, «Lo
 * destacado» en tarjetas y el resto de cambios por categoría.
 */
export function PatchNotes({ entry, latest = false }: { entry: ChangelogEntry; latest?: boolean }) {
  const entryId = changelogEntryId(entry);
  const { highlights, groups } = splitChanges(entry.content);
  return <article id={entryId} aria-labelledby={`${entryId}-title`} className="grid gap-6 lg:gap-8">
    <PatchHero key={entry.version} id={`${entryId}-title`} version={entry.version} title={entry.title} summary={entry.summary} latest={latest} date={formatChangelogDate(entry.date)} dateTime={entry.date} changes={changesLabel(entry.content.length)} />
    {highlights.length > 0 && <section aria-labelledby={`${entryId}-highlights`} className="grid gap-4">
      <h4 id={`${entryId}-highlights`} className={cx('font-display text-26 font-extrabold', tone.textInk)}>Lo destacado</h4>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">
        {highlights.map((change, index) => <Highlight key={index} change={change} />)}
      </div>
    </section>}
    {groups.length > 0 && <div className="grid gap-x-10 gap-y-8 2xl:grid-cols-2">
      {groups.map(({ type, changes }) => {
        const category = changelogCategories[type];
        return <section key={type} aria-labelledby={`${entryId}-${type}`} className="min-w-0">
          <SectionRule id={`${entryId}-${type}`} tone={category.tone} icon={category.icon} label={CHANGELOG_CATEGORY_LABELS[type]} count={changes.length} />
          <ul className={cx('mt-4 grid gap-3 text-18 font-semibold leading-snug', tone.textInk)}>
            {changes.map((change, index) => <li className="flex gap-3" key={`${type}-${index}`}><span className={cx('mt-[.45em] h-2.5 w-2.5 shrink-0 rotate-45', shape.diamond, tone.borderNavy, tone.bgYellow)} aria-hidden="true" /><span className="min-w-0">{change.text}</span></li>)}
          </ul>
        </section>;
      })}
    </div>}
  </article>;
}

/**
 * Vista previa de la última versión en la portada (sobre el panel azul): cabecera compacta con el resumen, los
 * destacados en tarjetas pequeñas y, hasta `limit` cambios en total, el resto por categoría.
 */
export function PatchPreview({ entry, limit }: { entry: ChangelogEntry; limit: number }) {
  const { highlights, groups } = splitChanges(entry.content);
  let room = Math.max(0, limit - highlights.length);
  const shown = groups.map(({ type, changes }) => {
    const taken = changes.slice(0, room);
    room -= taken.length;
    return { type, changes: taken };
  }).filter((group) => group.changes.length > 0);
  return <article>
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Badge tone="yellow">v{entry.version}</Badge>
      <h3 className="min-w-0 font-display text-22 font-extrabold">{entry.title}</h3>
      <time className={cx('ml-auto text-13 font-extrabold', tone.textSky2)} dateTime={entry.date}>{formatChangelogDate(entry.date)}</time>
    </header>
    {entry.summary && <p className={cx('mt-2 text-15 font-bold', tone.textSky2)}>{entry.summary}</p>}
    {highlights.length > 0 && <div className="mt-4 grid gap-3 xl:grid-cols-2">
      {highlights.map((change, index) => <Highlight key={index} change={change} compact />)}
    </div>}
    {shown.length > 0 && <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {shown.map(({ type, changes }) => {
        const category = changelogCategories[type];
        return <section key={type} aria-labelledby={`${entry.id}-compact-${type}`}>
          <h4 id={`${entry.id}-compact-${type}`}><Chip tone={category.chip} icon={<UiIcon icon={category.icon} size={18} />}>{CHANGELOG_CATEGORY_LABELS[type]}</Chip></h4>
          <ul className="mt-2 grid gap-1.5 text-15">
            {changes.map((change, index) => <li className="flex gap-2" key={`${type}-${index}`}><span className={cx('mt-[.55em] h-1.5 w-1.5 shrink-0', shape.dot, tone.bgYellow)} aria-hidden="true" /><span>{change.text}</span></li>)}
          </ul>
        </section>;
      })}
    </div>}
  </article>;
}
