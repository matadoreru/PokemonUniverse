import { CLASSIC_MODE_LABEL, gameModeCatalog } from '@pokemon-universe/shared/public';
import { Check } from 'lucide-react';
import { createContext, useContext, useId, type ReactNode } from 'react';
import { Pill, Segmented } from '../ui';
import s from './GameModeField.module.css';

const MODE_LABEL = 'Modo';
const ALLOWED_LABEL = 'Modos que se juegan';

/**
 * Modos que se juegan del juego que se ajusta en la sesión: al azar o por votación cada uno es una opción; por orden
 * (`order`), cada uno ocupa su propio turno en la cola. Sin este contexto el selector es el `Segmented` de un solo modo.
 */
export interface SessionModes {
  gameId: string;
  allowed: readonly string[];
  order: boolean;
  onChange(modes: string[]): void;
}

const SessionModesContext = createContext<SessionModes | null>(null);

export function SessionModesProvider({ value, children }: { value: SessionModes | null; children: ReactNode }) {
  return <SessionModesContext.Provider value={value}>{children}</SessionModesContext.Provider>;
}

/**
 * Si los ajustes propios de `mode` se enseñan: sin contexto de sesión, si es el modo de la configuración; en la sesión,
 * si ese modo está marcado.
 */
export function useModeShown(gameId: string, configMode: string | undefined): (mode: string) => boolean {
  const session = useContext(SessionModesContext);
  if (session && session.gameId === gameId) return (mode) => session.allowed.includes(mode);
  return (mode) => (configMode ?? 'CLASSIC') === mode;
}

/** Los modos marcados tras pulsar `mode`, en el orden del catálogo; `null` si dejaría la lista vacía. */
export function toggleAllowedMode(catalogModes: readonly string[], allowed: readonly string[], mode: string): string[] | null {
  const next = allowed.includes(mode) ? allowed.filter((value) => value !== mode) : [...allowed, mode];
  return next.length ? catalogModes.filter((value) => next.includes(value)) : null;
}

interface Props {
  gameId: string;
  /** El `mode` de la configuración; ausente (configuración anterior a los modos) es `CLASSIC`. */
  value: string | undefined;
  onChange(mode: string): void;
  disabled: boolean;
}

/**
 * Selector «Modo» de los ajustes de un juego con modos y, debajo, la línea que explica las reglas del modo nuevo. Sin
 * contexto de sesión, un `Segmented` con «Clásico» y el modo nuevo (en la sala no se ve: el lobby siempre da el contexto;
 * queda para un panel de ajustes fuera de la sala y para el `ConfigPanel` suelto de cada juego); en la sesión (`SessionModesProvider`, las tres
 * formas de elegir), píldoras conmutadoras «Modos que se juegan» como las de las generaciones: no se puede desmarcar el
 * último. Sin catálogo de modos para `gameId` no pinta nada.
 */
export function GameModeField({ gameId, value, onChange, disabled }: Props) {
  const session = useContext(SessionModesContext);
  const labelId = useId();
  const catalog = gameModeCatalog(gameId);
  if (!catalog) return null;
  const label = (option: string) => catalog.labels[option] ?? CLASSIC_MODE_LABEL;
  if (session && session.gameId === gameId) {
    const allowed = catalog.modes.filter((mode) => session.allowed.includes(mode));
    const texts = allowed.map((mode) => catalog.texts[mode]).filter((text): text is string => Boolean(text));
    return <div className={s.field} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={s.label}>{ALLOWED_LABEL}</span>
      <div className={s.options}>
        {catalog.modes.map((mode) => {
          const active = allowed.includes(mode);
          const last = active && allowed.length === 1;
          return <Pill key={mode} size="small" block variant={active ? 'yellow' : 'cream'} aria-pressed={active} disabled={disabled || last}
            {...(active ? { icon: Check } : {})} {...(last ? { title: 'Siempre queda al menos un modo marcado.' } : {})}
            onClick={() => { const next = toggleAllowedMode(catalog.modes, allowed, mode); if (next) session.onChange(next); }}>{label(mode)}</Pill>;
        })}
      </div>
      <p className={s.text}>{session.order
        ? 'Cada modo marcado ocupa su propio turno en la cola, seguidos y en este orden; siempre queda al menos uno.'
        : 'Cada modo marcado es una opción más al azar y en la votación; siempre queda al menos uno.'}</p>
      {texts.map((text) => <p key={text} className={s.text}>{text}</p>)}
    </div>;
  }
  const mode = value !== undefined && catalog.modes.includes(value) ? value : 'CLASSIC';
  const options = catalog.modes.map((option) => ({ value: option, label: label(option), disabled }));
  const text = catalog.texts[mode];
  return <div className={s.field}>
    <span className={s.label} aria-hidden="true">{MODE_LABEL}</span>
    <Segmented<string> label={MODE_LABEL} value={mode} options={options} onChange={onChange} />
    {text && <p className={s.text}>{text}</p>}
  </div>;
}
