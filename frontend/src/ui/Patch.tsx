import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import { Icon } from './Icon';
import s from './Patch.module.css';

/**
 * Notas de parche (Novedades): portada de versión, tarjeta destacada, título de sección y línea de tiempo.
 * El color de acento marca la categoría de un cambio; nunca va solo, siempre con su nombre escrito.
 */
export type PatchTone = 'ok' | 'yellow' | 'orange' | 'info' | 'blue' | 'red' | 'neutral';

const accent: Record<PatchTone, string> = {
  ok: 'var(--ok)',
  yellow: 'var(--yellow)',
  orange: 'var(--orange)',
  info: 'var(--info)',
  blue: 'var(--blue-l)',
  red: 'var(--red)',
  neutral: 'var(--type-steel)',
};

const accentStyle = (tone: PatchTone) => ({ '--accent': accent[tone] }) as CSSProperties;

export interface PatchHeroProps {
  version: string;
  title: string;
  /** Fecha ya formateada; `dateTime` es la ISO para `<time>`. */
  date: string;
  dateTime: string;
  /** Recuento de cambios ya redactado («7 cambios»). */
  changes: string;
  summary?: string | undefined;
  latest?: boolean;
  /** `h2` en una página, `h3` dentro de un panel (por defecto). */
  headingLevel?: 2 | 3;
  id?: string;
  className?: string;
}

/**
 * Portada de una versión: el ticket amarillo con el número, inclinado como un sello, y a su lado el título, el resumen
 * y los datos. El ticket entra con un golpe de sello (≤ 360 ms, solo transform y opacidad; sin animación con
 * reducción de movimiento). Quien la usa le da `key={version}` para que el sello se repita al cambiar de versión.
 */
export function PatchHero({ version, title, date, dateTime, changes, summary, latest = false, headingLevel = 3, id, className }: PatchHeroProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <header className={cx(s.hero, className)}>
      <p className={s.ticket}>
        <span className={s.ticketLabel}>Parche</span>
        <span className={s.ticketVersion}>{version}</span>
      </p>
      <div className={s.copy}>
        {latest && <span className={s.latest}>Última versión</span>}
        <Heading id={id} className={s.title}>{title}</Heading>
        {summary && <p className={s.summary}>{summary}</p>}
        <p className={s.facts}>
          <time dateTime={dateTime}>{date}</time>
          <span className={s.factCount}>{changes}</span>
        </p>
      </div>
    </header>
  );
}

export interface HighlightCardProps {
  tone: PatchTone;
  icon: LucideIcon;
  /** Nombre de la categoría («Interfaz»). */
  kind: string;
  children: ReactNode;
  /** Compacta: texto de 15 px, para la vista previa de la portada. */
  compact?: boolean;
  className?: string;
}

/** Tarjeta de «Lo destacado»: franja y disco del color de la categoría, su nombre y el cambio. No se pulsa. */
export function HighlightCard({ tone, icon, kind, children, compact = false, className }: HighlightCardProps) {
  return (
    <article className={cx(s.highlight, compact && s.compact, className)} style={accentStyle(tone)}>
      <span className={s.disc}><Icon icon={icon} size={compact ? 18 : 22} /></span>
      <p className={s.kind}>{kind}</p>
      <p className={s.highlightText}>{children}</p>
    </article>
  );
}

export interface SectionRuleProps {
  tone: PatchTone;
  icon: LucideIcon;
  label: string;
  /** Número de elementos de la sección. */
  count?: number;
  id?: string;
  /** `h3` o `h4` (por defecto) según la página. */
  level?: 3 | 4;
}

/** Título de una sección de cambios: barra del color de la categoría, icono, nombre, recuento y una línea hasta el borde. */
export function SectionRule({ tone, icon, label, count, id, level = 4 }: SectionRuleProps) {
  const Heading = `h${level}` as const;
  return (
    <Heading id={id} className={s.rule} style={accentStyle(tone)}>
      <span className={s.ruleIcon}><Icon icon={icon} size={18} /></span>
      <span className={s.ruleLabel}>{label}</span>
      {count != null && <span className={s.ruleCount} aria-label={`${count} ${count === 1 ? 'cambio' : 'cambios'}`}>{count}</span>}
      <span className={s.ruleLine} aria-hidden="true" />
    </Heading>
  );
}

export interface TimelineLinkProps {
  to: string;
  version: string;
  title: string;
  date: string;
  dateTime: string;
  /** Es la versión abierta: punto y placa amarillos, y `aria-current`. */
  current?: boolean;
  /** Insignias a la derecha («Nueva»). */
  children?: ReactNode;
}

/** Una parada de la línea de tiempo: el punto sobre el raíl y la placa, que es el enlace entero. */
export function TimelineLink({ to, version, title, date, dateTime, current = false, children }: TimelineLinkProps) {
  return (
    <li className={cx(s.stop, current && s.current)}>
      <span className={s.dot} aria-hidden="true" />
      <Link to={to} className={s.plate} aria-current={current ? 'true' : undefined} onClick={() => uiSound('tap')}>
        <span className={s.plateText}>
          <span className={s.plateVersion}>v{version}</span>
          <span className={s.plateTitle} title={title}>{title}</span>
          <time className={s.plateDate} dateTime={dateTime}>{date}</time>
        </span>
        {children}
      </Link>
    </li>
  );
}

export interface TimelineProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/** Línea de tiempo de versiones, de la más nueva a la más vieja: un raíl con una parada (`TimelineLink`) por versión. */
export function Timeline({ label, children, className }: TimelineProps) {
  return (
    <nav aria-label={label} className={className}>
      <ol className={s.timeline}>{children}</ol>
    </nav>
  );
}
