import { Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';
import { Chip, cx, Icon } from '../../ui';
import s from './GuessHints.module.css';

/** Una pista adicional ya visible. */
export interface GuessHint {
  key: string;
  /** Texto de la pista («Generación 4», «Uno de sus tipos es Fuego»); el color nunca va solo. */
  label: ReactNode;
  /** Icono propio (por defecto, la bombilla). */
  icon?: ReactNode;
}

/**
 * Pistas adicionales bajo la pista principal: una franja con «Pistas» y un `Chip` por pista (la última entra con
 * `motion-enter-up`). A la derecha, opcionalmente, cuándo llega la siguiente. Sin pistas ni `emptyText`, nada (con las
 * pistas desactivadas no ocupa sitio).
 */
export function GuessHints({ hints, title = 'Pistas', next, emptyText, className }: { hints: readonly GuessHint[]; title?: string; /** Cuándo llega la siguiente (p. ej. un `Chip` «Siguiente pista en 5s»). */ next?: ReactNode; /** Texto mientras no hay ninguna («La primera pista aparecerá durante la ronda.»). */ emptyText?: string; className?: string | undefined }) {
  if (hints.length === 0 && !emptyText) return null;
  return <section className={cx(s.hints, className)} aria-label="Pistas adicionales">
    <h2 className={s.title}><Icon icon={Lightbulb} size={18} />{title}</h2>
    {hints.length > 0
      ? <ul className={s.list}>{hints.map((hint, index) => <li key={hint.key} className={cx(index === hints.length - 1 && 'motion-enter-up')} data-testid="guess-hint">
        <Chip tone="info" icon={hint.icon ?? <Icon icon={Lightbulb} size={18} />}>{hint.label}</Chip>
      </li>)}</ul>
      : <p className={s.empty}>{emptyText}</p>}
    {next && <span className={s.next}>{next}</span>}
  </section>;
}
