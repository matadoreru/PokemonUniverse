import type { PublicRoundResult, RoomMemberView } from '@pokemon-universe/shared/public';
import { Check, Equal, UserX, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Chip, cx, Icon } from '../ui';
import { DEFAULT_LANE_GAP, DISTANCE_RULER_CAPTION, distanceMarkerLabel, formatDexNumber, rulerLayout, type RulerMarker } from './distance-ruler';
import { playerColor } from './player-color';
import s from './DistanceRuler.module.css';

/**
 * Separación vertical entre carriles: un marcador entero (sprite + chip), para que nunca se tapen. Los carriles bajos
 * se pintan encima, así el palo de un marcador alto pasa por detrás de sus vecinos.
 */
const LANE_REM = 4.25;
/** Con más de tres carriles los marcadores pasan a ser solo el chip, con carriles más bajos, para no estirar la regla. */
const COMPACT_LANE_REM = 2;
const MAX_FULL_LANES = 3;
/** Ancho máximo de un marcador (el chip de 3 cifras con icono; el sprite mide 44 px): la separación mínima de un carril. */
const MARKER_PX = 56;

/** Ancho en píxeles de la zona de marcadores, para pasar la separación mínima a puntos de la regla. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
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
export function DistanceRuler({ round, members, selfId }: { round: PublicRoundResult; members: readonly RoomMemberView[]; selfId: string }) {
  const [lanesRef, lanesWidth] = useElementWidth<HTMLUListElement>();
  const minGap = lanesWidth ? Math.max(DEFAULT_LANE_GAP, MARKER_PX / lanesWidth * 100) : DEFAULT_LANE_GAP;
  const { window: span, markers } = rulerLayout(round, minGap);
  const placed = markers.filter((marker) => marker.dexNumber !== null);
  const missing = markers.filter((marker) => marker.dexNumber === null);
  const lanes = Math.max(0, ...placed.map((marker) => marker.lane)) + 1;
  const compact = lanes > MAX_FULL_LANES;
  const pitch = compact ? COMPACT_LANE_REM : LANE_REM;
  const nameOf = (playerId: string) => members.find((member) => member.id === playerId)?.displayName ?? playerId;
  const colorOf = (playerId: string) => playerColor(Math.max(0, members.findIndex((member) => member.id === playerId)));
  const target = round.targetPokemon;
  return <figure className={s.ruler} data-testid="distance-ruler">
    <figcaption className={s.caption}>{DISTANCE_RULER_CAPTION}</figcaption>
    <div className={s.body}>
      <ul ref={lanesRef} aria-label="Respuestas en la regla" className={s.lanes} style={{ height: `${lanes * pitch}rem` }}>
        {placed.map((marker, index) => {
          const selection = round.selections[marker.playerId]!;
          const tone = markerTone(marker);
          const toneIcon = TONE_ICON[tone];
          const self = marker.playerId === selfId;
          const style = { left: `${marker.offsetPercent}%`, bottom: `${marker.lane * pitch}rem`, zIndex: lanes - marker.lane, '--player': colorOf(marker.playerId) } as CSSProperties;
          return <li key={marker.playerId} className={s.marker} style={style} data-tone={tone} data-self={self || undefined}>
            <div className={cx('motion-enter-up', s.markerBody)} style={{ animationDelay: `${index * 60}ms` }} data-testid="distance-ruler-marker">
              {compact
                ? <span className={s.dot} aria-hidden="true" />
                : <span className={cx(s.sprite, self && s.self)} aria-hidden="true"><img src={selection.sprite} alt="" /></span>}
              <span aria-hidden="true"><Chip tone={tone} {...(toneIcon ? { icon: <Icon icon={toneIcon} size={18} /> } : {})}>{marker.distance}</Chip></span>
              <span className="sr-only">{distanceMarkerLabel(nameOf(marker.playerId), marker)}</span>
            </div>
            {marker.lane > 0 && <span className={s.stem} style={{ height: `${marker.lane * pitch + 0.25}rem` }} aria-hidden="true" />}
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
