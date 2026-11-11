import type { CSSProperties } from 'react';
import { cx } from '../../ui';
import { dexStripLayout } from './dex-strip';
import { formatDexNumber } from './distance-ruler';
import s from './DexStrip.module.css';

/** «#001–151»: un tramo de números de la Pokédex. */
const rangeText = (first: number, last: number) => `${formatDexNumber(first)}–${formatDexNumber(last).slice(1)}`;

/**
 * Pista de la pantalla de Pokédex Distance: solo las generaciones de la partida en una tira, una banda por generación
 * (un corte separa las que no son contiguas) y la chincheta amarilla del objetivo.
 */
export function DexStrip({ target, generations, className }: { target: number | null; generations: readonly number[]; className?: string | undefined }) {
  const { bands, targetPercent, ranges } = dexStripLayout(target, generations);
  const all = bands.length === 9;
  return <figure className={cx(s.strip, className)}>
    <figcaption className={s.caption}>
      <span>{all ? 'Pokédex nacional' : 'Pokédex en juego'}</span>
      <span className={s.range} aria-hidden="true">{ranges.map((range) => rangeText(range.first, range.last)).join(' · ')}</span>
      <span className="sr-only">: generaciones en juego {bands.map((band) => band.generation).join(', ')}.</span>
    </figcaption>
    <div className={s.track} aria-hidden="true">
      {bands.map((band) => <span key={band.generation} className={cx(s.band, s.on, band.gapBefore && s.cut)} style={{ width: `${band.widthPercent}%` }} />)}
      {targetPercent !== null && <span className={s.pin} style={{ '--at': `${targetPercent}%` } as CSSProperties}><span className={s.head} /></span>}
    </div>
    {/* Número de cada generación bajo su banda (la chincheta no lo tapa). */}
    <div className={s.labels} aria-hidden="true">
      {bands.map((band) => <span key={band.generation} className={cx(s.gen, s.genOn)} style={{ width: `${band.widthPercent}%` }} title={`Generación ${band.generation}: ${formatDexNumber(band.first)}–${formatDexNumber(band.last)}`}>
        {band.generation}
        {/* Solo en escritorio grande (CSS): el tramo de números de la generación bajo su número. */}
        <span className={s.genRange}>{rangeText(band.first, band.last)}</span>
      </span>)}
    </div>
  </figure>;
}
