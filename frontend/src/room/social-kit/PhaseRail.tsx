import { Check, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cx, Icon } from '../../ui';
import { phaseIndex } from './presentation';
import s from './PhaseRail.module.css';

/** Un paso de la ronda («Elegir», «Votar», «Resultado»…): `key` es lo que el juego pasa como `current`. */
export interface PhaseStep {
  key: string;
  label: string;
}

export interface PhaseRailProps {
  steps: readonly PhaseStep[];
  /** Clave del paso actual; `null` (o una que no está) no marca ninguno (p. ej. preparando la ronda). */
  current: string | null;
  /** Nombre accesible de la lista. */
  label?: string;
  className?: string | undefined;
}

/**
 * Fases de la ronda en una fila de pasos (spec §9: el color nunca va solo): los pasados llevan ✓ (y «hecho» para los
 * lectores), el actual va en amarillo con contorno, una flecha y `aria-current="step"`, y los que faltan, su número.
 * En el móvil (<640 px) los pasos que no son el actual muestran solo su marca: así caben seis a 390 px con texto de
 * 13 px; su nombre sigue ahí para los lectores.
 */
export function PhaseRail({ steps, current, label = 'Fases de la ronda', className }: PhaseRailProps) {
  const active = phaseIndex(steps, current);
  return <ol className={cx(s.rail, className)} aria-label={label} style={{ '--steps': steps.length } as CSSProperties}>
    {steps.map((step, index) => {
      const state = index === active ? 'current' : active >= 0 && index < active ? 'done' : 'todo';
      return <li key={step.key} className={cx(s.step, s[state])} aria-current={state === 'current' ? 'step' : undefined} data-phase={step.key}>
        <span className={s.mark} aria-hidden="true">
          {state === 'done' ? <Icon icon={Check} size={18} /> : state === 'current' ? <Icon icon={ChevronRight} size={18} /> : index + 1}
        </span>
        <span className={s.label}>{step.label}{state === 'done' && <span className="sr-only"> (hecho)</span>}</span>
      </li>;
    })}
  </ol>;
}
