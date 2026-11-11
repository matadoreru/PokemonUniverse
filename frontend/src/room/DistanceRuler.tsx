import type { PublicRoundResult, RoomMemberView } from '@pokemon-universe/shared/public';
import { Check, Equal, UserX, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Chip, cx, Icon } from '../ui';
import { DEFAULT_LANE_GAP, DISTANCE_RULER_CAPTION, distanceMarkerLabel, formatDexNumber, rulerLayout, type RulerMarker } from './distance-ruler';
import { useRoomMembers } from './room-members';
import s from './DistanceRuler.module.css';

/**
 * Separación vertical entre carriles: un marcador entero (sprite + chip), para que nunca se tapen. Los carriles bajos
 * se pintan encima, así el palo de un marcador alto pasa por detrás de sus vecinos. El paso de carril y el ancho del
 * marcador viven en el CSS (`--lane-full`, `--lane-compact`, `--marker-px`): en escritorio grande crecen con el marcador.
 */
const LANE_VAR = '--lane-full';
/** Con más de tres carriles los marcadores pasan a ser solo el chip, con carriles más bajos, para no estirar la regla. */
const COMPACT_LANE_VAR = '--lane-compact';
const MAX_FULL_LANES = 3;
/** Ancho máximo de un marcador por defecto (el chip de 3 cifras con icono; el sprite mide 44 px): la separación mínima de un carril. */
const MARKER_PX = 56;

/** Ancho en píxeles de la zona de marcadores y el ancho de un marcador (`--marker-px`), para pasar la separación mínima a puntos de la regla. */
function useLanesBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ width: number; marker: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const marker = Number.parseFloat(getComputedStyle(el).getPropertyValue('--marker-px'));
      setBox({ width: el.clientWidth, marker: Number.isFinite(marker) && marker > 0 ? marker : MARKER_PX });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, box] as const;
}
/** Múltiplo del paso de carril, en CSS. */
const laneSpan = (count: number, laneVar: string, extra = '') => `calc(${count} * var(${laneVar})${extra})`;
const TICKS = [0, 25, 75, 100];

/** Tono del chip de un marcador: cae (rojo, ✗), acierto exacto (verde, ✓), empate (aviso, =) o neutro. */
export function markerTone(marker: Pick<RulerMarker, 'eliminated' | 'exact' | 'tied'>): 'bad' | 'ok' | 'warn' | 'neutral' {
  return marker.eliminated ? 'bad' : marker.exact ? 'ok' : marker.tied ? 'warn' : 'neutral';
}
const TONE_ICON = { bad: X, ok: Check, warn: Equal, neutral: null } as const;

/**
 * Regla numérica de la revelación: el objetivo en el centro y un sprite por jugador a su distancia, enmarcado en el
 * color del jugador, con un chip (✗ si cae, ✓ si acierta exacto, = si empata). La separación mínima de un carril es el
 * ancho de un marcador medido en la página, así que nunca se pisan; hay tantos carriles como hagan falta (con más de
 * tres, solo el chip, con la banda del color). Los marcadores entran con `motion-enter-up` (las E2E miran ese nombre);
 * la regla global de reducción de movimiento los deja quietos. Quien no respondió queda fuera, en una línea aparte.
 */
export function DistanceRuler({ round, members, selfId, className }: { round: PublicRoundResult; members: readonly RoomMemberView[]; selfId: string; className?: string | undefined }) {
  const [lanesRef, lanesBox] = useLanesBox<HTMLUListElement>();
  const minGap = lanesBox?.width ? Math.max(DEFAULT_LANE_GAP, lanesBox.marker / lanesBox.width * 100) : DEFAULT_LANE_GAP;
  const { window: span, markers } = rulerLayout(round, minGap);
  const placed = markers.filter((marker) => marker.dexNumber !== null);
  const missing = markers.filter((marker) => marker.dexNumber === null);
  const laneCount = Math.max(0, ...placed.map((marker) => marker.lane)) + 1;
  const compact = laneCount > MAX_FULL_LANES;
  const pitch = compact ? COMPACT_LANE_VAR : LANE_VAR;
  const { nameOf, colorOf } = useRoomMembers({ members });
  const target = round.targetPokemon;
  return <figure className={cx(s.ruler, className)} data-testid="distance-ruler">
    <figcaption className={s.caption}>{DISTANCE_RULER_CAPTION}</figcaption>
    <div className={s.body}>
      <ul ref={lanesRef} aria-label="Respuestas en la regla" className={s.lanes} style={{ height: laneSpan(laneCount, pitch) }}>
        {placed.map((marker, index) => {
          const selection = round.selections[marker.playerId]!;
          const tone = markerTone(marker);
          const toneIcon = TONE_ICON[tone];
          const self = marker.playerId === selfId;
          const style = { left: `${marker.offsetPercent}%`, bottom: laneSpan(marker.lane, pitch), zIndex: laneCount - marker.lane, '--player': colorOf(marker.playerId) } as CSSProperties;
          return <li key={marker.playerId} className={s.marker} style={style} data-tone={tone} data-self={self || undefined}>
            <div className={cx('motion-enter-up', s.markerBody)} style={{ animationDelay: `${index * 60}ms` }} data-testid="distance-ruler-marker">
              {compact
                ? <span className={s.dot} aria-hidden="true" />
                : <span className={cx(s.sprite, self && s.self)} aria-hidden="true"><img src={selection.sprite} alt="" /></span>}
              <span aria-hidden="true"><Chip tone={tone} {...(toneIcon ? { icon: <Icon icon={toneIcon} size={18} /> } : {})}>{marker.distance}</Chip></span>
              <span className="sr-only">{distanceMarkerLabel(nameOf(marker.playerId), marker)}</span>
            </div>
            {marker.lane > 0 && <span className={s.stem} style={{ height: laneSpan(marker.lane, pitch, ' + 0.25rem') }} aria-hidden="true" />}
          </li>;
        })}
      </ul>
      <div className={s.track} aria-hidden="true">
        {TICKS.map((tick) => <span key={tick} className={s.tick} style={{ left: `${tick}%` }} />)}
        <span className={cx(s.tick, s.tickTarget)} style={{ left: '50%' }} />
      </div>
      <div className={s.scale}>
        <span className={s.edge}><span className="sr-only">Borde izquierdo: </span>−{span}</span>
        <div className={s.target}>
          <img src={target.sprite} alt={target.name} className={s.targetSprite} />
          <div className={s.targetText}>
            <span className={cx(s.targetNumber, 'ol')}>{formatDexNumber(target.nationalDexNumber)}</span>
            <strong className={s.targetName}>{target.name}</strong>
          </div>
        </div>
        <span className={cx(s.edge, s.edgeRight)}><span className="sr-only">Borde derecho: </span>+{span}</span>
      </div>
    </div>
    {missing.length > 0 && <p className={s.missing}>{missing.map((marker) => <Chip key={marker.playerId} tone="bad" icon={<Icon icon={UserX} size={18} />}>{distanceMarkerLabel(nameOf(marker.playerId), marker)}</Chip>)}</p>}
  </figure>;
}
