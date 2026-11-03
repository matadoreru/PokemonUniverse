import { higherLowerBars } from './higher-lower-labels';

export interface HigherLowerBarsProps {
  previous: { name: string; value: number };
  current: { name: string; value: number };
}

const fillTone = (leader: 'previous' | 'current' | 'tie', side: 'previous' | 'current') => leader === 'tie' ? 'bg-electric' : leader === side ? 'bg-leaf' : 'bg-ink/30';

/**
 * Barras del revelado: anterior y actual sobre el mayor de los dos. Solo se monta en `ROUND_RESULTS`, cuando el valor
 * del actual ya es público. La longitud la fija el envoltorio (`scaleX` estático) y el relleno crece con `motion-grow-x`:
 * así la animación (que acaba en `scaleX(1)`) no pisa la escala y, con la reducción de movimiento, la barra ya está en su sitio.
 */
export function HigherLowerBars({ previous, current }: HigherLowerBarsProps) {
  const bars = higherLowerBars(previous.value, current.value);
  const rows = [
    { side: 'previous' as const, label: 'Anterior', ...previous, scale: bars.previousScale },
    { side: 'current' as const, label: 'Actual', ...current, scale: bars.currentScale },
  ];
  return <div className="mt-3 grid gap-2.5 text-left" data-testid="higher-lower-bars">
    {rows.map(({ side, label, name, value, scale }) => <div key={side}>
      <div className="mb-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-extrabold" title={`${label}: ${name}`}><span className="text-sm text-ink/70">{label} · </span>{name}</span>
        {side === 'current' && <span className={`chip tabular-nums ${bars.leader === 'tie' ? '!bg-electric/20' : bars.leader === 'current' ? '!bg-leaf/15' : ''}`} aria-label={`Diferencia ${bars.diffLabel}`}>{bars.diffLabel}</span>}
        <strong className="font-display text-xl tabular-nums">{value}</strong>
      </div>
      <div className="timer-track h-3 overflow-hidden rounded-full">
        <div className="h-full origin-left" style={{ transform: `scaleX(${scale})` }}>
          <div data-bar={side} className={`h-full w-full motion-grow-x ${fillTone(bars.leader, side)}`} />
        </div>
      </div>
    </div>)}
  </div>;
}
