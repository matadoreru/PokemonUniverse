import type { PublicRoundResult, RoomMemberView } from '@pokemon-universe/shared/public';
import { Check, Equal, UserX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_LANE_GAP, DISTANCE_RULER_CAPTION, distanceMarkerLabel, formatDexNumber, rulerLayout } from './distance-ruler';

/**
 * Separación vertical entre carriles: un marcador entero (sprite + chip), para que nunca se tapen. Los carriles bajos
 * se pintan encima, así el palo de un marcador alto pasa por detrás de sus vecinos.
 */
const LANE_REM = 4;
/** Con más de tres carriles los marcadores pasan a ser solo el chip, con carriles más bajos, para no estirar la regla. */
const COMPACT_LANE_REM = 1.75;
const MAX_FULL_LANES = 3;
/** Ancho máximo de un marcador (el chip de 3 cifras con icono; el sprite mide 40 px): la separación mínima de un carril. */
const MARKER_PX = 48;

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

/**
 * Regla numérica de la revelación: el objetivo en el centro y un sprite por jugador a su distancia, con un chip
 * (✗ si cae, ✓ si acierta exacto, = si empata). La separación mínima de un carril es el ancho de un marcador medido
 * en la página, así que nunca se pisan; hay tantos carriles como hagan falta (con más de tres, solo el chip). Los
 * marcadores entran con `motion-enter-up`; la regla global de reducción de movimiento los deja quietos. Quien no
 * respondió queda fuera de la regla, en una línea aparte.
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
  const target = round.targetPokemon;
  return <figure className="mb-5 rounded-2xl border border-berry/25 bg-berry/10 p-4 sm:p-5" data-testid="distance-ruler">
    <figcaption className="label">{DISTANCE_RULER_CAPTION}</figcaption>
    <div className="px-5 pt-2 sm:px-8">
      <ul ref={lanesRef} aria-label="Respuestas en la regla" className="distance-ruler-lanes" style={{ height: `${lanes * pitch}rem` }}>
        {placed.map((marker, index) => {
          const selection = round.selections[marker.playerId]!;
          const tone = marker.eliminated ? 'bg-berry/15 text-berry' : marker.exact ? 'bg-leaf/15 text-leaf' : marker.tied ? 'bg-electric/20 text-electric' : 'bg-surface text-ink/80';
          const self = marker.playerId === selfId;
          return <li key={marker.playerId} className="distance-ruler-marker" style={{ left: `${marker.offsetPercent}%`, bottom: `${marker.lane * pitch}rem`, zIndex: lanes - marker.lane }}>
            <div className="motion-enter-up flex flex-col items-center gap-0.5" style={{ animationDelay: `${index * 60}ms` }} data-testid="distance-ruler-marker">
              {!compact && <span className={`grid h-10 w-10 place-items-center overflow-hidden rounded-full ${self ? 'bg-aqua/20 ring-2 ring-aqua' : marker.tied ? 'bg-electric/15 ring-2 ring-electric' : 'bg-surface/70'}`}><img src={selection.sprite} alt="" className="h-full w-full scale-150 object-contain [image-rendering:pixelated]" /></span>}
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-extrabold tabular-nums shadow-card ${tone} ${compact && self ? 'ring-2 ring-aqua' : ''}`} aria-hidden="true">
                {marker.eliminated ? <X size={12} strokeWidth={3} /> : marker.exact ? <Check size={12} strokeWidth={3} /> : marker.tied ? <Equal size={12} strokeWidth={3} /> : null}{marker.distance}
              </span>
              <span className="sr-only">{distanceMarkerLabel(nameOf(marker.playerId), marker)}</span>
            </div>
            {marker.lane > 0 && <span className="distance-ruler-stem" style={{ height: `${marker.lane * pitch + 0.25}rem` }} aria-hidden="true" />}
          </li>;
        })}
      </ul>
      <div className="distance-ruler-track mt-1" aria-hidden="true">
        {TICKS.map((tick) => <span key={tick} className="distance-ruler-tick" style={{ left: `${tick}%` }} />)}
        <span className="distance-ruler-tick distance-ruler-tick-target" style={{ left: '50%' }} />
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <span className="text-sm font-extrabold tabular-nums text-ink/60"><span className="sr-only">Borde izquierdo: </span>−{span}</span>
        <div className="flex items-center gap-2">
          <img src={target.sprite} alt={target.name} className="mx-2 h-12 w-12 scale-150 object-contain [image-rendering:pixelated] sm:h-14 sm:w-14" />
          <div className="min-w-0 text-left">
            <span className="block font-display text-2xl font-bold tabular-nums text-berry">{formatDexNumber(target.nationalDexNumber)}</span>
            <strong className="block font-display text-base">{target.name}</strong>
          </div>
        </div>
        <span className="text-right text-sm font-extrabold tabular-nums text-ink/60"><span className="sr-only">Borde derecho: </span>+{span}</span>
      </div>
    </div>
    {missing.length > 0 && <p className="mt-3 flex flex-wrap gap-2">{missing.map((marker) => <span key={marker.playerId} className="chip bg-berry/15 text-berry"><UserX size={15} className="mr-1" />{distanceMarkerLabel(nameOf(marker.playerId), marker)}</span>)}</p>}
  </figure>;
}
