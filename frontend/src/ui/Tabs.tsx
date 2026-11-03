import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import type { ForcedState } from './cx';
import { Icon } from './Icon';
import s from './Tabs.module.css';

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  badge?: ReactNode;
}

export interface TabsProps<K extends string> {
  items: TabItem<K>[];
  active: K;
  onChange: (k: K) => void;
  /** Nombre accesible de la lista de pestañas. */
  label: string;
  /** Prefijo de los ids: cada pestaña controla `{idBase}-panel-{key}`. */
  idBase: string;
  className?: string;
  /** Solo galería: estado forzado de la pestaña `forcedKey`. */
  forced?: ForcedState;
  forcedKey?: K;
}

/**
 * Teclado de pestañas y grupos de radio: flechas izquierda/derecha circulares, Inicio y Fin; salta las
 * deshabilitadas. Devuelve la clave a la que ir o `null` si la tecla no es de navegación.
 */
export function nextTab<K>(items: { key: K; disabled?: boolean | undefined }[], active: K, key: string): K | null {
  const enabled = items.filter((t) => !t.disabled);
  if (enabled.length === 0) return null;
  if (key === 'Home') return enabled[0]!.key;
  if (key === 'End') return enabled[enabled.length - 1]!.key;
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const i = enabled.findIndex((t) => t.key === active);
  const step = key === 'ArrowRight' ? 1 : -1;
  // Si la activa no está entre las habilitadas, se parte del extremo contrario.
  const from = i === -1 ? (step === 1 ? -1 : 0) : i;
  return enabled[(from + step + enabled.length) % enabled.length]!.key;
}

/** Mueve el foco al hijo `role` que corresponde a la clave dada (por posición entre los hermanos). */
export function focusByIndex(group: HTMLElement, role: string, index: number): void {
  group.querySelectorAll<HTMLElement>(`[role="${role}"]`)[index]?.focus();
}

export function Tabs<K extends string>({ items, active, onChange, label, idBase, className, forced, forcedKey }: TabsProps<K>) {
  const go = (k: K) => {
    if (k === active) return;
    uiSound('tab');
    onChange(k);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = nextTab(items, active, e.key);
    if (k === null) return;
    e.preventDefault();
    go(k);
    focusByIndex(e.currentTarget, 'tab', items.findIndex((t) => t.key === k));
  };
  return (
    <div className={cx(s.tabs, className)} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={`${idBase}-tab-${t.key}`}
          aria-selected={t.key === active}
          aria-controls={`${idBase}-panel-${t.key}`}
          disabled={t.disabled}
          tabIndex={t.key === active ? 0 : -1}
          className={cx(s.tab, t.key === active && s.on, forced && forcedKey === t.key && s[forced])}
          onClick={() => go(t.key)}
        >
          {t.icon && <Icon icon={t.icon} size={18} />}
          <span>{t.label}</span>
          {t.badge != null && <span className={s.badge}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export interface TabPanelProps {
  idBase: string;
  tabKey: string;
  children?: ReactNode;
  className?: string;
}

/** Cuerpo de una pestaña: crema, unido a la lista. */
export function TabPanel({ idBase, tabKey, children, className }: TabPanelProps) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${tabKey}`} aria-labelledby={`${idBase}-tab-${tabKey}`} className={cx(s.panel, className)}>
      {children}
    </div>
  );
}
