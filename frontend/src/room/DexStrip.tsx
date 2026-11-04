import type { CSSProperties } from 'react';
import { cx } from '../ui';
import { dexStripLayout } from './dex-strip';
import { formatDexNumber } from './distance-ruler';
import s from './DexStrip.module.css';

/**
 * Pista de la pantalla de Pokédex Distance: la Pokédex nacional en una tira, una banda por generación (las de la
 * partida en azul, las demás apagadas y tachadas en el texto accesible) y la chincheta amarilla del objetivo.
 */
export function DexStrip({ target, generations, className }: { target: number | null; generations: readonly number[]; className?: string | undefined }) {
  const { bands, targetPercent } = dexStripLayout(target, generations);
  const active = bands.filter((band) => band.active).map((band) => band.generation);
  return <figure className={cx(s.strip, className)}>
    <figcaption className={s.caption}>
      <span>Pokédex nacional</span>
      <span className={s.range} aria-hidden="true">#001 – #1025</span>
      <span className="sr-only">: generaciones en juego {active.join(', ')}.</span>
    </figcaption>
    <div className={s.track} aria-hidden="true">
      {bands.map((band) => <span key={band.generation} className={cx(s.band, band.active && s.on)} style={{ width: `${band.widthPercent}%` }} />)}
      {targetPercent !== null && <span className={s.pin} style={{ '--at': `${targetPercent}%` } as CSSProperties}><span className={s.head} /></span>}
    </div>
    {/* Número de cada generación bajo su banda (la chincheta no lo tapa). */}
    <div className={s.labels} aria-hidden="true">
      {bands.map((band) => <span key={band.generation} className={cx(s.gen, band.active && s.genOn)} style={{ width: `${band.widthPercent}%` }} title={`Generación ${band.generation}: ${formatDexNumber(band.first)}–${formatDexNumber(band.last)}`}>
        {band.generation}
        {/* Solo en escritorio grande (CSS): el tramo de números de la generación bajo su número. */}
        <span className={s.genRange}>{formatDexNumber(band.first)}–{formatDexNumber(band.last).slice(1)}</span>
      </span>)}
    </div>
  </figure>;
}
